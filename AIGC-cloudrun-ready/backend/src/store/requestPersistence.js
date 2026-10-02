const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const { AppError } = require("../lib/errors");
const { clone } = require("../utils/clone");
const { runWithRequestContext, requireRequestContext } = require("../context/requestContext");
const { getPool, initializeMysql, closeMysql } = require("./mysqlDatabase");
const {
  COLLECTIONS,
  getDocument,
  setDocument,
  updateDocument,
  initializeCloudbase,
  closeCloudbase,
} = require("./cloudbaseDatabase");

let fileRequestTail = Promise.resolve();

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function parseJson(value, fallback) {
  if (value && typeof value === "object") return clone(value);
  try {
    return JSON.parse(String(value || ""));
  } catch (error) {
    return clone(fallback);
  }
}

function bearerToken(req) {
  const header = String(req.headers.authorization || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function clientIdentity(req) {
  const openId = String(req.headers["x-wx-openid"] || "").trim();
  if (openId) return { clientId: `wx:${openId}`, trustedClient: true };
  const supplied = String(req.headers["x-client-id"] || "").trim();
  if (supplied) return { clientId: `client:${supplied.slice(0, 160)}`, trustedClient: false };
  const address = String(req.socket && req.socket.remoteAddress || "local").slice(0, 120);
  return { clientId: `legacy:${address}`, trustedClient: false };
}

function readFileJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return clone(fallback);
  }
}

function writeFileJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporary, filePath);
}

async function resolveMysqlSession(connection, rawToken) {
  if (!rawToken) return null;
  const [rows] = await connection.execute(
    `SELECT s.user_id AS userId
       FROM aigc_auth_sessions s
      WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP(3)
      FOR UPDATE`,
    [tokenHash(rawToken)]
  );
  if (!rows.length) return null;
  await connection.execute(
    "UPDATE aigc_auth_sessions SET last_seen_at = CURRENT_TIMESTAMP(3) WHERE token_hash = ?",
    [tokenHash(rawToken)]
  );
  return String(rows[0].userId);
}

function resolveFileSession(rawToken) {
  if (!rawToken) return null;
  const store = readFileJson(env.authSessionFile, { version: 1, sessions: [] });
  const now = Date.now();
  const session = (store.sessions || []).find((entry) => (
    entry.tokenHash === tokenHash(rawToken) && new Date(entry.expiresAt).getTime() > now
  ));
  return session ? String(session.userId) : null;
}

async function resolveCloudbaseSession(rawToken) {
  if (!rawToken) return null;
  const hash = tokenHash(rawToken);
  const session = await getDocument(COLLECTIONS.sessions, hash);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
  await updateDocument(COLLECTIONS.sessions, hash, { lastSeenAt: new Date().toISOString() });
  return String(session.userId);
}

async function loadMysqlUserState(context, userId, required = true) {
  const [rows] = await context.connection.execute(
    "SELECT version, state_json AS stateJson, api_key AS apiKey FROM aigc_user_states WHERE user_id = ? FOR UPDATE",
    [userId]
  );
  if (!rows.length) {
    if (required) throw new AppError("SESSION_NOT_INITIALIZED", "账号尚未完成初始化", 401);
    context.userId = userId;
    context.stateVersion = 0;
    return null;
  }
  context.userId = userId;
  context.stateVersion = Number(rows[0].version) || 1;
  context.state = parseJson(rows[0].stateJson, {});
  context.apiKey = String(rows[0].apiKey || "");
  return context.state;
}

function loadFileUserState(context, userId, required = true) {
  const snapshotPath = path.join(env.accountsDir, `${userId}.json`);
  const snapshot = readFileJson(snapshotPath, null);
  if (!snapshot || !snapshot.state) {
    if (required) throw new AppError("SESSION_NOT_INITIALIZED", "账号尚未完成初始化", 401);
    context.userId = userId;
    context.stateVersion = 0;
    return null;
  }
  context.userId = userId;
  context.stateVersion = Number(snapshot.version) || 1;
  context.state = clone(snapshot.state);
  context.apiKey = String(snapshot.apiKey || "");
  return context.state;
}

async function loadCloudbaseUserState(context, userId, required = true) {
  const snapshot = await getDocument(COLLECTIONS.states, userId);
  if (!snapshot || !snapshot.state) {
    if (required) throw new AppError("SESSION_NOT_INITIALIZED", "账号尚未完成初始化", 401);
    context.userId = userId;
    context.stateVersion = 0;
    return null;
  }
  context.userId = userId;
  context.stateVersion = Number(snapshot.version) || 1;
  context.state = clone(snapshot.state);
  context.apiKey = String(snapshot.apiKey || "");
  return context.state;
}

