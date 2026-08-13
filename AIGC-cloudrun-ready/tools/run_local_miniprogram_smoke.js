const fs = require("fs");
const os = require("os");
const path = require("path");

const tempRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "aigc-mini-smoke-"));
process.env.NODE_ENV = "test";
process.env.HOST = "127.0.0.1";
process.env.PORT = process.env.SMOKE_PORT || "31921";
process.env.RUNTIME_DIR = tempRuntime;
process.env.SMOKE_BASE_URL = `http://127.0.0.1:${process.env.PORT}`;
delete process.env.DEEPSEEK_API_KEY;

const { startServer } = require("../backend/src/app");
const { run } = require("./smoke_miniprogram_api");

process.removeAllListeners("SIGINT");
process.removeAllListeners("SIGTERM");
process.removeAllListeners("SIGHUP");

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function main() {
  const server = startServer();
  try {
    await run();
  } finally {
    await closeServer(server);
    fs.rmSync(tempRuntime, { recursive: true, force: true });
  }
}

main().catch((error) => {
  try { fs.rmSync(tempRuntime, { recursive: true, force: true }); } catch (cleanupError) { /* no-op */ }
  console.error(error.stack || error.message || error);
  process.exit(1);
});
