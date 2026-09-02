const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const env = require("../config/env");
const { clone } = require("../utils/clone");
const { AppError } = require("../lib/errors");

const draftFile = path.join(env.runtimeDir, "goal-drafts.json");
let store = null;

function emptyStore() {
  return { version: 1, drafts: [] };
}

function ensureRuntimeDir() {
  fs.mkdirSync(env.runtimeDir, { recursive: true });
}

function pruneDrafts(now = new Date()) {
  const timestamp = new Date(now).getTime();
  const before = store.drafts.length;
  store.drafts = store.drafts.filter((draft) => {
    const expiresAt = new Date(draft.expiresAt || 0).getTime();
    return Number.isFinite(expiresAt) && expiresAt > timestamp
      || (draft.status === "CONFIRMED" && new Date(draft.confirmedAt || 0).getTime() > timestamp - 86400000);
  });
  return before !== store.drafts.length;
}

function save() {
  ensureRuntimeDir();
  const tempFile = `${draftFile}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), "utf8");
  try {
    fs.renameSync(tempFile, draftFile);
  } catch (error) {
    // Windows cannot replace an existing file with rename in some versions.
    // The fallback keeps the existing project JSON-store behavior.
    fs.writeFileSync(draftFile, JSON.stringify(store, null, 2), "utf8");
    try { fs.rmSync(tempFile, { force: true }); } catch (cleanupError) { /* best effort */ }
  }
}

function load() {
  if (store) return store;
  ensureRuntimeDir();
  if (!fs.existsSync(draftFile)) {
    store = emptyStore();
    save();
  } else {
    try {
      store = JSON.parse(fs.readFileSync(draftFile, "utf8"));
    } catch (error) {
      store = emptyStore();
    }
  }
  if (!Array.isArray(store.drafts)) store.drafts = [];
  if (pruneDrafts()) save();
  return store;
}

function assertDraftId(draftId) {
  const value = String(draftId || "").trim();
  if (!value) throw new AppError("DRAFT_NOT_FOUND", "学习路线草稿不存在", 404);
  return value;
}

function getDraftOrThrow(draftId) {
  const id = assertDraftId(draftId);
  const draft = load().drafts.find((entry) => entry.draftId === id);
  if (!draft) throw new AppError("DRAFT_NOT_FOUND", "学习路线草稿不存在", 404);
  if (draft.status !== "CONFIRMED" && new Date(draft.expiresAt).getTime() <= Date.now()) {
    draft.status = "EXPIRED";
    save();
    throw new AppError("DRAFT_EXPIRED", "学习路线草稿已过期，请重新开始", 410);
  }
  return draft;
}

function createGoalDraft(input) {
  const now = new Date();
  const draft = {
    draftId: crypto.randomUUID(),
    revision: 1,
    status: "CREATED",
    mode: input.mode === "PARALLEL" ? "PARALLEL" : "INITIAL",
    goalProfile: clone(input.goalProfile || {}),
    userProvidedSources: [],
    sourceCandidates: [],
    sourceBundles: [],
    selectedBundleId: null,
    planDraft: null,
    planWarnings: [],
    lastAdjustment: "",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 86400000).toISOString(),
    confirmedAt: null,
    confirmationKey: null,
    confirmedGoalId: null,
    confirmationReceipt: null,
  };
  load().drafts.unshift(draft);
  pruneDrafts(now);
  save();
  return clone(draft);
}

function getGoalDraft(draftId) {
  return clone(getDraftOrThrow(draftId));
}

function updateGoalDraft(draftId, expectedRevision, mutator) {
  const draft = getDraftOrThrow(draftId);
  if (Number(expectedRevision) !== Number(draft.revision)) {
    throw new AppError("DRAFT_REVISION_CONFLICT", "草稿已更新，请刷新后重试", 409, { revision: draft.revision });
  }
  if (draft.status === "CONFIRMED" || draft.status === "EXPIRED") {
    throw new AppError("INVALID_DRAFT_STATE", "当前草稿状态不允许修改", 409);
  }
  const result = mutator(clone(draft));
  const next = result && typeof result === "object" ? result : draft;
  next.revision = draft.revision + 1;
  next.updatedAt = new Date().toISOString();
  const index = load().drafts.findIndex((entry) => entry.draftId === draft.draftId);
  if (index < 0) throw new AppError("DRAFT_NOT_FOUND", "学习路线草稿不存在", 404);
  load().drafts[index] = next;
  save();
  return clone(next);
}

function findConfirmationReceipt(draftId, confirmationKey) {
  const draft = getDraftOrThrow(draftId);
  if (!confirmationKey || draft.confirmationKey !== String(confirmationKey)) return null;
  return clone(draft.confirmationReceipt);
}

function markGoalDraftConfirmed(draftId, expectedRevision, receipt) {
  const draft = getDraftOrThrow(draftId);
  if (draft.status === "CONFIRMED" && draft.confirmationKey === String(receipt.confirmationKey || "")) {
    return clone(draft);
  }
  if (Number(expectedRevision) !== Number(draft.revision)) {
    throw new AppError("DRAFT_REVISION_CONFLICT", "草稿已更新，请刷新后重试", 409, { revision: draft.revision });
  }
  draft.status = "CONFIRMED";
  draft.revision += 1;
  draft.updatedAt = new Date().toISOString();
  draft.confirmedAt = draft.updatedAt;
  draft.confirmationKey = String(receipt.confirmationKey || "");
  draft.confirmedGoalId = String(receipt.goalId || "");
  draft.confirmationReceipt = clone(receipt);
  const index = load().drafts.findIndex((entry) => entry.draftId === draft.draftId);
  load().drafts[index] = draft;
  save();
  return clone(draft);
}

function resetDraftStore() {
  store = emptyStore();
  save();
}

module.exports = {
  draftFile,
  createGoalDraft,
  getGoalDraft,
  updateGoalDraft,
  findConfirmationReceipt,
  markGoalDraftConfirmed,
  pruneGoalDrafts,
  resetDraftStore,
};