async function bindUserToRequest(userId, options = {}) {
  const context = requireRequestContext();
  const normalized = String(userId || "").trim();
  if (!normalized) throw new AppError("AUTH_REQUIRED", "缺少用户身份", 401);
  if (context.userId && context.userId !== normalized) {
    throw new AppError("CROSS_USER_ACCESS_DENIED", "不能切换到其他用户的数据", 403);
  }
  if (options.useCurrentState) {
    context.userId = normalized;
    context.stateVersion = context.stateVersion || 0;
    return context.state;
  }
  if (context.mode === "mysql") return loadMysqlUserState(context, normalized, options.required !== false);
  if (context.mode === "cloudbase") return loadCloudbaseUserState(context, normalized, options.required !== false);
  return loadFileUserState(context, normalized, options.required !== false);
}

async function loadMysqlDraft(context, draftId) {
  const [rows] = await context.connection.execute(
    `SELECT owner_user_id AS ownerUserId, owner_client_id AS ownerClientId,
            revision, status, draft_json AS draftJson
       FROM aigc_goal_drafts WHERE draft_id = ? FOR UPDATE`,
    [draftId]
  );
  if (!rows.length) return;
  const row = rows[0];
  authorizeDraft(context, row);
  const draft = parseJson(row.draftJson, null);
  if (draft) context.draftStore.drafts.push(draft);
  context.loadedDraftIds.add(draftId);
  context.draftOwners.set(draftId, {
    ownerUserId: row.ownerUserId ? String(row.ownerUserId) : null,
    ownerClientId: String(row.ownerClientId),
  });
}

function loadFileDraft(context, draftId) {
  const store = readFileJson(path.join(env.runtimeDir, "goal-drafts.json"), { version: 1, drafts: [] });
  const draft = (store.drafts || []).find((entry) => entry && entry.draftId === draftId);
  if (!draft) return;
  const row = {
    ownerUserId: draft.ownerUserId || null,
    ownerClientId: draft.ownerClientId || context.clientId,
  };
  authorizeDraft(context, row);
  context.draftStore.drafts.push(clone(draft));
  context.loadedDraftIds.add(draftId);
  context.draftOwners.set(draftId, row);
}

async function loadCloudbaseDraft(context, draftId) {
  const row = await getDocument(COLLECTIONS.drafts, draftId);
  if (!row) return;
  authorizeDraft(context, row);
  if (row.draft) context.draftStore.drafts.push(clone(row.draft));
  context.loadedDraftIds.add(draftId);
  context.draftOwners.set(draftId, {
    ownerUserId: row.ownerUserId ? String(row.ownerUserId) : null,
    ownerClientId: String(row.ownerClientId || ""),
  });
}

function authorizeDraft(context, row) {
  const ownerUserId = row.ownerUserId ? String(row.ownerUserId) : null;
  const ownerClientId = String(row.ownerClientId || "");
  if (ownerUserId && context.userId && ownerUserId !== context.userId) {
    throw new AppError("CROSS_USER_ACCESS_DENIED", "该学习路线不属于当前用户", 403);
  }
  if (!ownerUserId && ownerClientId && ownerClientId !== context.clientId) {
    throw new AppError("CROSS_USER_ACCESS_DENIED", "该学习路线不属于当前设备", 403);
  }
  if (ownerUserId && !context.userId && ownerClientId !== context.clientId) {
    throw new AppError("AUTH_REQUIRED", "请先登录后继续", 401);
  }
}

async function flushMysql(context) {
  if (context.userId && context.stateDirty) {
    const payload = JSON.stringify(context.state);
    if (context.stateVersion > 0) {
      const [result] = await context.connection.execute(
        `UPDATE aigc_user_states
            SET state_json = ?, api_key = ?, version = version + 1
          WHERE user_id = ? AND version = ?`,
        [payload, context.apiKey || null, context.userId, context.stateVersion]
      );
      if (result.affectedRows !== 1) throw new AppError("STATE_REVISION_CONFLICT", "用户状态已更新，请重试", 409);
      context.stateVersion += 1;
    } else {
      await context.connection.execute(
        "INSERT INTO aigc_user_states (user_id, version, state_json, api_key) VALUES (?, 1, ?, ?)",
        [context.userId, payload, context.apiKey || null]
      );
      context.stateVersion = 1;
    }
  }

  if (context.draftsDirty) {
    for (const draft of context.draftStore.drafts) {
      const existing = context.draftOwners.get(draft.draftId) || {};
      const ownerUserId = context.userId || existing.ownerUserId || null;
      const ownerClientId = existing.ownerClientId || context.clientId;
      await context.connection.execute(
        `INSERT INTO aigc_goal_drafts
          (draft_id, owner_user_id, owner_client_id, revision, status, draft_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          owner_user_id = VALUES(owner_user_id), revision = VALUES(revision), status = VALUES(status),
          draft_json = VALUES(draft_json), expires_at = VALUES(expires_at)`,
        [draft.draftId, ownerUserId, ownerClientId, Number(draft.revision) || 1,
          String(draft.status || "CREATED"), JSON.stringify(draft), new Date(draft.expiresAt)]
      );
    }
  }
}

