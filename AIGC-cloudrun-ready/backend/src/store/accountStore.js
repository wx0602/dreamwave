const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const env = require("../config/env");

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

function assertAccountAvailable(account) {
  const normalized = normalizeAccount(account);
  if (!normalized) {
    throw new Error("缺少登录账号");
  }

  if (getAccountByName(normalized)) {
    throw new Error("该账号已存在，请直接登录");
  }
}

function registerAccount({ account, password, nickname }) {
  const normalized = normalizeAccount(account);
  const trimmedPassword = String(password || "").trim();

  if (!normalized) {
    throw new Error("缺少登录账号");
  }
  if (!trimmedPassword) {
    throw new Error("缺少登录密码");
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

function authenticateAccount(account, password) {
  const normalized = normalizeAccount(account);
  const trimmedPassword = String(password || "").trim();

  if (!normalized) {
    throw new Error("请输入登录账号");
  }
  if (!trimmedPassword) {
    throw new Error("请输入登录密码");
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

function updateLastLoginAt(userId) {
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

function loadAccountSnapshot(userId) {
  if (!userId) {
    return null;
  }

  const snapshotPath = getAccountSnapshotPath(userId);
  if (!fs.existsSync(snapshotPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
}

module.exports = {
  assertAccountAvailable,
  registerAccount,
  authenticateAccount,
  updateLastLoginAt,
  saveAccountSnapshot,
  loadAccountSnapshot,
};
