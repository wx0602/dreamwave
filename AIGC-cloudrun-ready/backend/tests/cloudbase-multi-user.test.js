const assert = require("assert");
const crypto = require("crypto");

process.env.NODE_ENV = "test";
process.env.PERSISTENCE_DRIVER = "cloudbase";
process.env.REQUIRE_SHARED_PERSISTENCE = "true";
process.env.HOST = "127.0.0.1";
process.env.PORT = process.env.CLOUDBASE_TEST_PORT || "31924";
delete process.env.DEEPSEEK_API_KEY;

const baseUrl = `http://${process.env.HOST}:${process.env.PORT}`;
const { initializeAgentCatalog } = require("../src/constants/roles");
const { createSession } = require("../src/services/sessionService");
const { startServer } = require("../src/app");
const {
  executeRequest,
  initializePersistence,
  closePersistence,
  tokenHash,
} = require("../src/store/requestPersistence");
const { COLLECTIONS, getDatabase } = require("../src/store/cloudbaseDatabase");

function accountId(account) {
  return crypto.createHash("sha256").update(account.toLowerCase(), "utf8").digest("hex");
}

async function api(pathname, token, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      connection: "close",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "x-client-id": options.clientId || "cloudbase-integration",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json();
  if (!response.ok || body.success !== true) {
    const error = new Error(body.message || `HTTP ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return body.data;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGHUP");
  await closePersistence();
}

async function removeDocument(collection, id) {
  try { await getDatabase().collection(collection).doc(id).remove(); } catch (error) { /* best effort */ }
}

async function run() {
  assert(process.env.CLOUDBASE_APIKEY, "CLOUDBASE_APIKEY is required");
  assert(process.env.CLOUDBASE_ENV_ID, "CLOUDBASE_ENV_ID is required");
  initializeAgentCatalog();
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const accountA = `cloud-a-${suffix}`;
  const accountB = `cloud-b-${suffix}`;
  const createdTokens = [];
  const users = [];
  let server;
  try {
    await initializePersistence();
    for (const [account, name, goal, roleId] of [
      [accountA, "云端用户A", "学习 JavaScript", "scholar"],
      [accountB, "云端用户B", "学习 Python", "traveler"],
    ]) {
      const event = await executeRequest({ headers: {}, socket: {} }, {}, () => createSession({
        account, password: "cloudbase-test-password", name, goal,
        deadline: "14 天后", dailyTime: "1 小时", roleId,
      }));
      createdTokens.push(event.sessionToken);
      users.push({ account, token: event.sessionToken });
    }

    server = await startServer();
    await Promise.all([
      api("/api/tasks", users[0].token, { method: "POST", body: { title: "A 的云端私有任务" } }),
      api("/api/tasks", users[1].token, { method: "POST", body: { title: "B 的云端私有任务" } }),
    ]);
    const [stateA, stateB] = await Promise.all([
      api("/api/sessions/current", users[0].token),
      api("/api/sessions/current", users[1].token),
    ]);
    users[0].userId = stateA.user.userId;
    users[1].userId = stateB.user.userId;
    assert.strictEqual(stateA.user.nickname, "云端用户A");
    assert.strictEqual(stateB.user.nickname, "云端用户B");
    assert(stateA.tasks.some((task) => task.title === "A 的云端私有任务"));
    assert(!stateA.tasks.some((task) => task.title === "B 的云端私有任务"));
    assert(stateB.tasks.some((task) => task.title === "B 的云端私有任务"));
    assert(!stateB.tasks.some((task) => task.title === "A 的云端私有任务"));

    await close(server);
    server = await startServer();
    const loginA = await api("/api/session-logins", "", {
      method: "POST", clientId: "fresh-device-a",
      body: { account: accountA, password: "cloudbase-test-password" },
    });
    const loginB = await api("/api/session-logins", "", {
      method: "POST", clientId: "fresh-device-b",
      body: { account: accountB, password: "cloudbase-test-password" },
    });
    createdTokens.push(loginA.sessionToken, loginB.sessionToken);
    assert.strictEqual(loginA.state.user.nickname, "云端用户A");
    assert.strictEqual(loginB.state.user.nickname, "云端用户B");
    assert(loginA.state.tasks.some((task) => task.title === "A 的云端私有任务"));
    assert(!loginA.state.tasks.some((task) => task.title === "B 的云端私有任务"));
    assert(loginB.state.tasks.some((task) => task.title === "B 的云端私有任务"));
    console.log("CloudBase two-user isolation, restart persistence, and fresh-device login tests passed.");
  } finally {
    if (server && server.listening) await close(server);
    const db = getDatabase();
    for (const token of createdTokens.filter(Boolean)) await removeDocument(COLLECTIONS.sessions, tokenHash(token));
    for (const user of users) await removeDocument(COLLECTIONS.states, user.userId);
    await removeDocument(COLLECTIONS.accounts, accountId(accountA));
    await removeDocument(COLLECTIONS.accounts, accountId(accountB));
    if (db) await closePersistence();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