function flushFile(context) {
  if (context.userId && context.stateDirty) {
    const snapshotPath = path.join(env.accountsDir, `${context.userId}.json`);
    writeFileJson(snapshotPath, {
      userId: context.userId,
      version: (Number(context.stateVersion) || 0) + 1,
      apiKey: context.apiKey || "",
      savedAt: new Date().toISOString(),
      state: context.state,
    });
    context.stateVersion = (Number(context.stateVersion) || 0) + 1;
  }
  if (context.draftsDirty) {
    const draftPath = path.join(env.runtimeDir, "goal-drafts.json");
    const current = readFileJson(draftPath, { version: 1, drafts: [] });
    const byId = new Map((current.drafts || []).map((draft) => [draft.draftId, draft]));
    context.draftStore.drafts.forEach((draft) => {
      const existing = context.draftOwners.get(draft.draftId) || {};
      byId.set(draft.draftId, {
        ...draft,
        ownerUserId: context.userId || existing.ownerUserId || null,
        ownerClientId: existing.ownerClientId || context.clientId,
      });
    });
    writeFileJson(draftPath, { version: 1, drafts: [...byId.values()] });
  }
}

async function flushCloudbase(context) {
  if (context.userId && context.stateDirty) {
    context.stateVersion = (Number(context.stateVersion) || 0) + 1;
    await setDocument(COLLECTIONS.states, context.userId, {
      userId: context.userId,
      version: context.stateVersion,
      apiKey: context.apiKey || "",
      savedAt: new Date().toISOString(),
      state: context.state,
    });
  }
  if (context.draftsDirty) {
    for (const draft of context.draftStore.drafts) {
      const existing = context.draftOwners.get(draft.draftId) || {};
      await setDocument(COLLECTIONS.drafts, draft.draftId, {
        ownerUserId: context.userId || existing.ownerUserId || null,
        ownerClientId: existing.ownerClientId || context.clientId,
        revision: Number(draft.revision) || 1,
        status: String(draft.status || "CREATED"),
        expiresAt: draft.expiresAt,
        draft,
      });
    }
  }
}

function baseContext(req) {
  const identity = clientIdentity(req);
  return {
    mode: env.persistence.driver,
    connection: null,
    userId: null,
    clientId: identity.clientId,
    trustedClient: identity.trustedClient,
    state: null,
    stateVersion: 0,
    stateDirty: false,
    apiKey: "",
    draftStore: { version: 1, drafts: [] },
    loadedDraftIds: new Set(),
    draftOwners: new Map(),
    draftsDirty: false,
  };
}

async function executeMysqlRequest(req, options, action) {
  const connection = await getPool().getConnection();
  const context = baseContext(req);
  context.connection = connection;
  try {
    await connection.beginTransaction();
    const resolvedUserId = await resolveMysqlSession(connection, bearerToken(req));
    if (resolvedUserId) await loadMysqlUserState(context, resolvedUserId, true);
    if (options.authRequired && !context.userId) throw new AppError("AUTH_REQUIRED", "登录状态已失效，请重新登录", 401);
    if (options.draftId) await loadMysqlDraft(context, options.draftId);
    const result = await runWithRequestContext(context, action);
    await flushMysql(context);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { /* keep original error */ }
    throw error;
  } finally {
    connection.release();
  }
}

async function executeFileRequest(req, options, action) {
  const context = baseContext(req);
  const resolvedUserId = resolveFileSession(bearerToken(req));
  if (resolvedUserId) loadFileUserState(context, resolvedUserId, true);
  if (options.authRequired && !context.userId) throw new AppError("AUTH_REQUIRED", "登录状态已失效，请重新登录", 401);
  if (options.draftId) loadFileDraft(context, options.draftId);
  const result = await runWithRequestContext(context, action);
  flushFile(context);
  return result;
}

async function executeCloudbaseRequest(req, options, action) {
  const context = baseContext(req);
  const resolvedUserId = await resolveCloudbaseSession(bearerToken(req));
  if (resolvedUserId) await loadCloudbaseUserState(context, resolvedUserId, true);
  if (options.authRequired && !context.userId) throw new AppError("AUTH_REQUIRED", "登录状态已失效，请重新登录", 401);
  if (options.draftId) await loadCloudbaseDraft(context, options.draftId);
  const result = await runWithRequestContext(context, action);
  await flushCloudbase(context);
  return result;
}

async function executeRequest(req, options, action) {
  if (env.persistence.isMysql) return executeMysqlRequest(req, options || {}, action);
  const previous = fileRequestTail;
  let release;
  fileRequestTail = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    if (env.persistence.isCloudbase) return await executeCloudbaseRequest(req, options || {}, action);
    return await executeFileRequest(req, options || {}, action);
  } finally {
    release();
  }
}

async function initializePersistence() {
  if (env.persistence.requireShared && !env.persistence.isMysql && !env.persistence.isCloudbase) {
    throw new Error("生产环境要求共享持久化：请配置 PERSISTENCE_DRIVER=mysql 或 cloudbase");
  }
  await initializeMysql();
  await initializeCloudbase();
}

async function closePersistence() {
  await closeMysql();
  closeCloudbase();
}

module.exports = {
  tokenHash,
  executeRequest,
  initializePersistence,
  closePersistence,
  bindUserToRequest,
};
