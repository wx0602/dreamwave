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

function envFlag(value, fallback = false) {
  const normalized = String(value === undefined ? "" : value).trim().toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function clampEnvInt(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

const mysqlUrl = String(process.env.MYSQL_URL || "").trim();
const mysqlHost = String(process.env.MYSQL_HOST || "").trim();
const requestedPersistence = String(process.env.PERSISTENCE_DRIVER || "").trim().toLowerCase();
const persistenceDriver = requestedPersistence || (mysqlUrl || mysqlHost ? "mysql" : "file");

if (!['file', 'mysql'].includes(persistenceDriver)) {
  throw new Error(`PERSISTENCE_DRIVER must be file or mysql; received: ${persistenceDriver}`);
}

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
  authSessionFile: path.join(runtimeDir, "auth-sessions.json"),
  persistence: {
    driver: persistenceDriver,
    isMysql: persistenceDriver === "mysql",
    requireShared: envFlag(process.env.REQUIRE_SHARED_PERSISTENCE, false),
  },
  mysql: {
    url: mysqlUrl,
    host: mysqlHost,
    port: clampEnvInt(process.env.MYSQL_PORT, 3306, 1, 65535),
    user: String(process.env.MYSQL_USER || "root").trim() || "root",
    password: String(process.env.MYSQL_PASSWORD || ""),
    database: String(process.env.MYSQL_DATABASE || "tcb").trim() || "tcb",
    connectionLimit: clampEnvInt(process.env.MYSQL_CONNECTION_LIMIT, 10, 2, 50),
    autoMigrate: envFlag(process.env.MYSQL_AUTO_MIGRATE, true),
  },
  auth: {
    sessionTtlDays: clampEnvInt(process.env.AUTH_SESSION_TTL_DAYS, 30, 1, 365),
  },
  deepseek: {
    enabled: Boolean(deepseekApiKey),
    apiKey: deepseekApiKey,
    baseUrl:
      String(process.env.DEEPSEEK_API_URL || "").trim() ||
      "https://api.deepseek.com/chat/completions",
    model: String(process.env.DEEPSEEK_MODEL || "").trim() || "deepseek-chat",
    timeoutMs: clampEnvInt(process.env.DEEPSEEK_TIMEOUT_MS, 25000, 3000, 60000),
  },
  search: {
    provider: String(process.env.SEARCH_PROVIDER || "brave").trim().toLowerCase() || "brave",
    enabled: Boolean(String(process.env.BRAVE_SEARCH_API_KEY || "").trim()),
    apiKey: String(process.env.BRAVE_SEARCH_API_KEY || "").trim(),
    baseUrl:
      String(process.env.BRAVE_SEARCH_API_URL || "").trim() ||
      "https://api.search.brave.com/res/v1/web/search",
    timeoutMs: clampEnvInt(process.env.SEARCH_TIMEOUT_MS, 6000, 1000, 12000),
    resultCount: clampEnvInt(process.env.SEARCH_RESULT_COUNT, 10, 3, 20),
  },
};
