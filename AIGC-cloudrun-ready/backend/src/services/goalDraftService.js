const {
  createGoalDraft,
  getGoalDraft,
  updateGoalDraft,
} = require("../store/goalDraftStore");
const { AppError } = require("../lib/errors");
const { searchLearningSources } = require("./learningSourceSearchService");
const { generateSourceBoundPlan, validateSourceBoundPlan } = require("./sourceBoundPlanningService");

function text(value, fallback = "") {
  const result = String(value || "").replace(/\s+/g, " ").trim();
  return result || fallback;
}

function parseDurationDays(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.min(365, Math.round(parsed)));
  const match = String(value || "").match(/\d+/);
  return Math.max(1, Math.min(365, Number(match && match[0]) || 30));
}

function parseDailyMinutes(value) {
  const raw = text(value, "2 小时");
  const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*(小时|h)/i);
  if (hourMatch) return Math.max(25, Math.min(480, Math.round(Number(hourMatch[1]) * 60)));
  const minuteMatch = raw.match(/(\d+)\s*(分钟|min)/i);
  return Math.max(25, Math.min(480, Number(minuteMatch && minuteMatch[1]) || 120));
}

function normalizeGoalProfile(input = {}, mode = "INITIAL") {
  const title = text(input.title || input.goal);
  if (!title) throw new AppError("INVALID_GOAL_PROFILE", "学习目标不能为空", 400);
  const duration = parseDurationDays(input.durationDays || input.deadline);
  const dailyTime = text(input.dailyTime, "2 小时");
  return {
    roleId: mode === "INITIAL" ? text(input.roleId, "scholar") : "",
    name: mode === "INITIAL" ? text(input.name, "林岚") : "",
    title,
    deadline: text(input.deadline, `${duration} 天后`),
    durationDays: duration,
    dailyTime,
    dailyBudgetMinutes: parseDailyMinutes(input.dailyBudgetMinutes || dailyTime),
    currentLevel: ["BEGINNER", "UNSYSTEMATIC", "SPRINT"].includes(input.currentLevel) ? input.currentLevel : "UNSYSTEMATIC",
    sourcePreference: ["VIDEO", "TEXT", "PRACTICE", "ANY"].includes(input.sourcePreference) ? input.sourcePreference : "ANY",
    accessPreference: ["FREE_ONLY", "PAID_OK", "OWNED"].includes(input.accessPreference) ? input.accessPreference : "FREE_ONLY",
  };
}

function createDraftCommand(payload = {}) {
  const mode = payload.mode === "PARALLEL" ? "PARALLEL" : "INITIAL";
  const goalProfile = normalizeGoalProfile(payload.goalProfile || payload, mode);
  return createGoalDraft({ mode, goalProfile });
}

async function searchSourcesCommand(draftId, payload = {}, options = {}) {
  const current = getGoalDraft(draftId);
  const expectedRevision = Number(payload.expectedRevision);
  const userSources = Array.isArray(payload.userSources) ? payload.userSources : [];
  try {
    const result = await searchLearningSources(current.goalProfile, {
      userSources,
      apiKey: options.apiKey,
      tool: options.tool,
    });
    return updateGoalDraft(draftId, expectedRevision, (draft) => ({
      ...draft,
      status: "SOURCES_READY",
      userProvidedSources: result.candidates.filter((source) => source.origin === "USER"),
      sourceCandidates: result.candidates,
      sourceBundles: result.bundles,
      selectedBundleId: null,
      selectedSourceIds: [],
      planDraft: null,
      planWarnings: result.warnings || [],
      planGeneration: null,
      searchMode: result.searchMode,
    }));
  } catch (error) {
    if (!error || error.code !== "NO_RELIABLE_SOURCE") throw error;
    return updateGoalDraft(draftId, expectedRevision, (draft) => ({
      ...draft,
      status: "SOURCES_READY",
      userProvidedSources: [],
      sourceCandidates: [],
      sourceBundles: [],
      selectedBundleId: null,
      selectedSourceIds: [],
      planDraft: null,
      planWarnings: ["暂时没有找到合适资料，可以跳过这一步直接生成计划。"],
      planGeneration: null,
      searchMode: "NO_RELIABLE_SOURCE",
    }));
  }
}

