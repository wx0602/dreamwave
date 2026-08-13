const path = require("path");

const backendRoot = path.resolve(__dirname, "..", "..");
const defaultRuntimeDir = path.join(backendRoot, "runtime");
const agentConfigDir = path.join(backendRoot, "config", "agents");

function parsePort(value, fallback) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received: ${value}`);
  }
  return port;
}

function resolveRuntimeDir(value) {
  const configuredPath = String(value || "").trim();
  if (!configuredPath) {
    return defaultRuntimeDir;
  }
  return path.resolve(backendRoot, configuredPath);
}

const runtimeDir = resolveRuntimeDir(process.env.RUNTIME_DIR);
const deepseekApiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();

module.exports = {
  nodeEnv: String(process.env.NODE_ENV || "development").trim(),
  host: String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0",
  port: parsePort(process.env.PORT, 3001),
  backendRoot,
  runtimeDir,
  agentConfigDir,
  roleConfigDir: path.join(agentConfigDir, "roles"),
  skillConfigDir: path.join(agentConfigDir, "skills"),
  agentsDir: path.join(runtimeDir, "agents"),
  accountsDir: path.join(runtimeDir, "accounts"),
  storeFile: path.join(runtimeDir, "session-store.json"),
  accountStoreFile: path.join(runtimeDir, "account-store.json"),
  deepseek: {
    enabled: Boolean(deepseekApiKey),
    apiKey: deepseekApiKey,
    baseUrl:
      String(process.env.DEEPSEEK_API_URL || "").trim() ||
      "https://api.deepseek.com/chat/completions",
    model: String(process.env.DEEPSEEK_MODEL || "").trim() || "deepseek-chat",
  },
};
