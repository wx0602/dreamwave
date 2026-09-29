const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aigc-multi-user-"));
process.env.NODE_ENV = "test";
process.env.PERSISTENCE_DRIVER = "file";
process.env.RUNTIME_DIR = runtimeDir;
process.env.HOST = "127.0.0.1";
process.env.PORT = process.env.MULTI_USER_TEST_PORT || "31922";
delete process.env.DEEPSEEK_API_KEY;

const baseUrl = `http://${process.env.HOST}:${process.env.PORT}`;
const { initializeAgentCatalog } = require("../src/constants/roles");
const { createSession } = require("../src/services/sessionService");
const { startServer } = require("../src/app");

function authHeaders(token) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "x-client-id": `test-${token.slice(0, 8)}`,
  };
}

async function api(pathname, token, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: authHeaders(token),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json();
  if (!response.ok || body.success !== true) {
    const error = new Error(body.message || `HTTP ${response.status}`);
    error.statusCode = response.status;
    error.code = body.errorCode || body.code;
    throw error;
  }
  return body.data;
}

async function current(token) {
  return api("/api/sessions/current", token);
}

async function anonymous(pathname, clientId, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: { "content-type": "application/json", "x-client-id": clientId },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { response, body: await response.json() };
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGHUP");
}

async function run() {
  let server;
  try {
    initializeAgentCatalog();
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const userA = await createSession({
      account: `multi-a-${suffix}`, password: "multi-user-password-a", name: "并发用户A",
      goal: "学习 JavaScript", deadline: "14 天后", dailyTime: "1 小时", roleId: "scholar",
    });
    const userB = await createSession({
      account: `multi-b-${suffix}`, password: "multi-user-password-b", name: "并发用户B",
      goal: "学习 Python", deadline: "14 天后", dailyTime: "1 小时", roleId: "traveler",
    });
    assert(userA.sessionToken && userB.sessionToken, "registration must issue independent session tokens");

    server = await startServer();
    const [createdA, createdB] = await Promise.all([
      api("/api/tasks", userA.sessionToken, { method: "POST", body: { title: "A 的私有任务" } }),
      api("/api/tasks", userB.sessionToken, { method: "POST", body: { title: "B 的私有任务" } }),
    ]);
    assert(createdA.state.tasks.some((task) => task.title === "A 的私有任务"));
    assert(createdB.state.tasks.some((task) => task.title === "B 的私有任务"));

    const [stateA, stateB] = await Promise.all([current(userA.sessionToken), current(userB.sessionToken)]);
    assert.strictEqual(stateA.user.nickname, "并发用户A");
    assert.strictEqual(stateB.user.nickname, "并发用户B");
    assert(!stateA.tasks.some((task) => task.title === "B 的私有任务"), "A must not see B data");
    assert(!stateB.tasks.some((task) => task.title === "A 的私有任务"), "B must not see A data");

    const anonymousDraft = await anonymous("/api/goal-drafts", "anonymous-a", {
      method: "POST",
      body: { mode: "PARALLEL", goalProfile: { title: "A 的未登录草稿", durationDays: 7 } },
    });
    assert.strictEqual(anonymousDraft.response.status, 200);
    const stolenDraft = await anonymous(
      `/api/goal-drafts/${encodeURIComponent(anonymousDraft.body.data.draftId)}`,
      "anonymous-b"
    );
    assert.strictEqual(stolenDraft.response.status, 403, "another client must not read an anonymous draft");

    const privateTask = stateA.tasks.find((task) => task.title === "A 的私有任务");
    const duplicateResults = await Promise.allSettled([
      api(`/api/tasks/${encodeURIComponent(privateTask.taskId)}/completion`, userA.sessionToken, { method: "POST", body: {} }),
      api(`/api/tasks/${encodeURIComponent(privateTask.taskId)}/completion`, userA.sessionToken, { method: "POST", body: {} }),
    ]);
    const successfulCompletion = duplicateResults.find((result) => result.status === "fulfilled");
    assert(successfulCompletion, "one completion must succeed");
    const afterDuplicate = await current(userA.sessionToken);
    const completed = afterDuplicate.tasks.find((task) => task.taskId === privateTask.taskId);
    assert(completed && completed.status === "completed");
    assert.strictEqual(
      afterDuplicate.progress.growthValue,
      successfulCompletion.value.state.progress.growthValue,
      "duplicate completion must not grant the reward twice"
    );

    await assert.rejects(() => current("invalid-session-token"), (error) => error.statusCode === 401);

    await close(server);
    server = await startServer();
    const [restartedA, restartedB] = await Promise.all([current(userA.sessionToken), current(userB.sessionToken)]);
    assert(restartedA.tasks.some((task) => task.title === "A 的私有任务"), "A state must survive restart");
    assert(restartedB.tasks.some((task) => task.title === "B 的私有任务"), "B state must survive restart");
    assert(!restartedA.tasks.some((task) => task.title === "B 的私有任务"));

    console.log("Multi-user isolation, idempotency, and restart tests passed.");
  } finally {
    if (server && server.listening) await close(server);
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