function selectSourcesCommand(draftId, payload = {}) {
  const current = getGoalDraft(draftId);
  if (current.status !== "SOURCES_READY" && current.status !== "SOURCE_SELECTED" && current.status !== "SOURCE_SKIPPED" && current.status !== "PLAN_READY") {
    throw new AppError("INVALID_DRAFT_STATE", "请先完成来源搜索", 409);
  }
  if (payload.skip === true) {
    return updateGoalDraft(draftId, payload.expectedRevision, (draft) => ({
      ...draft,
      status: "SOURCE_SKIPPED",
      selectedBundleId: "SKIPPED",
      selectedSourceIds: [],
      planDraft: null,
      planWarnings: ["本次未绑定学习资料，任务不会引用未经确认的章节或链接。"],
      planGeneration: null,
    }));
  }
  const bundleId = text(payload.bundleId);
  const bundle = (current.sourceBundles || []).find((entry) => entry.bundleId === bundleId);
  if (!bundle) throw new AppError("SOURCE_BUNDLE_INVALID", "所选学习路线不存在", 400);
  return updateGoalDraft(draftId, payload.expectedRevision, (draft) => ({
    ...draft,
    status: "SOURCE_SELECTED",
    selectedBundleId: bundle.bundleId,
    planGeneration: null,
    selectedSourceIds: [...bundle.sourceIds],
    planDraft: null,
    planWarnings: [],
  }));
}

async function generatePlanCommand(draftId, payload = {}, options = {}) {
  const current = getGoalDraft(draftId);
  if (current.status !== "SOURCE_SELECTED" && current.status !== "SOURCE_SKIPPED" && current.status !== "PLAN_READY") {
    throw new AppError("INVALID_DRAFT_STATE", "请先选择学习来源或跳过来源选择", 409);
  }
  const selectedIds = current.selectedSourceIds || [];
  const sources = (current.sourceCandidates || []).filter((source) => selectedIds.includes(source.sourceId));
  const skipped = current.selectedBundleId === "SKIPPED" || current.status === "SOURCE_SKIPPED";
  if (!skipped && !sources.length) throw new AppError("SOURCE_BUNDLE_INVALID", "所选路线没有可用来源", 400);
  const plan = await generateSourceBoundPlan({
    goalProfile: current.goalProfile,
    selectedSourceIds: selectedIds,
    sources,
    adjustment: text(payload.adjustment),
  }, { apiKey: options.apiKey });
  const checked = validateSourceBoundPlan(plan, {
    goalProfile: current.goalProfile,
    selectedSourceIds: selectedIds,
    sources,
  });
  if (!checked.valid) throw new AppError("PLAN_VALIDATION_FAILED", "计划未通过来源和时间校验，请重新生成", 422, { issues: checked.issues });
  return updateGoalDraft(draftId, payload.expectedRevision, (draft) => ({
    ...draft,
    status: "PLAN_READY",
    planDraft: checked.plan,
    lastAdjustment: text(payload.adjustment),
    planWarnings: [...(plan.planWarnings || []), ...(checked.issues || [])],
  }));
}

function getDraftForConfirmation(draftId, expectedRevision) {
  const draft = getGoalDraft(draftId);
  if (Number(expectedRevision) !== Number(draft.revision)) {
    throw new AppError("DRAFT_REVISION_CONFLICT", "草稿已更新，请刷新后重试", 409, { revision: draft.revision });
  }
  if (draft.status !== "PLAN_READY") throw new AppError("INVALID_DRAFT_STATE", "请先生成并确认计划", 409);
  if (!draft.selectedBundleId || !draft.planDraft) throw new AppError("INVALID_DRAFT_STATE", "计划尚未完整确认", 409);
  const sources = (draft.sourceCandidates || []).filter((source) => (draft.selectedSourceIds || []).includes(source.sourceId));
  const checked = validateSourceBoundPlan(draft.planDraft, {
    goalProfile: draft.goalProfile,
    selectedSourceIds: draft.selectedSourceIds || [],
    sources,
  });
  if (!checked.valid) throw new AppError("PLAN_VALIDATION_FAILED", "计划已过期或不再满足校验条件，请重新生成", 422, { issues: checked.issues });
  return { ...draft, planDraft: checked.plan, selectedSources: sources };
}

module.exports = {
  parseDurationDays,
  parseDailyMinutes,
  normalizeGoalProfile,
  createDraftCommand,
  searchSourcesCommand,
  selectSourcesCommand,
  generatePlanCommand,
  getDraftForConfirmation,
};
