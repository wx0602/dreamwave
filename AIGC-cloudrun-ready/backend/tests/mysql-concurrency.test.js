// Opt-in integration test. Creates and removes only its own randomly named database.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

async function worker() {
  const { initializeAgentCatalog } = require('../src/constants/roles');
  const { initializePersistence, closePersistence } = require('../src/store/requestPersistence');
  initializeAgentCatalog();
  await initializePersistence();
  const server = require('../src/app').createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.send({ port: server.address().port });
  process.on('message', async message => {
    if (message !== 'stop') return;
    await new Promise(resolve => server.close(resolve));
    await closePersistence();
    process.disconnect();
  });
}

async function main() {
  assert(process.env.MYSQL_TEST_URL, 'Set MYSQL_TEST_URL to a test MySQL server with CREATE DATABASE permission');
  const mysql = require('mysql2/promise');
  const admin = await mysql.createConnection(process.env.MYSQL_TEST_URL);
  const database = `aigc_test_${crypto.randomBytes(8).toString('hex')}`;
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'aigc-mysql-suite-'));
  const url = new URL(process.env.MYSQL_TEST_URL);
  url.pathname = '/' + database;
  Object.assign(process.env, {
    NODE_ENV: 'test', PERSISTENCE_DRIVER: 'mysql', MYSQL_URL: url.toString(),
    MYSQL_AUTO_MIGRATE: 'true', RUNTIME_DIR: runtime,
    DEEPSEEK_API_KEY: '', BRAVE_SEARCH_API_KEY: '',
  });
  const children = [];
  async function start() {
    const child = fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    children.push(child);
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker startup timed out')), 15000);
      child.once('message', message => { clearTimeout(timer); resolve(message.port); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Worker exited: ${code}`)); });
      child.once('error', reject);
    });
    return { child, base: `http://127.0.0.1:${port}` };
  }
  async function stop(child) {
    if (child.exitCode !== null) return;
    await new Promise(resolve => { child.once('exit', resolve); child.send('stop'); });
  }
  async function api(server, token, route, body) {
    const response = await fetch(server.base + '/api/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    assert(response.ok && result.success, `${route}: HTTP ${response.status}: ${result.message}`);
    return result.data;
  }
  let persistence;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    persistence = require('../src/store/requestPersistence');
    await persistence.initializePersistence();
    require('../src/constants/roles').initializeAgentCatalog();
    const users = [];
    for (let i = 0; i < 20; i++) {
      const account = `load-${i}`;
      const session = await persistence.executeRequest({ headers: {}, socket: {} }, {}, () =>
        require('../src/services/sessionService').createSession({
          account, password: 'test-password', name: account, goal: '学习 JavaScript',
          deadline: '14 天后', dailyTime: '1 小时', roleId: 'scholar',
        }));
      users.push({ account, token: session.sessionToken });
    }
    const servers = [await start(), await start()];
    // Fresh-device login deliberately omits the existing bearer token.
    const login = await api(servers[0], '', 'session-logins', { account: users[0].account, password: 'test-password' });
    assert(login.sessionToken || login.event?.sessionToken, 'Login must issue a token');
    console.log('Fresh-device MySQL login passed.');
    const started = performance.now();
    await Promise.all(users.flatMap((user, i) => Array.from({ length: 2 }, (_, j) =>
      api(servers[(i + j) % 2], user.token, 'tasks', { title: `private-${i}-${j}` }))));
    const durationMs = Math.round(performance.now() - started);
    for (let i = 0; i < users.length; i++) {
      const state = await api(servers[1], users[i].token, 'sessions/current');
      const privateTasks = state.tasks.filter(task => task.title.startsWith('private-'));
      assert.strictEqual(privateTasks.length, 2, 'Concurrent writes must not be lost');
      assert(privateTasks.every(task => task.title.startsWith(`private-${i}-`)), 'Users must remain isolated');
    }
    const state = await api(servers[0], users[0].token, 'sessions/current');
    const task = state.tasks.find(task => task.title === 'private-0-0');
    const completion = await Promise.allSettled(Array.from({ length: 10 }, (_, i) =>
      api(servers[i % 2], users[0].token, `tasks/${task.taskId}/completion`, {})));
    assert.strictEqual(completion.filter(result => result.status === 'fulfilled').length, 1);
    const successful = completion.find(result => result.status === 'fulfilled').value;
    const after = await api(servers[1], users[0].token, 'sessions/current');
    assert.strictEqual(after.progress.growthValue, successful.state.progress.growthValue);
    await Promise.all(servers.map(server => stop(server.child)));
    const restarted = await start();
    for (const user of users) {
      const restored = await api(restarted, user.token, 'sessions/current');
      assert.strictEqual(restored.user.nickname, user.account);
      assert.strictEqual(restored.tasks.filter(task => task.title.startsWith('private-')).length, 2);
    }
    console.log(JSON.stringify({ users: 20, processes: 2, simultaneousWrites: 40, durationMs,
      writesPerSecond: Math.round(40000 / durationMs), duplicateCompletionRequests: 10,
      successfulCompletions: 1, isolation: 'passed', restart: 'passed' }));
  } finally {
    await Promise.all(children.map(stop));
    if (persistence) await persistence.closePersistence();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
    fs.rmSync(runtime, { recursive: true, force: true });
  }
}
(process.argv.includes('--worker') ? worker() : main()).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
