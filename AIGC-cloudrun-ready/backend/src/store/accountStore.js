const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const { AppError } = require("../lib/errors");
const { getRequestContext } = require("../context/requestContext");
const { tokenHash } = require("./requestPersistence");

function ensureAccountRuntimeDir() {
  fs.mkdirSync(env.runtimeDir, { recursive: true });
  fs.mkdirSync(env.accountsDir, { recursive: true });
}

function loadAccountStore() {
  ensureAccountRuntimeDir();

  if (!fs.existsSync(env.accountStoreFile)) {
    const initialStore = {
      version: 1,
      accounts: [],
    };
    fs.writeFileSync(env.accountStoreFile, JSON.stringify(initialStore, null, 2), "utf8");
    return initialStore;
  }

  const store = JSON.parse(fs.readFileSync(env.accountStoreFile, "utf8"));
  if (!Array.isArray(store.accounts)) {
    store.accounts = [];
  }
  return store;
}

function saveAccountStore(store) {
  ensureAccountRuntimeDir();
  fs.writeFileSync(env.accountStoreFile, JSON.stringify(store, null, 2), "utf8");
}

function normalizeAccount(account) {
  return String(account || "").trim().toLowerCase();
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || ""), "utf8").digest("hex");
}

function scryptPassword(password, salt) {
  return crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
}

function createUserId() {
  return `user-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function getAccountByName(account) {
  const normalized = normalizeAccount(account);
  if (!normalized) {
    return null;
  }

  const store = loadAccountStore();
  return store.accounts.find((entry) => entry.account === normalized) || null;
}

async function assertAccountAvailable(account) {
  const normalized = normalizeAccount(account);
  if (!normalized) {
    throw new Error("缺少登录账号");
  }

  const context = getRequestContext();
  if (context && context.mode === "mysql") {
    const [rows] = await context.connection.execute(
      "SELECT user_id FROM aigc_accounts WHERE account = ? LIMIT 1",
      [normalized]
    );
    if (rows.length) throw new AppError("ACCOUNT_EXISTS", "该账号已存在，请直接登录", 409);
    return;
  }

  if (getAccountByName(normalized)) {
    throw new Error("该账号已存在，请直接登录");
  }
}

async function registerAccount({ account, password, nickname }) {
  const normalized = normalizeAccount(account);
  const trimmedPassword = String(password || "").trim();

  if (!normalized) {
    throw new Error("缺少登录账号");
  }
  if (!trimmedPassword) {
    throw new Error("缺少登录密码");
  }

  const context = getRequestContext();
  if (context && context.mode === "mysql") {
    const userId = createUserId();
    const salt = crypto.randomBytes(16).toString("hex");
    try {
      await context.connection.execute(
        `INSERT INTO aigc_accounts
          (user_id, account, nickname, password_hash, password_salt, password_scheme)
         VALUES (?, ?, ?, ?, ?, 'scrypt-v1')`,
        [userId, normalized, String(nickname || "").trim(), scryptPassword(trimmedPassword, salt), salt]
      );
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        throw new AppError("ACCOUNT_EXISTS", "该账号已存在，请直接登录", 409);
      }
      throw error;
    }
    return {
      userId,
      account: normalized,
      nickname: String(nickname || "").trim(),
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
  }

  const store = loadAccountStore();
  if (store.accounts.some((entry) => entry.account === normalized)) {
    throw new Error("该账号已存在，请直接登录");
  }

  const now = new Date().toISOString();
  const accountRecord = {
    userId: createUserId(),
    account: normalized,
    nickname: String(nickname || "").trim(),
    passwordHash: hashPassword(trimmedPassword),
    createdAt: now,
    lastLoginAt: now,
  };

  store.accounts.push(accountRecord);
  saveAccountStore(store);
  return accountRecord;
}

async function authenticateAccount(account, password) {
  const normalized = normalizeAccount(account);
  const trimmedPassword = String(password || "").trim();

  if (!normalized) {
    throw new Error("请输入登录账号");
  }
  if (!trimmedPassword) {
    throw new Error("请输入登录密码");
  }

  const context = getRequestContext();
  if (context && context.mode === "mysql") {
    const [rows] = await context.connection.execute(
      `SELECT user_id AS userId, account, nickname, password_hash AS passwordHash,
              password_salt AS passwordSalt, password_scheme AS passwordScheme,
              created_at AS createdAt, last_login_at AS lastLoginAt
         FROM aigc_accounts WHERE account = ? LIMIT 1 FOR UPDATE`,
      [normalized]
    );
    const accountRecord = rows[0];
    if (!accountRecord) throw new AppError("AUTH_INVALID", "账号或密码错误", 401);
    const actual = scryptPassword(trimmedPassword, accountRecord.passwordSalt);
    const expected = String(accountRecord.passwordHash || "");
    const matches = actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
    if (!matches) throw new AppError("AUTH_INVALID", "账号或密码错误", 401);
    return accountRecord;
  }

  const accountRecord = getAccountByName(normalized);
  if (!accountRecord) {
    throw new Error("账号不存在");
  }

  if (accountRecord.passwordHash !== hashPassword(trimmedPassword)) {
    throw new Error("账号或密码错误");
  }

  return accountRecord;
}

async function updateLastLoginAt(userId) {
  const context = getRequestContext();
  if (context && context.mode === "mysql") {
    await context.connection.execute(
      "UPDATE aigc_accounts SET last_login_at = CURRENT_TIMESTAMP(3) WHERE user_id = ?",
      [userId]
    );
    return;
  }
  const store = loadAccountStore();
  const accountRecord = store.accounts.find((entry) => entry.userId === userId);
  if (!accountRecord) {
    return;
  }

  accountRecord.lastLoginAt = new Date().toISOString();
  saveAccountStore(store);
}

function getAccountSnapshotPath(userId) {
  return path.join(env.accountsDir, `${userId}.json`);
}

function saveAccountSnapshot({ userId, state, apiKey }) {
  if (!userId || !state) {
    return;
  }

  ensureAccountRuntimeDir();
  const snapshot = {
    userId,
    apiKey: String(apiKey || "").trim(),
    savedAt: new Date().toISOString(),
    state,
  };
  fs.writeFileSync(getAccountSnapshotPath(userId), JSON.stringify(snapshot, null, 2), "utf8");
}

async function loadAccountSnapshot(userId) {
  if (!userId) {
    return null;
  }

  const context = getRequestContext();
  if (context && context.mode === "mysql") {
    const [rows] = await context.connection.execute(
      "SELECT version, state_json AS stateJson, api_key AS apiKey, updated_at AS savedAt FROM aigc_user_states WHERE user_id = ? FOR UPDATE",
      [userId]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      userId,
      version: Number(row.version) || 1,
      apiKey: String(row.apiKey || ""),
      savedAt: row.savedAt,
      state: typeof row.stateJson === "string" ? JSON.parse(row.stateJson) : row.stateJson,
    };
  }

  const snapshotPath = getAccountSnapshotPath(userId);
  if (!fs.existsSync(snapshotPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
}

async function createAuthSession(userId) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.auth.sessionTtlDays * 86400000);
  const context = getRequestContext();
  if (context && context.mode === "mysql") {
    await context.connection.execute(
      "INSERT INTO aigc_auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
      [tokenHash(rawToken), userId, expiresAt]
    );
    return rawToken;
  }
  ensureAccountRuntimeDir();
  let store;
  try { store = JSON.parse(fs.readFileSync(env.authSessionFile, "utf8")); } catch (error) { store = { version: 1, sessions: [] }; }
  const now = Date.now();
  store.sessions = (store.sessions || []).filter((entry) => new Date(entry.expiresAt).getTime() > now);
  store.sessions.push({ tokenHash: tokenHash(rawToken), userId, expiresAt: expiresAt.toISOString() });
  fs.writeFileSync(env.authSessionFile, JSON.stringify(store, null, 2), "utf8");
  return rawToken;
}

module.exports = {
  assertAccountAvailable,
  registerAccount,
  authenticateAccount,
  updateLastLoginAt,
  saveAccountSnapshot,
  loadAccountSnapshot,
  createAuthSession,
};
