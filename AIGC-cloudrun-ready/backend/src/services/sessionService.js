const { getRole, getRoleOrThrow, listRoles } = require("../constants/roles");
const { getDungeonStoryline } = require("../constants/dungeonStorylines");
const { defaultShop } = require("../constants/shop");
const { getStarTool, getConstellationReward } = require("../constants/starMap");
const { selectStoryAsset } = require("../constants/storyAssets");
const { formatDiaryTime, getDungeonState } = require("../utils/time");
const { clone } = require("../utils/clone");
const { getState, saveStore, replaceState } = require("../store/sessionStore");
const { AppError } = require("../lib/errors");
const env = require("../config/env");
const {
  findConfirmationReceipt,
  getGoalDraft,
  markGoalDraftConfirmed,
} = require("../store/goalDraftStore");
const confirmationLocks = new Map();
const { getDraftForConfirmation } = require("./goalDraftService");
const { buildFallbackPlan } = require("./sourceBoundPlanningService");
const {
  setDeepseekApiKey,
  getDeepseekApiKey,
  clearRuntimeSecrets,
} = require("../store/runtimeSecrets");
const {
  assertAccountAvailable,
  registerAccount,
  authenticateAccount,
  updateLastLoginAt,
  loadAccountSnapshot,
  createAuthSession,
} = require("../store/accountStore");
const { getRequestContext } = require("../context/requestContext");
const { bindUserToRequest } = require("../store/requestPersistence");
const { getResolvedApiKey } = require("./deepseekService");
const {
  DEFAULT_TIME_ZONE,
  parseDailyMinutes,
  getPlanDate,
  generateDailyPlan,
} = require("./dailyPlanService");
const { generateGoalBlueprint } = require("./goalBlueprintService");
const {
  GOAL_LEVELS,
  REPLAN_REASONS,
  classifyGoal,
  generateClarifyingQuestions,
  generateGoalPlan,
  generateRollingTaskPlan,
  replanTasks: planReplacementTasks,
  generateNextSuggestion: planNextSuggestion,
} = require("./goalPlanningService");
const {
  buildPlanningBlueprint,
  initializeGoalPlanning,
  ensureGoalPlanning,
  planRollingHorizon,
  applyRollingTaskPlan,
  buildSideTasks: buildPortfolioSideTasks,
} = require("./portfolioPlanningService");
const {
  generateTaskNarrative,
  generateSideQuestNarrative,
  generateChapterFinale,
  generateSeasonArchive,
} = require("./narrativeService");
const {
  buildDungeonLearningContext,
  calculateDungeonReward,
} = require("./dungeonProgressService");
const { generateDungeonSettlementNarrative } = require("./dungeonNarrativeService");
const { getSkillsByIds } = require("./agentCatalogService");
const {
  syncIdentity,
  syncMemory,
  buildMemoryMarkdown,
} = require("./agentWorkspaceService");
const {
  buildInitialSkillState,
  buildInitialDungeonProfile,
  getDungeonProfileSnapshot,
  getSkillStateSnapshot,
  buildSkillInventoryEntries,
  evaluateTriggeredSkills,
  applyTriggeredSkillEffects,
  clearLastTriggeredSkills,
  buildSkillEffectSummary,
} = require("./skillEngineService");
const { getCharacterArcSnapshot } = require("./characterArcService");
const {
  createEmptyMemoryTree,
  recordTaskMemory,
  recordChapterFinale,
  startNewSeason,
  archiveActiveSeason,
  getL1RecentSummaries,
  getRecentSeasonDigests,
  buildMemoryTreeSnapshot,
} = require("./memoryTreeService");
const {
  createEmptyWorldState,
  upsertWorldEntities,
  listWorldEntities,
  getWorldStateSnapshot,
} = require("./worldStateService");

function allocateId(state, prefix) {
  state.meta.nextId += 1;
  return `${prefix}-${state.meta.nextId}`;
}

function ensureInitialized(state) {
  if (!state.initialized) {
    throw new Error("当前还没有初始化角色与目标");
  }
}

function buildMainline(goal, role) {
  return `围绕“${goal}”展开的新主线已开启。你需要在 ${role.chapter} 中逐步完成当前阶段任务，解锁新的剧情片段。`;
}

function buildLegacyPlanFromSourceBoundDraft(draft, state) {
  const plan = draft && draft.planDraft;
  const profile = draft && draft.goalProfile || {};
  const stageGoals = Array.isArray(plan && plan.stageGoals) ? plan.stageGoals : [];
  const firstWeek = Array.isArray(plan && plan.firstWeek) ? plan.firstWeek : [];
  const stages = stageGoals.map((stage, stageIndex) => ({
    id: stage.stageId || `stage-${stageIndex + 1}`,
    title: stage.title || `阶段 ${stageIndex + 1}`,
    description: stage.description || "围绕当前目标持续推进。",
    progress: 0,
    status: stageIndex === 0 ? "IN_PROGRESS" : "NOT_STARTED",
    tasks: firstWeek
      .filter((day) => Number(day.day) >= Number(stage.startDay || 1) && Number(day.day) <= Number(stage.endDay || profile.durationDays || 30))
      .flatMap((day) => {
        const mainTasks = Array.isArray(day.mainTasks) && day.mainTasks.length
          ? day.mainTasks
          : day.coreTask ? [day.coreTask] : [];
        return mainTasks.map((task, taskIndex) => ({
          id: `planned-main-${day.day}-${taskIndex + 1}`,
          title: task.title,
          description: task.detail,
          detail: task.detail,
          difficulty: 2,
          estimatedMinutes: task.estimatedMinutes,
          rewardGrowth: 14,
          rewardResource: 14,
          status: "TODO",
          dueDate: day.day,
          order: Number(day.day) * 10 + taskIndex,
          sourceRef: task.sourceRef || null,
          priorityTier: "CORE",
          selectionReason: task.selectionReason,
        }));
      }),
  }));
  const fallback = {
    id: allocateId(state, "goal-plan"),
    longTermGoal: profile.title,
    goalLevel: "LONG_TERM",
    currentStageId: stages[0] && stages[0].id,
    status: "ACTIVE",
    stageGoals: stages,
    clarifyingQuestions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return fallback.stageGoals.length >= 2 ? fallback : {
    ...fallback,
    stageGoals: [
      { id: "stage-1", title: "建立基础", description: "围绕当前目标建立起点。", progress: 0, status: "IN_PROGRESS", tasks: [] },
      { id: "stage-2", title: "形成应用", description: "把学习内容转成可执行结果。", progress: 0, status: "NOT_STARTED", tasks: [] },
    ],
    currentStageId: "stage-1",
  };
}

function normalizeEstimatedMinutes(value, fallback = 25) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.round(numeric);
  }

  const text = String(value || "").trim();
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

function buildEstimateText(minutes) {
  return `${normalizeEstimatedMinutes(minutes)} 分钟`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function createEmptyStarMap() {
  return {
    version: 1,
    collections: [],
    tools: {},
    scheduledReviews: [],
  };
}

function ensureStarMapState(state) {
  let changed = false;
  if (!state.starMap || typeof state.starMap !== "object") {
    state.starMap = createEmptyStarMap();
    return true;
  }
  if (!Array.isArray(state.starMap.collections)) {
    state.starMap.collections = [];
    changed = true;
  }
  if (!state.starMap.tools || typeof state.starMap.tools !== "object" || Array.isArray(state.starMap.tools)) {
    state.starMap.tools = {};
    changed = true;
  }
  if (!Array.isArray(state.starMap.scheduledReviews)) {
    state.starMap.scheduledReviews = [];
    changed = true;
  }
  if (!state.starMap.version) {
    state.starMap.version = 1;
    changed = true;
  }
  return changed;
}

function grantStarTool(state, tool) {
  if (!tool) {
    return null;
  }
  ensureStarMapState(state);
  const now = new Date().toISOString();
  const current = state.starMap.tools[tool.id] || {
    ...tool,
    charges: 0,
    timesUsed: 0,
    obtainedAt: now,
  };
  current.name = tool.name;
  current.icon = tool.icon;
  current.action = tool.action;
  current.detail = tool.detail;
  current.charges = Number(current.charges || 0) + 1;
  state.starMap.tools[tool.id] = current;

  const inventoryItem = Array.isArray(state.inventory)
    ? state.inventory.find((item) => item && item.id === tool.id)
    : null;
  if (inventoryItem) {
    inventoryItem.charges = current.charges;
    inventoryItem.detail = tool.detail;
  } else {
    if (!Array.isArray(state.inventory)) {
      state.inventory = [];
    }
    state.inventory.unshift({
      id: tool.id,
      name: tool.name,
      detail: tool.detail,
      category: "star-tool",
      equipped: true,
      charges: current.charges,
    });
  }
  return current;
}

function collectCompletedConstellations(state) {
  ensureStarMapState(state);
  const plan = state.goalPlan;
  if (!plan || !Array.isArray(plan.stageGoals)) {
    return [];
  }
  const collectedIds = new Set(
    state.starMap.collections.map((entry) => entry && entry.stageGoalId).filter(Boolean)
  );
  const awards = [];
  plan.stageGoals.forEach((stage) => {
    if (!stage || String(stage.status || "").toUpperCase() !== "DONE" || collectedIds.has(stage.id)) {
      return;
    }
    const stars = (stage.tasks || []).map((task) => ({
      taskId: task.id,
      title: task.title,
      completedAt: task.completedAt || null,
    }));
    const completedTimes = stars.map((star) => star.completedAt).filter(Boolean).sort();
    const tool = getConstellationReward(state.starMap.collections.length);
    const granted = grantStarTool(state, tool);
    state.starMap.collections.unshift({
      constellationId: allocateId(state, "constellation"),
      goalPlanId: plan.id,
      longTermGoal: plan.longTermGoal,
      stageGoalId: stage.id,
      title: stage.title,
      description: stage.description,
      completedAt: completedTimes[completedTimes.length - 1] || new Date().toISOString(),
      starCount: stars.length,
      stars,
      rewardToolId: tool.id,
      rewardToolName: tool.name,
    });
    awards.push({ stageGoalId: stage.id, title: stage.title, tool: granted });
    collectedIds.add(stage.id);
  });
  return awards;
}

const REAL_CONSTELLATIONS = Object.freeze([
  { id: "ursa-major", name: "大熊座", starCount: 7 },
  { id: "orion", name: "猎户座", starCount: 8 },
  { id: "cassiopeia", name: "仙后座", starCount: 5 },
  { id: "cygnus", name: "天鹅座", starCount: 6 },
  { id: "scorpius", name: "天蝎座", starCount: 8 },
  { id: "leo", name: "狮子座", starCount: 8 },
  { id: "taurus", name: "金牛座", starCount: 7 },
  { id: "gemini", name: "双子座", starCount: 9 },
  { id: "aquila", name: "天鹰座", starCount: 7 },
  { id: "lyra", name: "天琴座", starCount: 5 },
  { id: "andromeda", name: "仙女座", starCount: 7 },
  { id: "pegasus", name: "飞马座", starCount: 6 },
]);
const PORTFOLIO_MAIN_TASKS_PER_DAY = 3;
const PORTFOLIO_SIDE_TASKS_PER_DAY = 2;

function constellationTemplate(offset, index) {
  return REAL_CONSTELLATIONS[(Math.max(0, Number(offset) || 0) + index) % REAL_CONSTELLATIONS.length];
}

function parseGoalDurationDays(value, fallback = 30) {
  const text = String(value || "").trim();
  const match = text.match(/(\d+)\s*(天|周|个月|月)?/);
  if (!match) return fallback;
  const amount = Math.max(1, Number(match[1]) || fallback);
  const unit = match[2] || "天";
  const days = unit === "周" ? amount * 7 : unit === "个月" || unit === "月" ? amount * 30 : amount;
  return Math.max(1, Math.min(365, days));
}

function buildPortfolioGoal(state, options = {}) {
  const durationDays = parseGoalDurationDays(options.durationDays || options.deadline, 30);
  const constellation = REAL_CONSTELLATIONS[
    Math.max(0, Number(options.constellationIndex) || 0) % REAL_CONSTELLATIONS.length
  ];
  const now = new Date().toISOString();
  const goalId = allocateId(state, "long-goal");
  const goal = {
    goalId,
    title: String(options.title || "新的长期目标").trim(),
    description: String(options.description || `每天完成 3 个主线任务和 2 个支线任务，${durationDays} 天持续推进。`).trim(),
    durationDays,
    completedDays: 0,
    completedStars: 0,
    totalStarCount: durationDays * PORTFOLIO_MAIN_TASKS_PER_DAY,
    starsPerDay: PORTFOLIO_MAIN_TASKS_PER_DAY,
    status: "ACTIVE",
    constellationId: constellation.id,
    constellationName: constellation.name,
    constellationOffset: Math.max(0, Number(options.constellationIndex) || 0),
    startDate: getPlanDate(new Date(), state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE),
    lastReleasedDate: null,
    createdAt: now,
    completedAt: null,
    nodes: [],
    constellations: [],
    originDraftId: String(options.originDraftId || "").trim() || null,
    sourcePreferences: options.sourcePreferences ? clone(options.sourcePreferences) : null,
    learningSources: Array.isArray(options.learningSources) ? clone(options.learningSources) : [],
    selectedSourceBundleId: String(options.selectedSourceBundleId || "").trim() || null,
    planStatus: options.planStatus || "LEGACY",
    planConfirmedAt: options.planConfirmedAt || null,
    priority: options.priority || "INACTIVE",
    plannedThroughDay: 0,
  };
  initializeGoalPlanning(
    goal,
    options.sourceBoundPlan || options.plan,
    parseDailyMinutes(state.profile && state.profile.dailyTime, 120)
  );
  ensureGoalSeriesConstellations(state, goal);
  return goal;
}

function normalizeOptionalSummary(value) {
  const summary = String(value === null || value === undefined ? "" : value).trim();
  if (!summary) return "";
  const length = Array.from(summary).length;
  if (length < 5) throw new AppError("SUMMARY_TOO_SHORT", "一句话总结至少需要 5 个字", 422);
  if (length > 100) throw new AppError("SUMMARY_TOO_LONG", "一句话总结最多 100 个字", 422);
  return summary;
}

function refreshGoalSeriesMetrics(goal) {
  const nodeById = new Map((goal.nodes || []).map((node) => [node.nodeId, node]));
  (goal.constellations || []).forEach((map, index) => {
    const nodes = (map.nodeIds || []).map((nodeId) => nodeById.get(nodeId)).filter(Boolean);
    map.starCount = (map.nodeIds || []).length;
    map.completedStars = nodes.filter((node) => node.status === "DONE").length;
    const template = REAL_CONSTELLATIONS.find((entry) => entry.id === map.constellationId);
    const capacity = Number(map.capacity || template && template.starCount) || map.starCount;
    map.capacity = capacity;
    const isFinalPartialMap = map.starCount > 0
      && map.starCount < capacity
      && Number(goal.plannedThroughDay || 0) >= Number(goal.durationDays || 0);
    if (map.starCount > 0
      && map.completedStars === map.starCount
      && (map.starCount === capacity || isFinalPartialMap)) {
      map.status = "COMPLETED";
      map.completedAt = map.completedAt || nodes.map((node) => node.completedAt).filter(Boolean).sort().slice(-1)[0] || new Date().toISOString();
    } else {
      const previousComplete = index > 0 && goal.constellations[index - 1]
        && goal.constellations[index - 1].status === "COMPLETED";
      map.status = index === 0 || previousComplete || nodes.some((node) => node.status !== "LOCKED") ? "ACTIVE" : "LOCKED";
      map.completedAt = null;
    }
  });
}

function ensureGoalSeriesConstellations(state, goal) {
  const nodes = Array.isArray(goal.nodes) ? goal.nodes : [];
  const existing = Array.isArray(goal.constellations) ? goal.constellations : [];
  let changed = false;
  const offset = Math.max(0, Number(goal.constellationOffset) || 0);
  const nextMaps = [];
  let cursor = 0;
  let index = 0;
  while (cursor < nodes.length) {
    const previous = existing[index] || {};
    const template = constellationTemplate(offset, index);
    const capacity = Number(template.starCount) || 1;
    const mapNodes = nodes.slice(cursor, cursor + capacity);
    const nodeIds = mapNodes.map((node) => node.nodeId);
    if (previous.constellationId !== template.id || JSON.stringify(previous.nodeIds || []) !== JSON.stringify(nodeIds)) {
      changed = true;
    }
    nextMaps.push({
      mapId: previous.mapId || allocateId(state, "series-map"),
      order: index + 1,
      constellationId: template.id,
      constellationName: template.name,
      capacity,
      nodeIds,
      starCount: nodeIds.length,
      completedStars: mapNodes.filter((node) => node.status === "DONE").length,
      status: previous.status || (index === 0 ? "ACTIVE" : "LOCKED"),
      completedAt: previous.completedAt || null,
    });
    cursor += capacity;
    index += 1;
  }
  if (existing.length !== nextMaps.length) changed = true;
  goal.constellations = nextMaps;
  if (goal.constellations[0]) {
    goal.constellationId = goal.constellations[0].constellationId;
    goal.constellationName = goal.constellations[0].constellationName;
  }
  refreshGoalSeriesMetrics(goal);
  return changed;
}

function refreshPortfolioGoalMetrics(goal) {
  const nodes = Array.isArray(goal && goal.nodes) ? goal.nodes : [];
  goal.starsPerDay = PORTFOLIO_MAIN_TASKS_PER_DAY;
  goal.totalStarCount = Number(goal.durationDays || 0) * PORTFOLIO_MAIN_TASKS_PER_DAY;
  goal.completedStars = nodes.filter((node) => node && node.status === "DONE").length;
  let completedDays = 0;
  for (let day = 1; day <= Number(goal.durationDays || 0); day += 1) {
    const dayNodes = nodes.filter((node) => node && Number(node.day) === day);
    if (dayNodes.length > 0 && dayNodes.every((node) => node.status === "DONE")) {
      completedDays += 1;
    }
  }
  goal.completedDays = completedDays;
  refreshGoalSeriesMetrics(goal);
  const planComplete = Number(goal.plannedThroughDay || 0) >= Number(goal.durationDays || 0)
    && nodes.length >= Number(goal.totalStarCount || 0)
    && goal.completedStars >= goal.totalStarCount
    && goal.totalStarCount > 0;
  if (planComplete) {
    goal.status = "COMPLETED";
    goal.completedAt = goal.completedAt || new Date().toISOString();
  } else {
    goal.status = "ACTIVE";
    goal.completedAt = null;
  }
}

function ensurePortfolioGoalShape(state, goal) {
  if (!goal || !Number(goal.durationDays)) return false;
  const previousPlanningVersion = Number(goal.planningVersion || 0);
  const before = `${goal.planningVersion}|${(goal.nodes || []).length}|${goal.completedStars}|${(goal.constellations || []).length}`;
  goal.nodes = (Array.isArray(goal.nodes) ? goal.nodes : []).filter((node) => (
    node && Number(node.day) >= 1 && Number(node.day) <= Number(goal.durationDays)
  ));
  const matchingPlan = state.goalPlan && state.goalPlan.longTermGoal === goal.title ? state.goalPlan : null;
  ensureGoalPlanning(
    goal,
    matchingPlan,
    parseDailyMinutes(state.profile && state.profile.dailyTime, 120)
  );
  goal.nodes.forEach((node) => {
    if (!node.nodeId) node.nodeId = `${goal.goalId}-core-${node.day}-${allocateId(state, "node")}`;
    node.slot = Number(node.slot) || 1;
    node.priorityTier = "CORE";
  });
  if (previousPlanningVersion !== Number(goal.planningVersion)) {
    goal.aiRollingUpgradePending = previousPlanningVersion > 0;
    const nodeById = new Map(goal.nodes.map((node) => [node.nodeId, node]));
    (state.tasks || []).forEach((task) => {
      if (task.done || task.portfolioGoalId !== goal.goalId || task.type !== "main") return;
      const node = nodeById.get(task.portfolioNodeId);
      if (!node || node.status !== "AVAILABLE") return;
      task.title = node.title;
      task.detail = node.detail;
      task.estimatedMinutes = node.estimatedMinutes;
      task.taskRole = node.taskRole;
      task.taskRoleLabel = node.taskRoleLabel;
      task.phaseId = node.phaseId;
      task.phaseTitle = node.phaseTitle;
      task.weeklyMilestoneId = node.weeklyMilestoneId;
      task.weeklyMilestoneTitle = node.weeklyMilestoneTitle;
      task.qualityScore = node.qualityScore;
    });
  }
  goal.starsPerDay = PORTFOLIO_MAIN_TASKS_PER_DAY;
  goal.plannedThroughDay = Math.max(Number(goal.plannedThroughDay || 0), ...goal.nodes.map((node) => Number(node.day) || 0));
  goal.totalStarCount = Number(goal.durationDays || 0) * PORTFOLIO_MAIN_TASKS_PER_DAY;
  goal.description = `每天完成 3 个主线任务和 2 个支线任务，${goal.durationDays} 天持续推进。`;
  const seriesChanged = ensureGoalSeriesConstellations(state, goal);
  refreshPortfolioGoalMetrics(goal);
  return seriesChanged || before !== `${goal.planningVersion}|${goal.nodes.length}|${goal.completedStars}|${goal.constellations.length}`;
}

function ensureGoalPortfolioState(state) {
  if (state.goalPortfolio && Array.isArray(state.goalPortfolio.goals) && state.goalPortfolio.goals.length > 0) {
    state.goalPortfolio.version = 2;
    let changed = false;
    state.goalPortfolio.goals.forEach((goal) => {
      if (ensurePortfolioGoalShape(state, goal)) changed = true;
    });
    if (state.transition) state.transition.needsNewGoalPrompt = false;
    return changed;
  }
  const portfolio = { version: 2, goals: [] };
  if (!state.goalPlan) {
    state.goalPortfolio = portfolio;
    return true;
  }

  const goal = buildPortfolioGoal(state, {
    title: state.goalPlan.longTermGoal || (state.profile && state.profile.goal),
    deadline: state.profile && state.profile.deadline,
    plan: state.goalPlan,
    constellationIndex: 0,
    priority: "PRIMARY",
  });
  const completedPlanTasks = (state.goalPlan.stageGoals || [])
    .flatMap((stage) => stage.tasks || [])
    .filter((task) => String(task && task.status || "").toUpperCase() === "DONE");
  completedPlanTasks.slice(0, goal.nodes.length).forEach((task, index) => {
    goal.nodes[index].title = `第 ${goal.nodes[index].day} 天：${task.title}`;
    goal.nodes[index].detail = task.description || goal.nodes[index].detail;
    goal.nodes[index].status = "DONE";
    goal.nodes[index].completedAt = task.completedAt || new Date().toISOString();
  });
  refreshPortfolioGoalMetrics(goal);

  const pendingMain = (state.tasks || []).filter((task) => task && task.type === "main" && !task.done);
  const firstPending = pendingMain[0];
  if (firstPending && goal.status === "ACTIVE") {
    const node = goal.nodes.find((entry) => entry.status === "LOCKED");
    node.title = `第 ${node.day} 天：${firstPending.title}`;
    node.detail = firstPending.detail || node.detail;
    node.estimatedMinutes = Number(firstPending.estimatedMinutes || 25);
    node.status = "AVAILABLE";
    node.releasedDate = state.dailyPlan && state.dailyPlan.planDate
      ? state.dailyPlan.planDate
      : getPlanDate(new Date(), state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE);
    firstPending.portfolioGoalId = goal.goalId;
    firstPending.portfolioNodeId = node.nodeId;
    firstPending.portfolioDay = node.day;
    firstPending.portfolioSlot = node.slot;
    firstPending.portfolioReleaseDate = node.releasedDate;
    firstPending.goalTitle = goal.title;
    firstPending.source = "LONG_TERM";
    firstPending.stageGoalId = null;
    firstPending.stageTaskId = null;
  }

  const preserved = (state.tasks || []).filter((task) => task && (task.type === "side" || task.source === "CUSTOM" || task === firstPending || task.done));
  state.tasks = preserved;
  goal.lastReleasedDate = firstPending
    ? goal.nodes.find((node) => node.nodeId === firstPending.portfolioNodeId).releasedDate
    : completedPlanTasks.length > 0
      ? state.dailyPlan && state.dailyPlan.planDate || getPlanDate(new Date(), state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE)
      : null;
  portfolio.goals.push(goal);
  state.goalPortfolio = portfolio;
  if (state.transition) state.transition.needsNewGoalPrompt = false;
  return true;
}

function findPortfolioGoalAndNode(state, goalId, nodeId) {
  const goal = state.goalPortfolio && Array.isArray(state.goalPortfolio.goals)
    ? state.goalPortfolio.goals.find((entry) => entry && entry.goalId === goalId)
    : null;
  if (!goal) return { goal: null, node: null };
  return { goal, node: (goal.nodes || []).find((entry) => entry && entry.nodeId === nodeId) || null };
}

function collectCompletedPortfolioConstellations(state, goal) {
  if (!goal) return [];
  ensureStarMapState(state);
  ensureGoalSeriesConstellations(state, goal);
  const nodeById = new Map((goal.nodes || []).map((node) => [node.nodeId, node]));
  const awards = [];
  for (const map of goal.constellations || []) {
    if (map.status !== "COMPLETED") continue;
    if (state.starMap.collections.some((entry) => entry && entry.seriesMapId === map.mapId)) continue;
    const tool = getConstellationReward(state.starMap.collections.length);
    const granted = grantStarTool(state, tool);
    const stars = (map.nodeIds || []).map((nodeId) => nodeById.get(nodeId)).filter(Boolean);
    state.starMap.collections.unshift({
      constellationId: allocateId(state, "constellation"),
      seriesMapId: map.mapId,
      goalPlanId: goal.goalId,
      longTermGoal: goal.title,
      stageGoalId: null,
      title: `${map.constellationName} · ${goal.title}`,
      description: `「${goal.title}」系列的第 ${map.order} 张星图。`,
      completedAt: map.completedAt,
      starCount: stars.length,
      stars: stars.map((node) => ({
        taskId: node.nodeId,
        title: node.title,
        completedAt: node.completedAt,
        sourceTitle: node.sourceRef && node.sourceRef.sourceTitle || null,
        completionSummary: node.completionSummary || null,
      })),
      rewardToolId: tool.id,
      rewardToolName: tool.name,
    });
    awards.push({ map, tool: granted });
  }
  return awards;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 0, 0);
  return next;
}

function normalizeDeadlineAt(value, fallbackDate) {
  const text = String(value || "").trim();
  if (text) {
    const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      return endOfDay(
        new Date(
          Number(dateOnlyMatch[1]),
          Number(dateOnlyMatch[2]) - 1,
          Number(dateOnlyMatch[3])
        )
      ).toISOString();
    }
    const parsed = new Date(text.includes("T") ? text : text.replace(" ", "T"));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return endOfDay(fallbackDate || addDays(new Date(), 1)).toISOString();
}

function formatDeadlineLabel(deadlineAt) {
  const date = new Date(deadlineAt);
  if (Number.isNaN(date.getTime())) {
    return "未设置";
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getOverdueDays(task, now = new Date()) {
  if (!task || task.done || !task.deadlineAt) {
    return 0;
  }
  const deadline = new Date(task.deadlineAt);
  if (Number.isNaN(deadline.getTime()) || now <= deadline) {
    return 0;
  }
  return Math.max(1, Math.ceil((now.getTime() - deadline.getTime()) / 86400000));
}

function getEffectiveRewardGrowth(task) {
  return getOverdueDays(task) > 0
    ? Math.max(1, Math.round(Number(task.rewardGrowth || 0) * 0.7))
    : Number(task.rewardGrowth || 0);
}

function buildRewardSummary(baseGrowth, baseResource, skillResolution) {
  const growthText =
    skillResolution && skillResolution.rewardGrowthDelta > 0
      ? `成长值 +${baseGrowth}（技能额外 +${skillResolution.rewardGrowthDelta}）`
      : `成长值 +${baseGrowth}`;
  const resourceText =
    skillResolution && skillResolution.rewardResourceDelta > 0
      ? `资源点 +${baseResource}（技能额外 +${skillResolution.rewardResourceDelta}）`
      : `资源点 +${baseResource}`;
  return `${growthText} / ${resourceText}`;
}

function selectEventStoryAsset(state, context = {}) {
  return selectStoryAsset({
    roleId: context.roleId || (state && state.selectedRoleId) || (state && state.agent && state.agent.roleId),
    goal: context.goal || (state && state.profile && state.profile.goal),
    chapterTitle: context.chapterTitle || (state && state.agent && state.agent.chapter),
    ...context,
  });
}

function getCurrentCharacterArc(state) {
  return getCharacterArcSnapshot(state.stats && state.stats.level ? state.stats.level : 1);
}

function applyAgentArcState(state) {
  const characterArc = getCurrentCharacterArc(state);
  if (state.agent) {
    state.agent.arcId = characterArc.id;
    state.agent.arcLabel = characterArc.label;
    state.agent.arcTone = characterArc.tone;
  }
  return characterArc;
}

function buildAgent(role, state, profile) {
  return {
    agentId: allocateId(state, "agent"),
    roleId: role.id,
    roleName: role.name,
    roleDescription: role.description,
    roleConfigPath: role.configPath,
    spriteClass: role.spriteClass,
    tone: role.tone,
    agentName: role.agentName,
    chapter: role.chapter,
    world: role.world,
    mainline: buildMainline(profile.goal, role),
    prologue: role.prologue,
    stage: "chapter-1",
    emotion: "专注",
    memoryCount: 0,
    lastMemoryAt: null,
    activeSkillIds: [...role.initialSkillIds],
    currentSeasonId: null,
    arcId: null,
    arcLabel: null,
    arcTone: null,
  };
}

function mapTasks(state, tasks, type = "main", context = {}) {
  const now = new Date();
  return tasks.map((task, index) => {
    const estimatedMinutes = normalizeEstimatedMinutes(
      task.estimatedMinutes ?? task.estimate,
      type === "side" ? 15 : 25
    );
    const createdAt = new Date().toISOString();

    return {
      id: allocateId(state, "task"),
      title: task.title,
      detail: String(task.detail || task.rationale || "").trim(),
      estimate: buildEstimateText(estimatedMinutes),
      estimatedMinutes,
      createdAt,
      deadlineAt: normalizeDeadlineAt(
        task.deadlineAt,
        context.dailyPlanId || context.scheduledDate
          ? now
          : type === "side" ? addDays(now, 1) : addDays(now, index + 1)
      ),
      deadlineLabel: "",
      overdueDays: 0,
      debuffActive: false,
      rewardGrowth: task.rewardGrowth,
      rewardResource: task.rewardResource,
      stageGoalId: task.stageGoalId || null,
      stageTaskId: task.stageTaskId || null,
      dailyPlanId: task.dailyPlanId || context.dailyPlanId || null,
      scheduledDate: task.scheduledDate || context.scheduledDate || null,
      source: task.source || context.source || (type === "side" ? "CUSTOM" : "STAGE"),
      carryoverCount: Number(task.carryoverCount || 0),
      difficulty: Number(task.difficulty || (type === "side" ? 1 : 2)),
      narrativeHook: String(task.narrativeHook || "").trim(),
      sourceRef: task.sourceRef ? clone(task.sourceRef) : null,
      priorityTier: task.priorityTier || (type === "main" ? "CORE" : "OPTIONAL"),
      selectionReason: String(task.selectionReason || "").trim(),
      completionSummary: "",
      originDraftId: task.originDraftId || context.originDraftId || null,
      type,
      done: false,
      completedAt: null,
    };
  });
}

function createStarToolTask(state, options) {
  const planDate = state.dailyPlan && state.dailyPlan.planDate
    ? state.dailyPlan.planDate
    : getPlanDate(new Date(), state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE);

  const optionalTasks = (state.tasks || []).filter((task) => task && !task.done && task.priorityTier === "OPTIONAL");
  if (optionalTasks.length >= PORTFOLIO_SIDE_TASKS_PER_DAY) {
    const automatic = optionalTasks.find((task) => task.source !== "CUSTOM");
    if (!automatic) {
      if (options && options.allowSkipOnLimit) {
        return null;
      }
      throw new AppError("DAILY_OPTIONAL_LIMIT_REACHED", "今天的支线任务已满，请先完成一个支线任务", 409);
    }
    state.tasks = state.tasks.filter((task) => task.id !== automatic.id);
    archiveUnscheduledTask(state, automatic, "OPTIONAL_REPLACED_BY_CUSTOM");
    if (state.dailyPlan) {
      state.dailyPlan.taskIds = state.dailyPlan.taskIds.filter((id) => id !== automatic.id);
      state.dailyPlan.optionalTaskIds = (state.dailyPlan.optionalTaskIds || []).filter((id) => id !== automatic.id);
    }
  }
  const dailyPlanId = state.dailyPlan && state.dailyPlan.id;
  const [task] = mapTasks(
    state,
    [{
      title: options.title,
      detail: options.detail,
      estimatedMinutes: options.estimatedMinutes || 10,
      rewardGrowth: options.rewardGrowth || 6,
      rewardResource: options.rewardResource || 6,
      deadlineAt: options.deadlineAt,
      dailyPlanId,
      scheduledDate: planDate,
      source: "CUSTOM",
    }],
    "side",
    { dailyPlanId, scheduledDate: planDate, source: "CUSTOM" }
  );
  task.starToolId = options.toolId;
  task.starSourceTaskId = options.sourceTaskId || null;
  task.starReviewOffset = Number(options.reviewOffset || 0);
  state.tasks.unshift(task);
  if (state.dailyPlan) {
    state.dailyPlan.taskIds.unshift(task.id);
    state.dailyPlan.version = Number(state.dailyPlan.version || 1) + 1;
    updateDailyPlanMetrics(state);
  }
  return task;
}

function materializeScheduledStarReviews(state, now = new Date()) {
  ensureStarMapState(state);
  const planDate = getPlanDate(now, state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE);
  let changed = false;
  state.starMap.scheduledReviews.forEach((review) => {
    if (!review || review.materializedTaskId || String(review.dueDate || "") > planDate) {
      return;
    }
    const task = createStarToolTask(state, {
      title: `间隔复习：${review.sourceTitle}`,
      detail: `回忆「${review.sourceTitle}」的核心内容，再检查一个仍不确定的点。`,
      estimatedMinutes: 10,
      toolId: "memory-sigil",
      sourceTaskId: review.sourceTaskId,
      reviewOffset: review.offsetDays,
      deadlineAt: review.dueDate,
      allowSkipOnLimit: true,
    });
    if (!task) {
      return;
    }
    review.materializedTaskId = task.id;
    review.materializedAt = new Date().toISOString();
    changed = true;
  });
  return changed;
}

function findStarToolTarget(state, taskId) {
  const id = String(taskId || "").trim();
  if (!id) {
    return null;
  }
  const execution = [...(state.tasks || []), ...(state.taskHistory || [])]
    .find((task) => task && task.id === id);
  if (execution) {
    return execution;
  }
  for (const goal of state.goalPortfolio && Array.isArray(state.goalPortfolio.goals)
    ? state.goalPortfolio.goals
    : []) {
    const node = (goal.nodes || []).find((entry) => entry && entry.nodeId === id);
    if (node) {
      return {
        id: node.nodeId,
        title: node.title,
        detail: node.detail,
        done: node.status === "DONE",
        status: node.status,
      };
    }
  }
  for (const stage of state.goalPlan && Array.isArray(state.goalPlan.stageGoals)
    ? state.goalPlan.stageGoals
    : []) {
    const stageTask = (stage.tasks || []).find((task) => task && task.id === id);
    if (stageTask) {
      return {
        ...stageTask,
        done: String(stageTask.status || "").toUpperCase() === "DONE",
      };
    }
  }
  return null;
}

function refreshGoalPlanProgress(state) {
  if (!state.goalPlan || !Array.isArray(state.goalPlan.stageGoals)) {
    return {
      previousStageId: null,
      currentStageId: null,
      stageAdvanced: false,
      goalCompleted: false,
    };
  }

  ensureMinimumGoalPlanDepth(state, state.goalPlan);

  const previousStageId = state.goalPlan.currentStageId || null;
  state.goalPlan.stageGoals.forEach((stage) => {
    const tasks = Array.isArray(stage.tasks) ? stage.tasks : [];
    const doneCount = tasks.filter(
      (task) => String(task && task.status || "TODO").toUpperCase() === "DONE"
    ).length;
    const totalCount = tasks.length;
    stage.progress = totalCount > 0 ? Math.round((doneCount * 100) / totalCount) : Number(stage.progress || 0);
    if (totalCount > 0 && doneCount === totalCount) {
      stage.status = "DONE";
    } else {
      stage.status = "NOT_STARTED";
    }
  });

  const nextStage = state.goalPlan.stageGoals.find((stage) => stage.status !== "DONE") || null;
  state.goalPlan.currentStageId = nextStage ? nextStage.id : null;
  state.goalPlan.status = nextStage ? "ACTIVE" : "COMPLETED";
  if (nextStage) {
    nextStage.status = "IN_PROGRESS";
  }
  state.goalPlan.updatedAt = new Date().toISOString();

  return {
    previousStageId,
    currentStageId: state.goalPlan.currentStageId,
    stageAdvanced: Boolean(previousStageId && state.goalPlan.currentStageId && previousStageId !== state.goalPlan.currentStageId),
    goalCompleted: state.goalPlan.status === "COMPLETED",
  };
}

function getCurrentStage(state) {
  if (!state.goalPlan || !Array.isArray(state.goalPlan.stageGoals)) {
    return null;
  }
  return (
    state.goalPlan.stageGoals.find((stage) => stage && stage.id === state.goalPlan.currentStageId) ||
    state.goalPlan.stageGoals[0] ||
    null
  );
}

function assignGoalPlanIds(state, rawPlan, fallbackGoal) {
  const now = new Date().toISOString();
  const plan = {
    id: rawPlan.id || allocateId(state, "goal-plan"),
    longTermGoal: String(rawPlan.longTermGoal || fallbackGoal || "").trim(),
    goalLevel: rawPlan.goalLevel || GOAL_LEVELS.STAGE_GOAL,
    currentStageId: rawPlan.currentStageId || null,
    status: rawPlan.status || "ACTIVE",
    clarifyingQuestions: Array.isArray(rawPlan.clarifyingQuestions) ? rawPlan.clarifyingQuestions : [],
    stageGoals: [],
    createdAt: rawPlan.createdAt || now,
    updatedAt: now,
  };

  plan.stageGoals = (rawPlan.stageGoals || []).map((stage, index) => {
    const stageId = stage.id || allocateId(state, "stage");
    if (!plan.currentStageId && index === 0) {
      plan.currentStageId = stageId;
    }
    const tasks = Array.isArray(stage.tasks) ? stage.tasks : [];
    return {
      id: stageId,
      title: String(stage.title || `阶段 ${index + 1}`).trim(),
      description: String(stage.description || "").trim(),
      progress: Number(stage.progress || 0),
      status: index === 0 ? "IN_PROGRESS" : stage.status || "NOT_STARTED",
      tasks: tasks.map((task, taskIndex) => ({
        id: task.id || allocateId(state, "stage-task"),
        title: String(task.title || `任务 ${taskIndex + 1}`).trim(),
        description: String(task.description || task.detail || "").trim(),
        stageGoalId: stageId,
        difficulty: Number(task.difficulty || 2),
        estimatedMinutes: normalizeEstimatedMinutes(task.estimatedMinutes || task.estimate, 25),
        status: String(task.status || (task.done ? "DONE" : "TODO")).toUpperCase() === "DONE" ? "DONE" : "TODO",
        rewardGrowth: Number(task.rewardGrowth || 12),
        rewardResource: Number(task.rewardResource || 14),
        narrativeHook: String(task.narrativeHook || "").trim(),
        order: Number.isFinite(Number(task.order)) ? Number(task.order) : taskIndex,
        completedAt: task.completedAt || null,
      })),
    };
  });

  return plan;
}

function buildGoalDepthTemplates(goal) {
  const target = String(goal || "当前目标").trim() || "当前目标";
  return [
    {
      title: "核心能力巩固",
      description: `围绕“${target}”补足练习、输出与薄弱点修复。`,
      tasks: [
        ["完成一个代表性练习", "选择一项最能代表当前目标的练习或实际操作并完成。", 30],
        ["修补一个薄弱环节", "找出当前最容易出错或中断的部分，完成一次针对性练习。", 25],
        ["输出一份阶段成果", "用笔记、讲解、作品或测试结果呈现这一阶段的成果。", 30],
      ],
    },
    {
      title: "综合应用与检验",
      description: `把“${target}”放进更完整的真实场景中进行检验。`,
      tasks: [
        ["完成一次综合应用", "组合已经完成的内容，完成一次综合练习或真实应用。", 35],
        ["检查结果并修正", "检查本次结果，定位一个问题并完成修正。", 25],
        ["复述核心方法", "不用照抄材料，用自己的话整理最关键的方法。", 20],
      ],
    },
    {
      title: "目标验收与收束",
      description: `回到“${target}”的完成标准，确认结果并整理保持计划。`,
      tasks: [
        ["对照目标完成标准", "逐项检查最初的完成标准，标出已达到与仍未达到的部分。", 20],
        ["完成最终验证", "通过综合练习、模拟测试或实际输出验证整体完成情况。", 35],
        ["整理总结与保持计划", "总结有效方法、遗留问题，以及之后如何保持成果。", 20],
      ],
    },
  ];
}

function ensureMinimumGoalPlanDepth(state, plan = state.goalPlan) {
  if (!plan || !Array.isArray(plan.stageGoals)) {
    return false;
  }
  const minimumStageCount = 3;
  const minimumTaskCount = 6;
  let taskCount = plan.stageGoals.reduce(
    (sum, stage) => sum + (Array.isArray(stage && stage.tasks) ? stage.tasks.length : 0),
    0
  );
  if (plan.stageGoals.length >= minimumStageCount && taskCount >= minimumTaskCount) {
    return false;
  }

  const existingTitles = new Set(plan.stageGoals.map((stage) => String(stage && stage.title || "").trim()));
  const templates = buildGoalDepthTemplates(plan.longTermGoal || (state.profile && state.profile.goal));
  let templateIndex = 0;
  while (plan.stageGoals.length < minimumStageCount || taskCount < minimumTaskCount) {
    let template = templates.find((entry, index) => index >= templateIndex && !existingTitles.has(entry.title));
    if (!template) {
      template = templates.find((entry) => !existingTitles.has(entry.title));
    }
    if (!template) {
      template = {
        title: `延伸阶段 ${plan.stageGoals.length + 1}`,
        description: "继续推进当前目标，避免在缺少充分验证时过早结束。",
        tasks: [
          ["继续一次核心行动", "围绕当前目标继续完成一个可验证的行动。", 25],
          ["检查并修正结果", "检查行动结果并完成一次修正。", 20],
          ["记录下一步", "写下当前结论和下一项行动。", 15],
        ],
      };
    }
    templateIndex = templates.indexOf(template) + 1;
    const stageId = allocateId(state, "stage");
    const tasks = template.tasks.map(([title, description, estimatedMinutes], taskIndex) => ({
      id: allocateId(state, "stage-task"),
      title,
      description,
      stageGoalId: stageId,
      difficulty: 2,
      estimatedMinutes,
      status: "TODO",
      rewardGrowth: 14,
      rewardResource: 14,
      narrativeHook: "一颗新的星点出现在尚未完成的目标星域中。",
      order: taskIndex,
      completedAt: null,
    }));
    plan.stageGoals.push({
      id: stageId,
      title: template.title,
      description: template.description,
      progress: 0,
      status: "NOT_STARTED",
      tasks,
    });
    existingTitles.add(template.title);
    taskCount += tasks.length;
  }
  plan.status = "ACTIVE";
  if (state.transition) {
    state.transition.needsNewGoalPrompt = false;
  }
  return true;
}

async function buildGoalPlanForState(state, goal, answers = []) {
  const apiKey = getDeepseekApiKey();
  const goalLevel = await classifyGoal(goal, { apiKey });
  const clarifyingQuestions =
    goalLevel === GOAL_LEVELS.LONG_TERM || goalLevel === GOAL_LEVELS.AMBIGUOUS
      ? await generateClarifyingQuestions(goal, { apiKey })
      : [];
  const planningContext = Array.isArray(answers) && answers.length > 0 ? answers : clarifyingQuestions;
  const rawPlan = await generateGoalPlan(goal, planningContext, { apiKey });
  rawPlan.goalLevel = goalLevel;
  rawPlan.clarifyingQuestions = clarifyingQuestions;
  const plan = assignGoalPlanIds(state, rawPlan, goal);
  plan.rollingTaskPlan = await generateRollingTaskPlan({
    goalText: plan.longTermGoal || goal,
    durationDays: parseGoalDurationDays(state.profile && state.profile.deadline, 30),
    startDay: 1,
    dayCount: Math.min(7, parseGoalDurationDays(state.profile && state.profile.deadline, 30)),
    dailyMinutes: parseDailyMinutes(state.profile && state.profile.dailyTime, 120),
    phases: plan.stageGoals.map((stage) => ({
      title: stage.title,
      description: stage.description,
      tasks: stage.tasks.map((task) => ({ title: task.title, description: task.description })),
    })),
  }, { apiKey });
  if (!Array.isArray(state.taskHistory)) {
    state.taskHistory = [];
  }
  if (Array.isArray(state.tasks) && state.tasks.length > 0) {
    state.taskHistory.unshift(...state.tasks.map((task) => ({ ...task, archivedReason: "GOAL_REPLANNED" })));
    state.taskHistory = state.taskHistory.slice(0, 500);
  }
  if (state.dailyPlan) {
    archiveCurrentDailyPlan(state);
  }
  state.goalPlan = plan;
  state.profile.goal = plan.longTermGoal || goal;
  state.tasks = [];
  state.dailyPlan = null;
  refreshGoalPlanProgress(state);
  return plan;
}

async function ensureGoalPlan(state) {
  if (!state.initialized || !state.profile) {
    return false;
  }
  if (state.goalPlan && Array.isArray(state.goalPlan.stageGoals) && state.goalPlan.stageGoals.length > 0) {
    refreshGoalPlanProgress(state);
    return false;
  }
  await buildGoalPlanForState(state, state.profile.goal, []);
  return true;
}

function findStageTask(state, stageTaskId) {
  if (!stageTaskId || !state.goalPlan || !Array.isArray(state.goalPlan.stageGoals)) {
    return null;
  }
  for (const stage of state.goalPlan.stageGoals) {
    const task = Array.isArray(stage.tasks)
      ? stage.tasks.find((entry) => entry && entry.id === stageTaskId)
      : null;
    if (task) {
      return { stage, task };
    }
  }
  return null;
}

function updateDailyPlanMetrics(state) {
  if (!state.dailyPlan) {
    return;
  }
  const taskIds = new Set(Array.isArray(state.dailyPlan.taskIds) ? state.dailyPlan.taskIds : []);
  const tasks = Array.isArray(state.tasks)
    ? state.tasks.filter((task) => task && taskIds.has(task.id))
    : [];
  const completed = tasks.filter((task) => task.done);
  state.dailyPlan.metrics = {
    plannedCount: tasks.length,
    completedCount: completed.length,
    plannedMinutes: tasks.reduce((sum, task) => sum + Number(task.estimatedMinutes || 0), 0),
    completedMinutes: completed.reduce((sum, task) => sum + Number(task.estimatedMinutes || 0), 0),
  };
  state.dailyPlan.coreTaskIds = tasks.filter((task) => task.priorityTier === "CORE").map((task) => task.id);
  state.dailyPlan.coreTaskId = state.dailyPlan.coreTaskIds[0] || state.dailyPlan.coreTaskId || null;
  state.dailyPlan.optionalTaskIds = tasks.filter((task) => task.priorityTier === "OPTIONAL").map((task) => task.id);
  state.dailyPlan.coreReleasedCount = Math.min(PORTFOLIO_MAIN_TASKS_PER_DAY, state.dailyPlan.coreTaskIds.length);
  state.dailyPlan.coreReleased = state.dailyPlan.coreReleasedCount >= PORTFOLIO_MAIN_TASKS_PER_DAY;
  if (!Number.isFinite(Number(state.dailyPlan.optionalSlotsUsed))) {
    state.dailyPlan.optionalSlotsUsed = Math.min(PORTFOLIO_SIDE_TASKS_PER_DAY, tasks.filter((task) => task.priorityTier === "OPTIONAL").length);
  }
  state.dailyPlan.status = tasks.length > 0 && completed.length === tasks.length ? "COMPLETED" : "ACTIVE";
  state.dailyPlan.completedAt = state.dailyPlan.status === "COMPLETED"
    ? state.dailyPlan.completedAt || new Date().toISOString()
    : null;
}

function archiveCurrentDailyPlan(state) {
  if (!state.dailyPlan) {
    return;
  }
  updateDailyPlanMetrics(state);
  if (!Array.isArray(state.dailyPlanHistory)) {
    state.dailyPlanHistory = [];
  }
  state.dailyPlanHistory.unshift({
    ...clone(state.dailyPlan),
    status: state.dailyPlan.status === "COMPLETED" ? "COMPLETED" : "EXPIRED",
    archivedAt: new Date().toISOString(),
  });
  state.dailyPlanHistory = state.dailyPlanHistory.slice(0, 30);
}

function archiveCompletedExecutionTasks(state) {
  if (!Array.isArray(state.taskHistory)) {
    state.taskHistory = [];
  }
  const completed = Array.isArray(state.tasks) ? state.tasks.filter((task) => task && task.done) : [];
  if (completed.length > 0) {
    state.taskHistory.unshift(...completed.map((task) => ({ ...task, archivedReason: "DAILY_ROLLOVER" })));
    state.taskHistory = state.taskHistory.slice(0, 500);
  }
}

function buildDailyExecutionTasks(state, plannedTasks, dailyPlanId, planDate, stageId) {
  return mapTasks(
    state,
    (plannedTasks || []).map((task) => ({
      ...task,
      detail: task.description || task.detail,
      stageGoalId: stageId,
      stageTaskId: task.id,
      dailyPlanId,
      scheduledDate: planDate,
      source: "STAGE",
    })),
    "main",
    { dailyPlanId, scheduledDate: planDate, source: "STAGE" }
  );
}

function releasePortfolioGoalTasks(state, goal, planDate, dailyPlanId) {
  if (!goal || goal.status !== "ACTIVE") return [];
  ensurePortfolioGoalShape(state, goal);
  const existingToday = (state.tasks || []).filter((task) => (
    task && task.portfolioGoalId === goal.goalId && task.portfolioReleaseDate === planDate
  ));
  const releasedTodayNodes = (goal.nodes || []).filter((node) => node && node.releasedDate === planDate);
  const firstLocked = (goal.nodes || []).find((node) => node && node.status === "LOCKED");
  const releaseDay = releasedTodayNodes.length > 0
    ? Number(releasedTodayNodes[0].day)
    : firstLocked ? Number(firstLocked.day) : null;
  if (!releaseDay) return [];

  const existingMainCount = existingToday.filter((task) => task.type === "main").length;
  const mainNodes = (goal.nodes || []).filter((node) => (
    node && Number(node.day) === releaseDay && node.status === "LOCKED"
  )).slice(0, Math.max(0, PORTFOLIO_MAIN_TASKS_PER_DAY - existingMainCount));
  const mainTasks = mapTasks(
    state,
    mainNodes.map((node) => ({
      title: node.title,
      detail: node.detail,
      estimatedMinutes: node.estimatedMinutes,
      rewardGrowth: 14,
      rewardResource: 14,
      dailyPlanId,
      scheduledDate: planDate,
      source: "LONG_TERM",
    })),
    "main",
    { dailyPlanId, scheduledDate: planDate, source: "LONG_TERM" }
  );
  mainTasks.forEach((task, index) => {
    const node = mainNodes[index];
    task.portfolioGoalId = goal.goalId;
    task.portfolioNodeId = node.nodeId;
    task.portfolioDay = releaseDay;
    task.portfolioSlot = node.slot;
    task.portfolioReleaseDate = planDate;
    task.goalTitle = goal.title;
    task.taskRole = node.taskRole;
    task.taskRoleLabel = node.taskRoleLabel;
    task.phaseId = node.phaseId;
    task.phaseTitle = node.phaseTitle;
    task.weeklyMilestoneId = node.weeklyMilestoneId;
    task.weeklyMilestoneTitle = node.weeklyMilestoneTitle;
    task.qualityScore = node.qualityScore;
    node.status = "AVAILABLE";
    node.releasedDate = planDate;
  });

  const existingSideCount = existingToday.filter((task) => task.type === "side").length;
  const sideTemplates = buildPortfolioSideTasks(goal, releaseDay);
  const sideTasks = mapTasks(
    state,
    sideTemplates.slice(existingSideCount, PORTFOLIO_SIDE_TASKS_PER_DAY).map((template) => ({
      ...template,
      estimatedMinutes: template.estimatedMinutes,
      rewardGrowth: 6,
      rewardResource: 8,
      dailyPlanId,
      scheduledDate: planDate,
      source: "LONG_TERM_SIDE",
    })),
    "side",
    { dailyPlanId, scheduledDate: planDate, source: "LONG_TERM_SIDE" }
  );
  sideTasks.forEach((task, index) => {
    task.portfolioGoalId = goal.goalId;
    task.portfolioDay = releaseDay;
    task.portfolioReleaseDate = planDate;
    task.goalTitle = goal.title;
    task.taskRole = sideTemplates[index]
      ? sideTemplates[index].taskRole
      : "SUPPORT";
  });
  if (mainTasks.length > 0 || sideTasks.length > 0 || existingToday.length > 0) {
    goal.lastReleasedDate = planDate;
  }
  return [...mainTasks, ...sideTasks];
}

function syncAvailableGoalTasks(state, goal) {
  const nodeById = new Map((goal.nodes || []).map((node) => [node.nodeId, node]));
  (state.tasks || []).forEach((task) => {
    if (task.done || task.type !== "main" || task.portfolioGoalId !== goal.goalId) return;
    const node = nodeById.get(task.portfolioNodeId);
    if (!node || node.status !== "AVAILABLE") return;
    task.title = node.title;
    task.detail = node.detail;
    task.estimatedMinutes = node.estimatedMinutes;
    task.taskRole = node.taskRole;
    task.taskRoleLabel = node.taskRoleLabel;
    task.phaseId = node.phaseId;
    task.phaseTitle = node.phaseTitle;
    task.weeklyMilestoneId = node.weeklyMilestoneId;
    task.weeklyMilestoneTitle = node.weeklyMilestoneTitle;
    task.qualityScore = node.qualityScore;
    task.sourceRef = node.sourceRef || task.sourceRef || null;
    task.priorityTier = "CORE";
    task.selectionReason = node.selectionReason || task.selectionReason || "按已确认路线安排。";
  });
}

async function ensureAiRollingHorizon(state, goal) {
  if (!goal || goal.status !== "ACTIVE" || !goal.planningBlueprint) return false;
  if (Number(goal.planningVersion || 0) >= 4) {
    const firstAvailable = (goal.nodes || []).find((node) => node.status === "AVAILABLE");
    const firstLocked = (goal.nodes || []).find((node) => node.status === "LOCKED");
    const startDay = Number((firstAvailable || firstLocked || {}).day || goal.completedDays + 1 || 1);
    if (!startDay || startDay > Number(goal.durationDays || 0)) return false;
    const endDay = Math.min(Number(goal.durationDays), startDay + 6);
    const before = goal.nodes.length;
    planRollingHorizon(goal, startDay, endDay - startDay + 1, false);
    return goal.nodes.length !== before;
  }
  const firstAvailable = (goal.nodes || []).find((node) => node.status === "AVAILABLE");
  const firstLocked = (goal.nodes || []).find((node) => node.status === "LOCKED");
  const startDay = Number((firstAvailable || firstLocked || {}).day || goal.completedDays + 1 || 1);
  const endDay = Math.min(Number(goal.durationDays), startDay + 6);
  const existingDays = new Set((goal.planningBlueprint.rollingDays || []).map((entry) => Number(entry.day)));
  const missingDays = [];
  for (let day = startDay; day <= endDay; day += 1) if (!existingDays.has(day)) missingDays.push(day);
  const overwriteAvailable = Boolean(goal.aiRollingUpgradePending);
  if (!missingDays.length && !overwriteAvailable) return false;
  const requestStart = overwriteAvailable ? startDay : missingDays[0];
  const requestEnd = overwriteAvailable ? endDay : missingDays[missingDays.length - 1];
  if (!overwriteAvailable && Number(goal.aiPlanningAttemptedThroughDay || 0) >= requestEnd) return false;
  const recentExecution = [...(state.taskHistory || []), ...(state.tasks || [])]
    .filter((task) => task.portfolioGoalId === goal.goalId)
    .slice(-12)
    .map((task) => ({ title: task.title, done: Boolean(task.done), estimatedMinutes: task.estimatedMinutes }));
  const rollingPlan = await generateRollingTaskPlan({
    goalText: goal.title,
    durationDays: goal.durationDays,
    startDay: requestStart,
    dayCount: requestEnd - requestStart + 1,
    dailyMinutes: goal.dailyBudgetMinutes,
    phases: (goal.planningBlueprint.phases || []).map((phase) => ({
      title: phase.title,
      description: phase.description,
      startDay: phase.startDay,
      endDay: phase.endDay,
      tasks: phase.focusItems,
    })),
    recentExecution,
  }, { apiKey: getDeepseekApiKey() });
  goal.aiPlanningAttemptedThroughDay = requestEnd;
  if (!rollingPlan) {
    goal.aiRollingUpgradePending = false;
    return false;
  }
  applyRollingTaskPlan(goal, rollingPlan, overwriteAvailable);
  syncAvailableGoalTasks(state, goal);
  goal.aiRollingUpgradePending = false;
  return true;
}

function getPriorityGoal(state, priority) {
  return (state.goalPortfolio && Array.isArray(state.goalPortfolio.goals)
    ? state.goalPortfolio.goals : [])
    .find((goal) => goal && goal.status === "ACTIVE" && goal.priority === priority);
}

function decoratePortfolioTask(task, goal, node, planDate) {
  if (!task) return task;
  task.portfolioGoalId = goal.goalId;
  task.portfolioNodeId = node ? node.nodeId : null;
  task.portfolioDay = node ? Number(node.day) : null;
  task.portfolioSlot = node ? Number(node.slot || 1) : null;
  task.portfolioReleaseDate = planDate;
  task.goalTitle = goal.title;
  task.priorityTier = node ? "CORE" : "OPTIONAL";
  task.sourceRef = task.sourceRef || (node && node.sourceRef) || null;
  task.selectionReason = task.selectionReason || (node && node.selectionReason) || "按已确认路线安排。";
  task.taskRole = task.taskRole || (node ? node.taskRole : "OPTIONAL");
  task.taskRoleLabel = task.taskRoleLabel || (node ? node.taskRoleLabel : "可选行动");
  task.phaseId = task.phaseId || (node && node.phaseId) || null;
  task.phaseTitle = task.phaseTitle || (node && node.phaseTitle) || null;
  task.weeklyMilestoneId = task.weeklyMilestoneId || (node && node.weeklyMilestoneId) || null;
  task.weeklyMilestoneTitle = task.weeklyMilestoneTitle || (node && node.weeklyMilestoneTitle) || null;
  task.qualityScore = task.qualityScore || (node && node.qualityScore) || 0;
  return task;
}

function findNextCoreNode(goal) {
  return (goal.nodes || [])
    .filter((node) => node && (node.status === "AVAILABLE" || node.status === "LOCKED"))
    .sort((left, right) => Number(left.day || 0) - Number(right.day || 0) || Number(left.slot || 0) - Number(right.slot || 0))[0] || null;
}

function releaseCoreTasksForGoal(state, goal, planDate, dailyPlanId, limit, reservedNodeIds = new Set()) {
  if (!goal || goal.status !== "ACTIVE" || limit <= 0) return [];
  const assignedNodeIds = new Set([...(state.tasks || [])
    .filter((task) => task && task.portfolioNodeId)
    .map((task) => task.portfolioNodeId), ...reservedNodeIds]);
  const candidates = (goal.nodes || [])
    .filter((node) => node && (node.status === "AVAILABLE" || node.status === "LOCKED") && !assignedNodeIds.has(node.nodeId))
    .sort((left, right) => Number(left.day || 0) - Number(right.day || 0) || Number(left.slot || 0) - Number(right.slot || 0));
  if (!candidates.length) return [];
  const firstDay = Number(candidates[0].day);
  const nodes = candidates.filter((node) => Number(node.day) === firstDay).slice(0, limit);
  const tasks = mapTasks(state, nodes.map((node) => ({
    title: node.title,
    detail: node.detail,
    estimatedMinutes: node.estimatedMinutes,
    rewardGrowth: 14,
    rewardResource: 14,
    dailyPlanId,
    scheduledDate: planDate,
    source: "LONG_TERM",
    sourceRef: node.sourceRef,
    priorityTier: "CORE",
    selectionReason: node.selectionReason,
  })), "main", { dailyPlanId, scheduledDate: planDate, source: "LONG_TERM" });
  tasks.forEach((task, index) => {
    const node = nodes[index];
    reservedNodeIds.add(node.nodeId);
    decoratePortfolioTask(task, goal, node, planDate);
    node.status = "AVAILABLE";
    node.releasedDate = planDate;
  });
  if (tasks.length) goal.lastReleasedDate = planDate;
  return tasks;
}

function optionalTemplateForGoal(goal, day) {
  if (!goal) return [];
  return buildPortfolioSideTasks(goal, day).slice(0, PORTFOLIO_SIDE_TASKS_PER_DAY).map((template) => ({
    ...template,
    sourceRef: template.sourceRef || (goal.learningSources && goal.learningSources[0] ? {
      sourceId: goal.learningSources[0].sourceId,
      sourceTitle: goal.learningSources[0].title,
      locatorType: "URL",
      locatorLabel: goal.learningSources[0].title,
      locatorUrl: goal.learningSources[0].url || "",
      verified: false,
    } : null),
  }));
}

function buildOptionalCandidates(state, primary, secondary, planDate, dailyPlanId) {
  const candidates = [];
  const primaryNode = primary && findNextCoreNode(primary);
  const secondaryNode = secondary && findNextCoreNode(secondary);
  const primaryTemplates = optionalTemplateForGoal(primary, primaryNode ? primaryNode.day : 1);
  const secondaryTemplates = optionalTemplateForGoal(secondary, secondaryNode ? secondaryNode.day : 1);
  for (let index = 0; index < PORTFOLIO_SIDE_TASKS_PER_DAY; index += 1) {
    if (primary && primaryTemplates[index]) candidates.push({ goal: primary, template: primaryTemplates[index], source: "LONG_TERM_OPTIONAL" });
    if (secondary && secondaryTemplates[index]) candidates.push({ goal: secondary, template: secondaryTemplates[index], source: "SECONDARY_OPTIONAL" });
  }
  const existingOptional = (state.tasks || []).filter((task) => task && !task.done && task.priorityTier === "OPTIONAL");
  const existingKeys = new Set(existingOptional.map((task) => `${task.portfolioGoalId || "custom"}|${task.title}`));
  return candidates.filter((entry) => !existingKeys.has(`${entry.goal.goalId}|${entry.template.title}`))
    .slice(0, PORTFOLIO_SIDE_TASKS_PER_DAY)
    .map((entry) => {
      const [task] = mapTasks(state, [{
        ...entry.template,
        rewardGrowth: 6,
        rewardResource: 8,
        dailyPlanId,
        scheduledDate: planDate,
        source: entry.source,
        priorityTier: "OPTIONAL",
      }], "side", { dailyPlanId, scheduledDate: planDate, source: entry.source });
      decoratePortfolioTask(task, entry.goal, null, planDate);
      task.priorityTier = "OPTIONAL";
      task.portfolioNodeId = null;
      task.portfolioSlot = null;
      task.portfolioDay = entry.goal && findNextCoreNode(entry.goal) ? findNextCoreNode(entry.goal).day : null;
      return task;
    }).filter(Boolean);
}

function archiveUnscheduledTask(state, task, reason) {
  state.taskHistory.unshift({
    ...task,
    status: "ARCHIVED",
    archivedReason: reason,
    archivedAt: new Date().toISOString(),
  });
}

function retainPendingForNextDay(state, previousPlan) {
  const pending = (state.tasks || []).filter((task) => task && !task.done);
  const keep = [];
  let customCount = 0;
  pending.forEach((task) => {
    if (task.source === "CUSTOM" && customCount < PORTFOLIO_SIDE_TASKS_PER_DAY) {
      task.priorityTier = "OPTIONAL";
      keep.push(task);
      customCount += 1;
      return;
    }
    if (task.portfolioGoalId && task.portfolioNodeId) {
      const { node } = findPortfolioGoalAndNode(state, task.portfolioGoalId, task.portfolioNodeId);
      if (node && node.status === "AVAILABLE") {
        node.status = "MISSED";
        node.missedAt = new Date().toISOString();
      }
    }
    archiveUnscheduledTask(state, task, task.priorityTier === "OPTIONAL" ? "OPTIONAL_EXPIRED" : "DAILY_TASK_EXPIRED");
  });
  const planId = state.dailyPlan && state.dailyPlan.id;
  const rolloverCount = previousPlan ? 1 : 0;
  keep.forEach((task) => {
    task.dailyPlanId = planId;
    task.scheduledDate = previousPlan && previousPlan.planDate || task.scheduledDate;
    task.carryoverCount = Number(task.carryoverCount || 0) + rolloverCount;
  });
  return keep;
}

function scheduleGlobalDailyTasks(state, primary, secondary, planDate, dailyPlanId) {
  const generated = [];
  const existingCoreCount = (state.tasks || []).filter((task) => (
    task && task.dailyPlanId === dailyPlanId && task.priorityTier === "CORE"
  )).length;
  let remainingCoreSlots = Math.max(0, PORTFOLIO_MAIN_TASKS_PER_DAY - existingCoreCount);
  const orderedGoals = [primary, secondary, ...((state.goalPortfolio && state.goalPortfolio.goals) || [])]
    .filter((goal, index, list) => goal && goal.status === "ACTIVE" && goal.priority !== "INACTIVE"
      && list.findIndex((entry) => entry && entry.goalId === goal.goalId) === index);
  const reservedNodeIds = new Set();
  while (remainingCoreSlots > 0 && orderedGoals.length > 0) {
    let releasedThisRound = 0;
    for (const goal of orderedGoals) {
      if (remainingCoreSlots <= 0) break;
      const released = releaseCoreTasksForGoal(state, goal, planDate, dailyPlanId, 1, reservedNodeIds);
      generated.push(...released);
      remainingCoreSlots -= released.length;
      releasedThisRound += released.length;
    }
    if (releasedThisRound === 0) break;
  }
  const storedSlots = state.dailyPlan && Number(state.dailyPlan.optionalSlotsUsed);
  const derivedSlots = (state.tasks || []).filter((task) => task && task.dailyPlanId === dailyPlanId && task.priorityTier === "OPTIONAL").length;
  const slotsUsed = Math.max(0, Math.min(PORTFOLIO_SIDE_TASKS_PER_DAY, Number.isFinite(storedSlots) ? storedSlots : derivedSlots));
  let remainingSlots = PORTFOLIO_SIDE_TASKS_PER_DAY - slotsUsed;
  const selected = [];
  for (const candidate of buildOptionalCandidates(state, primary, secondary, planDate, dailyPlanId)) {
    if (remainingSlots <= 0) break;
    selected.push(candidate);
    remainingSlots -= 1;
  }
  generated.push(...selected);
  if (state.dailyPlan) {
    const coreIds = [...(state.tasks || []), ...generated]
      .filter((task) => task && task.dailyPlanId === dailyPlanId && task.priorityTier === "CORE")
      .map((task) => task.id);
    state.dailyPlan.coreTaskIds = coreIds;
    state.dailyPlan.coreTaskId = coreIds[0] || null;
    state.dailyPlan.coreReleasedCount = coreIds.length;
    state.dailyPlan.coreReleased = coreIds.length >= PORTFOLIO_MAIN_TASKS_PER_DAY;
    state.dailyPlan.optionalSlotsUsed = slotsUsed + selected.length;
  }
  return generated;
}

async function ensurePortfolioDailyPlan(state, options = {}) {
  const timeZone = String(state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE).trim() || DEFAULT_TIME_ZONE;
  const planDate = getPlanDate(options.now || new Date(), timeZone);
  const sameDay = state.dailyPlan && state.dailyPlan.planDate === planDate;
  if (sameDay) {
    const primary = getPriorityGoal(state, "PRIMARY");
    const secondary = getPriorityGoal(state, "SECONDARY");
    if (primary) await ensureAiRollingHorizon(state, primary);
    if (secondary) await ensureAiRollingHorizon(state, secondary);
    const generated = scheduleGlobalDailyTasks(state, primary, secondary, planDate, state.dailyPlan.id);
    if (generated.length) {
      state.tasks.push(...generated);
      state.dailyPlan.taskIds = state.tasks.map((task) => task.id);
      state.dailyPlan.optionalTaskIds = state.tasks.filter((task) => task.priorityTier === "OPTIONAL").map((task) => task.id);
      state.dailyPlan.version = Number(state.dailyPlan.version || 1) + 1;
    }
    updateDailyPlanMetrics(state);
    return generated.length > 0;
  }

  const previousPlan = state.dailyPlan;
  if (previousPlan) archiveCurrentDailyPlan(state);
  archiveCompletedExecutionTasks(state);
  state.tasks = retainPendingForNextDay(state, previousPlan);
  const dailyPlanId = allocateId(state, "daily-plan");
  state.tasks.forEach((task) => {
    task.dailyPlanId = dailyPlanId;
    task.scheduledDate = planDate;
  });
  state.dailyPlan = {
    id: dailyPlanId,
    planDate,
    goalPlanId: null,
    stageGoalId: null,
    status: "ACTIVE",
    capacityMinutes: parseDailyMinutes(state.profile && state.profile.dailyTime, 120),
    taskIds: state.tasks.map((task) => task.id),
    coreReleased: state.tasks.filter((task) => task.priorityTier === "CORE").length >= PORTFOLIO_MAIN_TASKS_PER_DAY,
    coreReleasedCount: Math.min(PORTFOLIO_MAIN_TASKS_PER_DAY, state.tasks.filter((task) => task.priorityTier === "CORE").length),
    coreTaskIds: state.tasks.filter((task) => task.priorityTier === "CORE").map((task) => task.id),
    coreTaskId: state.tasks.find((task) => task.priorityTier === "CORE")?.id || null,
    optionalTaskIds: state.tasks.filter((task) => task.priorityTier === "OPTIONAL" && !task.done).map((task) => task.id),
    optionalSlotsUsed: Math.min(PORTFOLIO_SIDE_TASKS_PER_DAY, state.tasks.filter((task) => task.priorityTier === "OPTIONAL").length),
    source: options.source || "GOAL_PORTFOLIO",
    version: 1,
    message: "",
    generatedAt: new Date().toISOString(),
    completedAt: null,
    metrics: {},
  };
  const primary = getPriorityGoal(state, "PRIMARY");
  const secondary = getPriorityGoal(state, "SECONDARY");
  if (primary) await ensureAiRollingHorizon(state, primary);
  if (secondary) await ensureAiRollingHorizon(state, secondary);
  const generated = scheduleGlobalDailyTasks(state, primary, secondary, planDate, dailyPlanId);
  state.tasks.push(...generated);
  state.dailyPlan.taskIds = state.tasks.map((task) => task.id);
  state.dailyPlan.optionalTaskIds = state.tasks.filter((task) => task.priorityTier === "OPTIONAL").map((task) => task.id);
  const coreCount = state.dailyPlan.coreTaskIds.length;
  state.dailyPlan.message = coreCount
    ? `今天安排 ${coreCount} 个主线任务${state.dailyPlan.optionalTaskIds.length ? `，以及 ${state.dailyPlan.optionalTaskIds.length} 个支线任务。` : "。"}`
    : "今天没有可发布的主线任务。";
  updateDailyPlanMetrics(state);
  return true;
}

async function ensureDailyPlan(state, options = {}) {
  if (!state.initialized || !state.goalPlan) {
    return false;
  }
  if (state.goalPortfolio && Array.isArray(state.goalPortfolio.goals) && state.goalPortfolio.goals.length > 0) {
    return ensurePortfolioDailyPlan(state, options);
  }
  const timeZone = String(state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE).trim() || DEFAULT_TIME_ZONE;
  const planDate = getPlanDate(options.now || new Date(), timeZone);
  if (!options.force && state.dailyPlan && state.dailyPlan.planDate === planDate) {
    updateDailyPlanMetrics(state);
    return false;
  }

  refreshGoalPlanProgress(state);
  if (state.goalPlan.status === "COMPLETED") {
    updateDailyPlanMetrics(state);
    return false;
  }

  const previousPlan = state.dailyPlan;
  if (previousPlan) {
    archiveCurrentDailyPlan(state);
  }
  archiveCompletedExecutionTasks(state);

  const currentStage = getCurrentStage(state);
  const pendingTasks = Array.isArray(state.tasks)
    ? state.tasks.filter((task) => {
        if (!task || task.done) {
          return false;
        }
        if (task.source === "CUSTOM" || task.type === "side") {
          return true;
        }
        return Boolean(currentStage && task.stageGoalId === currentStage.id && findStageTask(state, task.stageTaskId));
      })
    : [];
  const dailyPlanId = allocateId(state, "daily-plan");
  pendingTasks.forEach((task) => {
    task.dailyPlanId = dailyPlanId;
    task.scheduledDate = planDate;
    task.deadlineAt = normalizeDeadlineAt(planDate, new Date());
    task.carryoverCount = Number(task.carryoverCount || 0) + (previousPlan ? 1 : 0);
  });

  const capacityMinutes = parseDailyMinutes(state.profile && state.profile.dailyTime, 120);
  const usedMinutes = pendingTasks.reduce((sum, task) => sum + Number(task.estimatedMinutes || 0), 0);
  const carriedStageTaskIds = new Set(pendingTasks.map((task) => task.stageTaskId).filter(Boolean));
  const remainingStageTasks = currentStage && Array.isArray(currentStage.tasks)
    ? currentStage.tasks
        .filter((task) => String(task && task.status || "TODO").toUpperCase() !== "DONE")
        .filter((task) => !carriedStageTaskIds.has(task.id))
        .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
    : [];
  const pendingMainCount = pendingTasks.filter((task) => task.source === "STAGE").length;
  const availableSlots = Math.max(0, 3 - pendingMainCount);
  const generated = await generateDailyPlan({
    goalPlan: state.goalPlan,
    currentStage,
    remainingTasks: remainingStageTasks.slice(0, availableSlots),
    capacityMinutes: Math.max(5, capacityMinutes - usedMinutes),
    planDate,
    apiKey: getDeepseekApiKey(),
  });
  const generatedTasks = buildDailyExecutionTasks(
    state,
    generated.tasks.slice(0, availableSlots),
    dailyPlanId,
    planDate,
    currentStage && currentStage.id
  );
  state.tasks = [...pendingTasks, ...generatedTasks];
  state.dailyPlan = {
    id: dailyPlanId,
    planDate,
    goalPlanId: state.goalPlan.id,
    stageGoalId: currentStage && currentStage.id,
    status: "ACTIVE",
    capacityMinutes,
    taskIds: state.tasks.map((task) => task.id),
    source: options.source || generated.source || "AUTO",
    version: previousPlan && previousPlan.planDate === planDate
      ? Number(previousPlan.version || 1) + 1
      : 1,
    message: generated.message,
    generatedAt: new Date().toISOString(),
    completedAt: null,
    metrics: {},
  };
  updateDailyPlanMetrics(state);
  return true;
}

function createDiaryEntry(state, { title, body, reward }) {
  const entry = {
    id: allocateId(state, "diary"),
    time: formatDiaryTime(new Date()),
    title,
    body,
    reward,
  };
  state.diary.unshift(entry);
  return entry;
}

function createMemoryEntry(state, payload) {
  const summaryText = String(payload.memorySummary || payload.summary || "").trim();
  const memory = {
    id: allocateId(state, "memory"),
    createdAt: new Date().toISOString(),
    ...payload,
    summary: summaryText,
    memorySummary: summaryText,
    storyText: payload.storyText ? String(payload.storyText).trim() : null,
  };

  if (!Array.isArray(state.memories)) {
    state.memories = [];
  }

  state.memories.unshift(memory);
  if (state.agent) {
    state.agent.memoryCount = state.memories.length;
    state.agent.lastMemoryAt = memory.createdAt;
  }

  return memory;
}

function ensureTaskDeadlines(state) {
  let changed = false;
  const now = new Date();
  if (Array.isArray(state.tasks)) {
    state.tasks.forEach((task, index) => {
      if (!task.createdAt) {
        task.createdAt = now.toISOString();
        changed = true;
      }
      if (!task.deadlineAt) {
        task.deadlineAt = normalizeDeadlineAt(
          null,
          task.type === "side" ? addDays(now, 1) : addDays(now, index + 1)
        );
        changed = true;
      }
      const deadlineLabel = formatDeadlineLabel(task.deadlineAt);
      if (task.deadlineLabel !== deadlineLabel) {
        task.deadlineLabel = deadlineLabel;
        changed = true;
      }
      const overdueDays = getOverdueDays(task, now);
      if (Number(task.overdueDays || 0) !== overdueDays) {
        task.overdueDays = overdueDays;
        changed = true;
      }
      const debuffActive = overdueDays > 0;
      if (Boolean(task.debuffActive) !== debuffActive) {
        task.debuffActive = debuffActive;
        changed = true;
      }
    });
  }
  return changed;
}

function syncOverdueNarrative(state) {
  if (!state.initialized || !state.agent || !Array.isArray(state.tasks)) {
    return false;
  }
  if (!state.overdueState) {
    state.overdueState = {
      maxOverdueDays: 0,
      lastNarrativeOverdueDays: 0,
      lastNarrativeTaskId: null,
      pendingNarrative: null,
    };
  }

  const maxOverdueDays = state.tasks.reduce(
    (max, task) => Math.max(max, Number(task && task.overdueDays ? task.overdueDays : 0)),
    0
  );
  state.overdueState.maxOverdueDays = maxOverdueDays;

  const overdueTask = state.tasks.find((task) => task && !task.done && Number(task.overdueDays || 0) === maxOverdueDays);
  const overdueTaskId = overdueTask && overdueTask.id ? overdueTask.id : null;
  if (
    maxOverdueDays < 2 ||
    (Number(state.overdueState.lastNarrativeOverdueDays || 0) >= maxOverdueDays &&
      state.overdueState.lastNarrativeTaskId === overdueTaskId)
  ) {
    return false;
  }

  const title = overdueTask ? overdueTask.title : "未完成任务";
  const body = `${state.agent.agentName} 收到一封急讯：NPC 正在等待你处理「${title}」。任务已连续超时 ${maxOverdueDays} 天，角色进入经验收集减缓状态；完成该任务即可解除对应 Debuff。`;
  createDiaryEntry(state, {
    title: "NPC 求助：任务超时",
    body,
    reward: "Debuff：超时任务完成时成长值按 70% 结算",
  });
  createMemoryEntry(state, {
    type: "task_overdue_help",
    title: "NPC 求助：任务超时",
    memorySummary: `任务「${title}」连续超时 ${maxOverdueDays} 天`,
    storyText: body,
    reward: "经验收集减缓 Debuff 已挂载",
  });
  state.overdueState.lastNarrativeOverdueDays = maxOverdueDays;
  state.overdueState.lastNarrativeTaskId = overdueTaskId;
  state.overdueState.pendingNarrative = {
    key: `${overdueTaskId || "task"}:${maxOverdueDays}`,
    title: "NPC 求助：任务超时",
    body,
    rewardSummary: "Debuff：超时任务完成时成长值按 70% 结算",
  };
  state.lastStory = body;
  state.lastRewardSummary = "Debuff：超时任务完成时成长值按 70% 结算";
  return true;
}

function calculateLevelUps(state) {
  let levelUps = 0;
  while (state.stats.growth >= state.stats.nextLevel) {
    state.stats.growth -= state.stats.nextLevel;
    state.stats.level += 1;
    state.stats.nextLevel += 20;
    levelUps += 1;
  }
  return levelUps;
}

function createEmptyDungeonRun() {
  return {
    active: false,
    runId: null,
    startedAt: null,
    currentIndex: 0,
    totalNodes: 0,
    storylineId: null,
    lineName: null,
    chapterTitle: null,
    stateLabels: null,
    currentEventId: null,
    visitedEventIds: [],
    history: [],
    flags: [],
    routeState: {
      insight: 0,
      bond: 0,
      resolve: 0,
    },
    totals: {
      growth: 0,
      resources: 0,
    },
    planDate: null,
    dailyPlanId: null,
    stageGoalId: null,
    stageTitle: null,
    nextStageTitle: null,
    stageTheme: null,
    completionRoute: null,
    routeLabel: null,
    plannedTaskCount: 0,
    completedTaskCount: 0,
    completedTaskIds: [],
    completedTaskTitles: [],
    demoMode: false,
    rewardEligible: false,
    rewardGranted: false,
    rewardPreview: {
      growth: 0,
      resources: 0,
    },
    readyToSettle: false,
    settled: false,
    endingSummary: null,
    preparedEnding: null,
    recentOutcome: null,
  };
}

function listInventoryIds(state) {
  if (!Array.isArray(state.inventory)) {
    return [];
  }
  return state.inventory
    .map((item) => String(item && item.id ? item.id : "").trim())
    .filter(Boolean);
}

function buildDungeonStateLabels(storyline, run) {
  if (run && run.stateLabels) {
    return {
      insight: run.stateLabels.insight || "洞察",
      bond: run.stateLabels.bond || "羁绊",
      resolve: run.stateLabels.resolve || "定意",
    };
  }

  if (storyline && storyline.stateLabels) {
    return {
      insight: storyline.stateLabels.insight || "洞察",
      bond: storyline.stateLabels.bond || "羁绊",
      resolve: storyline.stateLabels.resolve || "定意",
    };
  }

  return {
    insight: "洞察",
    bond: "羁绊",
    resolve: "定意",
  };
}

function createInitialDungeonRouteState(state) {
  const roleId = String(state.selectedRoleId || "scholar").trim();
  const completedTaskCount = Array.isArray(state.tasks)
    ? state.tasks.filter((task) => task && task.done).length
    : 0;
  const inventoryIds = listInventoryIds(state);
  const base = {
    insight: completedTaskCount >= 2 ? 1 : 0,
    bond: completedTaskCount >= 1 ? 1 : 0,
    resolve: Number(state.stats && state.stats.streak ? state.stats.streak : 0) >= 3 ? 1 : 0,
  };

  if (roleId === "scholar") {
    base.insight += 2;
    base.resolve += 1;
  } else if (roleId === "knight") {
    base.bond += 2;
    base.resolve += 1;
  } else {
    base.insight += 1;
    base.resolve += 2;
  }

  if (inventoryIds.includes("scroll")) {
    base.insight += 1;
  }
  if (inventoryIds.includes("cloak")) {
    base.resolve += 1;
  }
  if (inventoryIds.includes("sigil")) {
    base.bond += 1;
  }

  return base;
}

function buildInitialDungeonFlags(state) {
  const inventoryIds = listInventoryIds(state);
  const flags = [];

  if (inventoryIds.includes("scroll")) {
    flags.push("item:scroll");
  }
  if (inventoryIds.includes("cloak")) {
    flags.push("item:cloak");
  }
  if (inventoryIds.includes("sigil")) {
    flags.push("item:sigil");
  }
  if (Number(state.stats && state.stats.streak ? state.stats.streak : 0) >= 3) {
    flags.push("state:streak-ready");
  }

  return flags;
}

function getStorylineEvent(storyline, eventId) {
  if (!storyline || !storyline.events || !eventId) {
    return null;
  }
  const event = storyline.events[eventId];
  if (!event) {
    return null;
  }
  return {
    ...event,
    eventId,
  };
}

function choiceRequirementsSatisfied(choice, state, run) {
  if (!choice) {
    return false;
  }

  const inventoryIds = listInventoryIds(state);
  const flagSet = new Set(Array.isArray(run && run.flags) ? run.flags : []);
  const routeState = run && run.routeState ? run.routeState : {};

  if (Array.isArray(choice.requiresInventory) && choice.requiresInventory.some((id) => !inventoryIds.includes(id))) {
    return false;
  }

  if (Array.isArray(choice.requiresFlags) && choice.requiresFlags.some((flag) => !flagSet.has(flag))) {
    return false;
  }

  if (choice.requiresRouteState && typeof choice.requiresRouteState === "object") {
    const required = choice.requiresRouteState;
    if (Number(routeState.insight || 0) < Number(required.insight || 0)) {
      return false;
    }
    if (Number(routeState.bond || 0) < Number(required.bond || 0)) {
      return false;
    }
    if (Number(routeState.resolve || 0) < Number(required.resolve || 0)) {
      return false;
    }
  }

  return true;
}

function buildAvailableStoryChoices(event, state, run) {
  if (!event || !Array.isArray(event.choices)) {
    return [];
  }

  const available = event.choices.filter((choice) => choiceRequirementsSatisfied(choice, state, run));
  return available.length > 0 ? available : event.choices;
}

function buildDungeonStateSummary(routeState, labels) {
  const source = routeState || {};
  const resolvedLabels = buildDungeonStateLabels(null, { stateLabels: labels });
  return `${resolvedLabels.insight} ${Number(source.insight || 0)} / ${resolvedLabels.bond} ${Number(
    source.bond || 0
  )} / ${resolvedLabels.resolve} ${Number(source.resolve || 0)}`;
}

function buildDungeonRewardSummary(effects = {}, labels) {
  const parts = [];

  if (Number(effects.growth || 0) > 0) {
    parts.push(`成长值 +${Number(effects.growth || 0)}`);
  }
  if (Number(effects.resources || 0) > 0) {
    parts.push(`资源点 +${Number(effects.resources || 0)}`);
  }

  const routeParts = [];
  const resolvedLabels = buildDungeonStateLabels(null, { stateLabels: labels });
  if (Number(effects.insight || 0) > 0) {
    routeParts.push(`${resolvedLabels.insight} +${Number(effects.insight || 0)}`);
  }
  if (Number(effects.bond || 0) > 0) {
    routeParts.push(`${resolvedLabels.bond} +${Number(effects.bond || 0)}`);
  }
  if (Number(effects.resolve || 0) > 0) {
    routeParts.push(`${resolvedLabels.resolve} +${Number(effects.resolve || 0)}`);
  }

  if (routeParts.length > 0) {
    parts.push(routeParts.join(" / "));
  }

  return parts.join("，");
}

function buildPreparedEnding(storyline, endingId) {
  if (!storyline || !storyline.endings || !storyline.endings[endingId]) {
    return null;
  }

  return {
    endingId,
    ...clone(storyline.endings[endingId]),
  };
}

function getActiveDungeonNode(state) {
  if (!state.dungeonRun || !state.dungeonRun.active) {
    return null;
  }

  const storyline = getDungeonStoryline(state.dungeonRun.storylineId || state.selectedRoleId);
  const activeEvent = getStorylineEvent(storyline, state.dungeonRun.currentEventId);
  if (!activeEvent) {
    return null;
  }

  return {
    nodeId: activeEvent.eventId,
    title: activeEvent.title,
    description: state.dungeonRun.stageTheme && state.dungeonRun.stageTheme.eventLead
      ? `${state.dungeonRun.stageTheme.eventLead}\n\n${activeEvent.description}`
      : activeEvent.description,
    choices: buildAvailableStoryChoices(activeEvent, state, state.dungeonRun).map((choice) => ({
      choiceId: choice.choiceId,
      label: choice.label,
    })),
  };
}

function buildDungeonRunSnapshot(state) {
  if (!state.dungeonRun) {
    return null;
  }

  const storyline = getDungeonStoryline(state.dungeonRun.storylineId || state.selectedRoleId);
  const labels = buildDungeonStateLabels(storyline, state.dungeonRun);
  const activeNode = getActiveDungeonNode(state);
  return {
    active: Boolean(state.dungeonRun.active),
    runId: state.dungeonRun.runId,
    startedAt: state.dungeonRun.startedAt,
    currentIndex: state.dungeonRun.currentIndex,
    totalNodes: Number(state.dungeonRun.totalNodes || (storyline && storyline.maxScenes) || 0),
    lineName: state.dungeonRun.lineName || (storyline && storyline.lineName) || null,
    chapterTitle: state.dungeonRun.chapterTitle || (storyline && storyline.chapterTitle) || null,
    stateSummary: buildDungeonStateSummary(state.dungeonRun.routeState, labels),
    recentOutcome: state.dungeonRun.recentOutcome || null,
    readyToSettle: Boolean(state.dungeonRun.readyToSettle),
    settled: Boolean(state.dungeonRun.settled),
    totals: {
      growth: Number(state.dungeonRun.totals && state.dungeonRun.totals.growth) || 0,
      resources: Number(state.dungeonRun.totals && state.dungeonRun.totals.resources) || 0,
    },
    activeNode,
    endingTitle: state.dungeonRun.preparedEnding && state.dungeonRun.preparedEnding.title,
    endingSummary: state.dungeonRun.endingSummary || null,
    planDate: state.dungeonRun.planDate || null,
    dailyPlanId: state.dungeonRun.dailyPlanId || null,
    stageGoalId: state.dungeonRun.stageGoalId || null,
    stageTitle: state.dungeonRun.stageTitle || null,
    nextStageTitle: state.dungeonRun.nextStageTitle || null,
    stageTheme: clone(state.dungeonRun.stageTheme),
    completionRoute: state.dungeonRun.completionRoute || null,
    routeLabel: state.dungeonRun.routeLabel || null,
    plannedTaskCount: Number(state.dungeonRun.plannedTaskCount || 0),
    completedTaskCount: Number(state.dungeonRun.completedTaskCount || 0),
    demoMode: Boolean(state.dungeonRun.demoMode),
    rewardEligible: Boolean(state.dungeonRun.rewardEligible),
    rewardGranted: Boolean(state.dungeonRun.rewardGranted),
    rewardPreview: {
      growth: Number(state.dungeonRun.rewardPreview && state.dungeonRun.rewardPreview.growth) || 0,
      resources: Number(state.dungeonRun.rewardPreview && state.dungeonRun.rewardPreview.resources) || 0,
    },
  };
}

function buildNarrativeContext(state) {
  return {
    characterArc: getCurrentCharacterArc(state),
    recentSummaries: getL1RecentSummaries(state.memoryTree, 8),
    permanentTitles: (state.memoryTree && state.memoryTree.permanentTitles) || [],
    worldEntities: listWorldEntities(state.worldState, 6),
    seasonDigests: getRecentSeasonDigests(state.memoryTree, 3),
  };
}

function ensureRoleDerivedState(state) {
  if (!state.initialized) {
    return false;
  }

  const role = getRole(state.selectedRoleId);
  const expectedSkillState = buildInitialSkillState(role);
  const expectedDungeon = buildInitialDungeonProfile(role);
  let changed = false;

  if (!state.skillState || !Array.isArray(state.skillState.unlockedSkillIds)) {
    state.skillState = expectedSkillState;
    changed = true;
  } else {
    if (!Array.isArray(state.skillState.lastTriggeredSkillIds)) {
      state.skillState.lastTriggeredSkillIds = [];
      changed = true;
    }
    if (typeof state.skillState.activationCount !== "number") {
      state.skillState.activationCount = 0;
      changed = true;
    }
    if (!Object.prototype.hasOwnProperty.call(state.skillState, "lastTriggeredAt")) {
      state.skillState.lastTriggeredAt = null;
      changed = true;
    }
    if (state.skillState.unlockedSkillIds.length === 0 && expectedSkillState.unlockedSkillIds.length > 0) {
      state.skillState.unlockedSkillIds = [...expectedSkillState.unlockedSkillIds];
      changed = true;
    }
  }

  if (!state.dungeon || !state.dungeon.baseStats) {
    state.dungeon = expectedDungeon;
    changed = true;
  } else {
    if (!state.dungeon.roleId) {
      state.dungeon.roleId = role.id;
      changed = true;
    }
    if (!state.dungeon.baseStats || Number(state.dungeon.baseStats.hp || 0) === 0) {
      state.dungeon.baseStats = { ...expectedDungeon.baseStats };
      changed = true;
    }
    if (!state.dungeon.temporaryBuffs) {
      state.dungeon.temporaryBuffs = { ...expectedDungeon.temporaryBuffs };
      changed = true;
    }
  }

  if (!state.memoryTree) {
    state.memoryTree = createEmptyMemoryTree();
    changed = true;
  }

  if (!state.worldState) {
    state.worldState = createEmptyWorldState();
    changed = true;
  }

  if (state.agent) {
    if (!state.agent.roleId) {
      state.agent.roleId = role.id;
      changed = true;
    }
    if (!state.agent.roleName) {
      state.agent.roleName = role.name;
      changed = true;
    }
    if (!state.agent.roleDescription) {
      state.agent.roleDescription = role.description;
      changed = true;
    }
    if (!state.agent.roleConfigPath) {
      state.agent.roleConfigPath = role.configPath;
      changed = true;
    }
    if (!state.agent.tone) {
      state.agent.tone = role.tone;
      changed = true;
    }
    if (!Array.isArray(state.agent.activeSkillIds) || state.agent.activeSkillIds.length === 0) {
      state.agent.activeSkillIds = [...state.skillState.unlockedSkillIds];
      changed = true;
    }
  }

  if (state.profile && state.agent && !state.memoryTree.activeSeason) {
    const season = startNewSeason(state.memoryTree, {
      seasonId: allocateId(state, "season"),
      index: (state.memoryTree.seasonArchives || []).length + 1,
      goal: state.profile.goal,
      roleId: role.id,
      roleName: role.name,
      chapterTitle: state.agent.chapter || role.chapter,
      startedAt: state.meta.updatedAt || new Date().toISOString(),
    });
    if (state.agent) {
      state.agent.currentSeasonId = season.seasonId;
    }
    changed = true;
  }

  if (state.memoryTree.activeSeason && state.agent) {
    if (!state.memoryTree.activeSeason.chapterTitle) {
      state.memoryTree.activeSeason.chapterTitle = state.agent.chapter || role.chapter;
      changed = true;
    }
    if (!state.agent.currentSeasonId) {
      state.agent.currentSeasonId = state.memoryTree.activeSeason.seasonId;
      changed = true;
    }
  }

  applyAgentArcState(state);
  return changed;
}

function syncAgentArtifacts(state) {
  if (!state.agent || !state.profile) {
    return null;
  }

  ensureRoleDerivedState(state);
  const role = getRole(state.selectedRoleId);
  const characterArc = applyAgentArcState(state);
  const memoryTreeSnapshot = buildMemoryTreeSnapshot(state.memoryTree);
  const worldStateSnapshot = getWorldStateSnapshot(state.worldState);

  state.agent.roleId = role.id;
  state.agent.roleConfigPath = role.configPath;
  state.agent.activeSkillIds = [...state.skillState.unlockedSkillIds];
  state.agent.currentSeasonId = state.memoryTree.activeSeason
    ? state.memoryTree.activeSeason.seasonId
    : null;

  const workspace = syncIdentity({
    role,
    profile: state.profile,
    agent: state.agent,
    skillState: getSkillStateSnapshot(state.skillState),
    dungeonProfile: getDungeonProfileSnapshot(state.dungeon),
    skillConfigPaths: getSkillsByIds(state.skillState.unlockedSkillIds).map((skill) => skill.configPath),
    characterArc,
    memoryTree: memoryTreeSnapshot,
    worldState: worldStateSnapshot,
  });
  syncMemory({
    agent: state.agent,
    memories: state.memories || [],
    memoryTree: memoryTreeSnapshot,
    worldState: worldStateSnapshot,
  });

  state.agent.identityPath = `runtime/agents/${state.agent.agentId}/IDENTITY.md`;
  state.agent.memoryPath = `runtime/agents/${state.agent.agentId}/MEMORY.md`;
  state.agent.agentDir = `runtime/agents/${state.agent.agentId}`;

  return workspace;
}

function migrateGoalPlanningState(state) {
  let changed = false;
  if (state.meta && Number(state.meta.version || 0) < 5) {
    state.meta.version = 5;
    changed = true;
  }
  if (!Array.isArray(state.taskHistory)) {
    state.taskHistory = [];
    changed = true;
  }
  if (!Array.isArray(state.dailyPlanHistory)) {
    state.dailyPlanHistory = [];
    changed = true;
  }
  if (!Object.prototype.hasOwnProperty.call(state, "dailyPlan")) {
    state.dailyPlan = null;
    changed = true;
  }
  if (!state.goalPlan || !Array.isArray(state.goalPlan.stageGoals)) {
    return changed;
  }

  const previousCurrentStageId = state.goalPlan.currentStageId;
  const customTaskIds = new Set(
    (state.tasks || [])
      .filter((task) => task && task.type === "side" && task.stageGoalId === previousCurrentStageId)
      .map((task) => task.id)
  );
  state.goalPlan.stageGoals.forEach((stage, stageIndex) => {
    if (!stage.id) {
      stage.id = allocateId(state, "stage");
      changed = true;
    }
    const sourceTasks = Array.isArray(stage.tasks) ? stage.tasks : [];
    stage.tasks = sourceTasks
      .filter((task) => !customTaskIds.has(task && task.id))
      .map((task, taskIndex) => {
        const matchingExecution = (state.tasks || []).find(
          (entry) => entry && (
            entry.stageTaskId === task.id ||
            entry.id === task.id ||
            (entry.stageGoalId === stage.id && entry.title === task.title)
          )
        );
        const id = task.id || (matchingExecution && matchingExecution.id) || allocateId(state, "stage-task");
        const status = String(
          task.status || (task.done ? "DONE" : "") || (matchingExecution && matchingExecution.done ? "DONE" : "TODO")
        ).toUpperCase() === "DONE" ? "DONE" : "TODO";
        if (!task.id || !task.stageGoalId || !Object.prototype.hasOwnProperty.call(task, "order")) {
          changed = true;
        }
        return {
          id,
          title: String(task.title || `任务 ${taskIndex + 1}`).trim(),
          description: String(task.description || task.detail || "").trim(),
          stageGoalId: stage.id,
          difficulty: Number(task.difficulty || 2),
          estimatedMinutes: normalizeEstimatedMinutes(task.estimatedMinutes || task.estimate, 25),
          status,
          rewardGrowth: Number(task.rewardGrowth || 12),
          rewardResource: Number(task.rewardResource || 14),
          narrativeHook: String(task.narrativeHook || "").trim(),
          order: Number.isFinite(Number(task.order)) ? Number(task.order) : taskIndex,
          completedAt: task.completedAt || (status === "DONE" && matchingExecution && matchingExecution.completedAt) || null,
        };
      });
    if (!stage.title) {
      stage.title = `阶段 ${stageIndex + 1}`;
      changed = true;
    }
  });
  const progressResult = refreshGoalPlanProgress(state);

  if (!state.dailyPlan && Array.isArray(state.tasks) && state.tasks.length > 0) {
    const planDate = getPlanDate(new Date(), state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE);
    const currentStage = getCurrentStage(state);
    const keptTasks = [];
    const archivedTasks = [];
    state.tasks.forEach((task) => {
      const isCustom = customTaskIds.has(task.id);
      if (isCustom || (currentStage && task.stageGoalId === currentStage.id)) {
        const stageMatch = isCustom || !currentStage
          ? null
          : currentStage.tasks.find((entry) => entry.id === task.id || entry.title === task.title);
        keptTasks.push({
          ...task,
          type: isCustom ? "side" : "main",
          stageTaskId: stageMatch ? stageMatch.id : null,
          scheduledDate: planDate,
          source: isCustom ? "CUSTOM" : "STAGE",
          carryoverCount: Number(task.carryoverCount || 0),
          completedAt: task.completedAt || (task.done ? new Date().toISOString() : null),
        });
      } else if (task.done) {
        archivedTasks.push({ ...task, archivedReason: "LEGACY_MIGRATION" });
      }
    });
    const dailyPlanId = allocateId(state, "daily-plan");
    keptTasks.forEach((task) => {
      task.dailyPlanId = dailyPlanId;
    });
    state.tasks = keptTasks;
    state.taskHistory.unshift(...archivedTasks);
    state.taskHistory = state.taskHistory.slice(0, 500);
    state.dailyPlan = {
      id: dailyPlanId,
      planDate,
      goalPlanId: state.goalPlan.id,
      stageGoalId: currentStage && currentStage.id,
      status: "ACTIVE",
      capacityMinutes: parseDailyMinutes(state.profile && state.profile.dailyTime, 120),
      taskIds: keptTasks.map((task) => task.id),
      source: "MIGRATION",
      version: 1,
      message: "已保留当前阶段任务，并启用每日计划。",
      generatedAt: new Date().toISOString(),
      completedAt: null,
      metrics: {},
    };
    updateDailyPlanMetrics(state);
    changed = true;
  }

  if (state.transition) {
    const shouldPrompt = Boolean(progressResult.goalCompleted);
    if (Boolean(state.transition.needsNewGoalPrompt) !== shouldPrompt) {
      state.transition.needsNewGoalPrompt = shouldPrompt;
      changed = true;
    }
  }
  return changed;
}

function migratePortfolioPlanningV4(state) {
  if (!state.goalPortfolio || !Array.isArray(state.goalPortfolio.goals)) return false;
  let changed = false;
  state.goalPortfolio.version = 2;
  const activeGoals = state.goalPortfolio.goals.filter((goal) => goal && goal.status === "ACTIVE");
  if (!activeGoals.some((goal) => goal.priority === "PRIMARY")) {
    activeGoals.forEach((goal, index) => {
      const next = index === 0 ? "PRIMARY" : index === 1 ? "SECONDARY" : "INACTIVE";
      if (goal.priority !== next) { goal.priority = next; changed = true; }
    });
  }
  state.goalPortfolio.goals.forEach((goal) => {
    if (!goal || Number(goal.planningVersion || 0) >= 4) {
      if (goal && !goal.plannedThroughDay) {
        goal.plannedThroughDay = Math.max(0, ...(goal.nodes || []).map((node) => Number(node.day) || 0));
        changed = true;
      }
      return;
    }
    const originalNodes = Array.isArray(goal.nodes) ? goal.nodes : [];
    const oldById = new Map(originalNodes.map((node) => [node.nodeId, node]));
    const orderedIds = Array.isArray(goal.constellations) && goal.constellations.length
      ? goal.constellations.flatMap((map) => Array.isArray(map.nodeIds) ? map.nodeIds : [])
      : originalNodes.slice().sort((a, b) => Number(a.day || 0) - Number(b.day || 0) || Number(a.slot || 0) - Number(b.slot || 0)).map((node) => node.nodeId);
    const orderedNodes = [...new Set(orderedIds)].map((id) => oldById.get(id)).filter(Boolean);
    originalNodes.forEach((node) => { if (!orderedNodes.includes(node)) orderedNodes.push(node); });
    const doneNodes = orderedNodes.filter((node) => node.status === "DONE").map((node) => ({
      ...node,
      legacyNode: true,
      priorityTier: "CORE",
      sourceRef: node.sourceRef || null,
    }));
    const linkedPending = (state.tasks || []).filter((task) => (
      task && task.portfolioGoalId === goal.goalId && !task.done
    ));
    const coreTask = linkedPending.find((task) => task.priorityTier === "CORE" || task.type === "main") || linkedPending[0];
    const coreNode = coreTask && orderedNodes.find((node) => node.status !== "DONE" && node.nodeId === coreTask.portfolioNodeId);
    const migratedNodes = [...doneNodes];
    let currentCoreNode = coreNode && !migratedNodes.some((node) => node.nodeId === coreNode.nodeId)
      ? { ...coreNode, legacyNode: true, priorityTier: "CORE", status: "AVAILABLE", releasedDate: coreNode.releasedDate || getPlanDate(new Date(), state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE), sourceRef: coreTask.sourceRef || coreNode.sourceRef || null }
      : null;
    // Some older snapshots kept the pending execution task but lost its
    // portfolioNodeId. Preserve that work as today's core node instead of
    // silently demoting it to an optional task during migration.
    if (coreTask && !currentCoreNode) {
      const durationDays = parseGoalDurationDays(goal.durationDays, 30);
      const fallbackDay = Math.max(
        1,
        Math.min(
          durationDays,
          Number(coreTask.portfolioDay || coreTask.scheduledDay || 0)
            || Math.max(1, Number(goal.completedDays || 0) + 1)
        )
      );
      currentCoreNode = {
        nodeId: `${goal.goalId}-core-${fallbackDay}-${allocateId(state, "node")}`,
        day: fallbackDay,
        slot: 1,
        status: "AVAILABLE",
        releasedDate: coreTask.scheduledDate || getPlanDate(new Date(), state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE),
        completedAt: null,
        planningStatus: "PLANNED",
        qualityScore: 0,
        taskRole: "LEARN",
        taskRoleLabel: "核心推进",
        priorityTier: "CORE",
        sourceRef: coreTask.sourceRef || null,
        selectionReason: "迁移时保留原有待执行核心任务。",
        legacyNode: true,
        title: coreTask.title || `第 ${fallbackDay} 天：推进「${goal.title}」的一个具体范围`,
        detail: coreTask.detail || "打开已确认的学习材料，完成一个可执行动作并记录结果。",
        estimatedMinutes: Math.max(5, Math.min(90, Number(coreTask.estimatedMinutes || 25))),
      };
      changed = true;
    }
    if (currentCoreNode) migratedNodes.push(currentCoreNode);
    const lastTouchedDay = Math.max(0, ...migratedNodes.map((node) => Number(node.day) || 0));
    const durationDays = parseGoalDurationDays(goal.durationDays, 30);
    let nextNodeDay = Math.max(1, lastTouchedDay + 1);
    while (nextNodeDay <= durationDays) {
      migratedNodes.push({
        nodeId: `${goal.goalId}-core-${nextNodeDay}-${allocateId(state, "node")}`,
        day: nextNodeDay,
        slot: 1,
        status: "LOCKED",
        releasedDate: null,
        completedAt: null,
        planningStatus: "PLANNED",
        qualityScore: 0,
        taskRole: "LEARN",
        taskRoleLabel: "核心推进",
        priorityTier: "CORE",
        sourceRef: null,
        selectionReason: "迁移后按新规则逐日推进。",
        legacyNode: false,
        title: `第 ${nextNodeDay} 天：推进「${goal.title}」的下一个具体范围`,
        detail: "打开已确认的学习材料，完成一个可执行动作并记录结果。",
        estimatedMinutes: Math.max(5, Math.min(90, Math.round(parseDailyMinutes(state.profile && state.profile.dailyTime, 120) * 0.6))),
      });
      nextNodeDay += 1;
    }
    const nodeIds = new Set(migratedNodes.map((node) => node.nodeId));
    let optionalKept = 0;
    linkedPending.forEach((task) => {
      if (coreTask && task.id === coreTask.id && currentCoreNode) {
        task.type = "main";
        task.priorityTier = "CORE";
        task.portfolioNodeId = currentCoreNode.nodeId;
        task.portfolioSlot = 1;
        task.portfolioDay = currentCoreNode.day;
        task.sourceRef = currentCoreNode.sourceRef || task.sourceRef || null;
        return;
      }
      if (optionalKept < 2) {
        task.type = "side";
        task.priorityTier = "OPTIONAL";
        task.portfolioNodeId = null;
        task.portfolioSlot = null;
        task.sourceRef = task.sourceRef || null;
        optionalKept += 1;
        return;
      }
      state.taskHistory.unshift({ ...task, status: "ARCHIVED", archivedReason: "PLANNING_V4_RESHAPE", archivedAt: new Date().toISOString() });
      state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
      changed = true;
    });
    goal.nodes = migratedNodes.filter((node, index, list) => node && node.nodeId && list.findIndex((entry) => entry.nodeId === node.nodeId) === index);
    goal.planningVersion = 4;
    goal.starsPerDay = 1;
    goal.totalStarCount = goal.nodes.length;
    goal.completedStars = goal.nodes.filter((node) => node.status === "DONE").length;
    goal.completedDays = 0;
    goal.plannedThroughDay = durationDays;
    if (!goal.planningBlueprint) {
      goal.planningBlueprint = buildPlanningBlueprint({
        goalTitle: goal.title,
        durationDays,
        plan: state.goalPlan,
      });
    }
    goal.migratedToPlanningV4At = goal.migratedToPlanningV4At || new Date().toISOString();
    goal.description = `每天完成 1 个核心任务，${goal.durationDays} 天按来源逐步推进。`;
    goal.planStatus = goal.planStatus || "LEGACY_MIGRATED";
    ensureGoalSeriesConstellations(state, goal);
    goal.status = goal.completedStars >= goal.totalStarCount && goal.totalStarCount > 0 ? "COMPLETED" : "ACTIVE";
    if (goal.status === "COMPLETED") goal.completedAt = goal.completedAt || new Date().toISOString();
    changed = true;
  });
  if (changed && state.dailyPlan) {
    (state.tasks || []).forEach((task) => {
      if (!task.dailyPlanId) task.dailyPlanId = state.dailyPlan.id;
    });
    state.dailyPlan.taskIds = (state.tasks || []).filter((task) => task.dailyPlanId === state.dailyPlan.id).map((task) => task.id);
    state.dailyPlan.optionalSlotsUsed = Math.min(PORTFOLIO_SIDE_TASKS_PER_DAY,
      (state.tasks || []).filter((task) => task.dailyPlanId === state.dailyPlan.id && task.priorityTier === "OPTIONAL").length);
    updateDailyPlanMetrics(state);
  }
  state.taskHistory = (state.taskHistory || []).slice(0, 500);
  return changed;
}

function migrateLegacyState(state) {
  if (!state.initialized || !state.agent) {
    return;
  }

  let changed = false;

  if (state.meta && Number(state.meta.version || 0) < 9) {
    state.meta.version = 9;
    changed = true;
  }

  if (!state.agent.agentId) {
    state.agent.agentId = allocateId(state, "agent");
    changed = true;
  }
  if (!state.agent.stage) {
    state.agent.stage = "chapter-legacy";
    changed = true;
  }
  if (!state.agent.emotion) {
    state.agent.emotion = "专注";
    changed = true;
  }
  if (!Array.isArray(state.memories)) {
    state.memories = [];
    changed = true;
  }
  if (!state.dungeonRun || typeof state.dungeonRun !== "object") {
    state.dungeonRun = createEmptyDungeonRun();
    changed = true;
  } else if (!Object.prototype.hasOwnProperty.call(state.dungeonRun, "storylineId")) {
    state.dungeonRun = createEmptyDungeonRun();
    changed = true;
  } else {
    if (!state.dungeonRun.routeState || typeof state.dungeonRun.routeState !== "object") {
      state.dungeonRun.routeState = createEmptyDungeonRun().routeState;
      changed = true;
    }
    if (!Array.isArray(state.dungeonRun.visitedEventIds)) {
      state.dungeonRun.visitedEventIds = [];
      changed = true;
    }
    if (!Array.isArray(state.dungeonRun.history)) {
      state.dungeonRun.history = [];
      changed = true;
    }
    if (!Array.isArray(state.dungeonRun.flags)) {
      state.dungeonRun.flags = [];
      changed = true;
    }
    if (!state.dungeonRun.totals || typeof state.dungeonRun.totals !== "object") {
      state.dungeonRun.totals = { growth: 0, resources: 0 };
      changed = true;
    }
    const dungeonDefaults = createEmptyDungeonRun();
    for (const key of [
      "planDate",
      "dailyPlanId",
      "stageGoalId",
      "stageTitle",
      "nextStageTitle",
      "stageTheme",
      "completionRoute",
      "routeLabel",
      "plannedTaskCount",
      "completedTaskCount",
      "completedTaskIds",
      "completedTaskTitles",
      "demoMode",
      "rewardEligible",
      "rewardGranted",
      "rewardPreview",
    ]) {
      if (!Object.prototype.hasOwnProperty.call(state.dungeonRun, key)) {
        state.dungeonRun[key] = clone(dungeonDefaults[key]);
        changed = true;
      }
    }
  }
  if (!Array.isArray(state.dungeonSettlementHistory)) {
    state.dungeonSettlementHistory = [];
    changed = true;
  }

  if (ensureStarMapState(state)) {
    changed = true;
  }

  if (ensureRoleDerivedState(state)) {
    changed = true;
  }
  if (migrateGoalPlanningState(state)) {
    changed = true;
  }
  if (migratePortfolioPlanningV4(state)) {
    changed = true;
  }
  if (ensureGoalPortfolioState(state)) {
    changed = true;
  }
  const portfolioAwards = state.goalPortfolio && Array.isArray(state.goalPortfolio.goals)
    ? state.goalPortfolio.goals.flatMap((goal) => collectCompletedPortfolioConstellations(state, goal))
    : [];
  if (portfolioAwards.length > 0
    || ((!state.goalPortfolio || state.goalPortfolio.goals.length === 0) && collectCompletedConstellations(state).length > 0)) {
    changed = true;
  }

  if (!state.overdueState) {
    state.overdueState = {
      maxOverdueDays: 0,
      lastNarrativeOverdueDays: 0,
      lastNarrativeTaskId: null,
      pendingNarrative: null,
    };
    changed = true;
  } else if (!Object.prototype.hasOwnProperty.call(state.overdueState, "lastNarrativeTaskId")) {
    state.overdueState.lastNarrativeTaskId = null;
    changed = true;
  } else if (!Object.prototype.hasOwnProperty.call(state.overdueState, "pendingNarrative")) {
    state.overdueState.pendingNarrative = null;
    changed = true;
  }
  if (ensureTaskDeadlines(state)) {
    changed = true;
  }
  if (syncOverdueNarrative(state)) {
    changed = true;
  }

  if (!state.agent.identityPath || !state.agent.memoryPath) {
    syncAgentArtifacts(state);
    changed = true;
  }

  if (changed) {
    saveStore();
  }
}

function resetSessionState(state) {
  clearRuntimeSecrets();
  state.initialized = false;
  state.profile = null;
  state.agent = null;
  state.openingNarrative = null;
  state.lastStory = null;
  state.lastRewardSummary = null;
  state.tasks = [];
  state.taskHistory = [];
  state.goalPlan = null;
  state.dailyPlan = null;
  state.dailyPlanHistory = [];
  state.goalPortfolio = { version: 2, goals: [] };
  state.nextSuggestion = null;
  state.diary = [];
  state.skillState = {
    unlockedSkillIds: [],
    lastTriggeredSkillIds: [],
    activationCount: 0,
    lastTriggeredAt: null,
  };
  state.overdueState = {
    maxOverdueDays: 0,
    lastNarrativeOverdueDays: 0,
    lastNarrativeTaskId: null,
    pendingNarrative: null,
  };
  state.dungeon = {
    roleId: null,
    baseStats: {
      hp: 0,
      attack: 0,
      defense: 0,
      shield: 0,
    },
    temporaryBuffs: {
      hp: 0,
      attack: 0,
      defense: 0,
      shield: 0,
    },
  };
  state.dungeonRun = createEmptyDungeonRun();
  state.dungeonSettlementHistory = [];
  state.starMap = createEmptyStarMap();
  state.inventory = [];
  state.shop = defaultShop.map((item) => ({ ...item }));
  state.transition = {
    needsNewGoalPrompt: false,
    promptVersion: 0,
  };
  state.memories = [];
  state.memoryTree = createEmptyMemoryTree();
  state.worldState = createEmptyWorldState();
}

async function getCurrentSessionState() {
  const state = getState();
  migrateLegacyState(state);
  const goalPlanChanged = await ensureGoalPlan(state);
  const portfolioChanged = ensureGoalPortfolioState(state);
  const constellationChanged = state.goalPortfolio && state.goalPortfolio.goals.length > 0
    ? state.goalPortfolio.goals.flatMap((goal) => collectCompletedPortfolioConstellations(state, goal)).length > 0
    : collectCompletedConstellations(state).length > 0;
  const reviewChanged = materializeScheduledStarReviews(state);
  const dailyPlanChanged = await ensureDailyPlan(state);
  const overdueChanged = ensureTaskDeadlines(state);
  const narrativeChanged = syncOverdueNarrative(state);
  refreshGoalPlanProgress(state);
  if (goalPlanChanged || portfolioChanged || constellationChanged || reviewChanged || dailyPlanChanged || overdueChanged || narrativeChanged) {
    saveStore();
  }

  return clone({
    initialized: state.initialized,
    selectedRoleId: state.selectedRoleId,
    profile: state.profile,
    stats: state.stats,
    agent: state.agent,
    tasks: state.tasks,
    taskHistory: state.taskHistory,
    goalPlan: state.goalPlan,
    goalPortfolio: state.goalPortfolio,
    dailyPlan: state.dailyPlan,
    dailyPlanHistory: state.dailyPlanHistory,
    nextSuggestion: state.nextSuggestion,
    diary: state.diary,
    starMap: state.starMap,
    inventory: state.inventory,
    shop: state.shop,
    transition: state.transition,
    skillState: getSkillStateSnapshot(state.skillState),
    overdueState: state.overdueState,
    dungeonProfile: getDungeonProfileSnapshot(state.dungeon),
    characterArc: getCurrentCharacterArc(state),
    memoryTree: buildMemoryTreeSnapshot(state.memoryTree),
    worldState: getWorldStateSnapshot(state.worldState),
    openingNarrative: state.openingNarrative,
    lastStory: state.lastStory,
    lastRewardSummary: state.lastRewardSummary,
    agentMeta: state.agent
      ? {
          agentId: state.agent.agentId,
          memoryCount: state.agent.memoryCount || 0,
          lastMemoryAt: state.agent.lastMemoryAt || null,
          identityPath: state.agent.identityPath,
          memoryPath: state.agent.memoryPath,
          llmEnabled: Boolean(getResolvedApiKey(getDeepseekApiKey())),
        }
      : null,
  });
}

async function createSession(payload) {
  const state = getState();
  const confirmedDraft = payload && payload.confirmedDraft ? payload.confirmedDraft : null;
  if (!confirmedDraft && env.nodeEnv !== "test") {
    throw new AppError("GOAL_DRAFT_REQUIRED", "初始化必须先确认学习来源和计划", 410);
  }
  const draftProfile = confirmedDraft && confirmedDraft.goalProfile || {};
  const requestedRoleId = String((confirmedDraft ? draftProfile.roleId : payload.roleId) || "scholar").trim();
  const role = getRoleOrThrow(requestedRoleId);
  const account = String(payload.account || "").trim();
  const password = String(payload.password || "").trim();
  const sessionApiKey = String(payload.apiKey || "").trim();
  const profile = {
    name: String((confirmedDraft ? draftProfile.name : payload.name) || "林岚").trim(),
    goal: String((confirmedDraft ? draftProfile.title : payload.goal) || "").trim(),
    deadline: String((confirmedDraft ? draftProfile.deadline : payload.deadline) || "30 天后").trim(),
    dailyTime: String((confirmedDraft ? draftProfile.dailyTime : payload.dailyTime) || "2 小时").trim(),
    currentLevel: String((confirmedDraft ? draftProfile.currentLevel : payload.currentLevel) || "UNSYSTEMATIC").trim(),
    sourcePreference: String((confirmedDraft ? draftProfile.sourcePreference : payload.sourcePreference) || "ANY").trim(),
    accessPreference: String((confirmedDraft ? draftProfile.accessPreference : payload.accessPreference) || "FREE_ONLY").trim(),
  };

  if (!account) {
    throw new Error("缺少登录账号");
  }
  if (!password) {
    throw new Error("缺少登录密码");
  }
  if (!profile.goal) {
    throw new Error("缺少短期目标");
  }

  await assertAccountAvailable(account);
  resetSessionState(state);
  setDeepseekApiKey(sessionApiKey);
  state.initialized = true;
  state.selectedRoleId = role.id;
  state.profile = profile;
  state.stats = {
    level: 3,
    growth: 58,
    nextLevel: 100,
    resources: 92,
    streak: 4,
  };
  state.agent = buildAgent(role, state, profile);
  state.skillState = buildInitialSkillState(role);
  state.dungeon = buildInitialDungeonProfile(role);
  applyAgentArcState(state);

  const openingAsset = selectEventStoryAsset(state, {
    roleId: role.id,
    eventTag: "session.created",
    phase: "opening",
    text: profile.goal,
  });

  const blueprint = await generateGoalBlueprint({
    role,
    profile,
    currentChapter: role.chapter,
    apiKey: getDeepseekApiKey(),
    characterArc: getCurrentCharacterArc(state),
    permanentTitles: [],
    worldEntities: [],
    seasonDigests: [],
    storyAsset: openingAsset,
  });

  state.agent.chapter = blueprint.chapterTitle || role.chapter;
  state.agent.mainline = blueprint.mainlineSummary || buildMainline(profile.goal, role);
  state.agent.blueprintSource = blueprint.source;
  state.agent.activeSkillIds = [...state.skillState.unlockedSkillIds];
  let approvedPlan = null;
  if (confirmedDraft) {
    approvedPlan = confirmedDraft.planDraft || buildFallbackPlan({
      goalProfile: {
        title: profile.goal,
        durationDays: parseGoalDurationDays(profile.deadline, 30),
        dailyBudgetMinutes: parseDailyMinutes(profile.dailyTime, 120),
      },
      sources: confirmedDraft.selectedSources || [],
      selectedSourceIds: confirmedDraft.selectedSourceIds || [],
    });
    state.goalPlan = buildLegacyPlanFromSourceBoundDraft({
      goalProfile: { title: profile.goal, durationDays: parseGoalDurationDays(profile.deadline, 30) },
      planDraft: approvedPlan,
    }, state);
  } else {
    await buildGoalPlanForState(state, profile.goal, [
      { id: "deadline", question: "距离关键节点或截止日期还有多久？", answer: profile.deadline },
      { id: "dailyTime", question: "每天大约能稳定投入几小时？", answer: profile.dailyTime },
    ]);
  }
  state.openingNarrative = blueprint.openingStory;
  state.lastStory = blueprint.openingStory;
  state.lastRewardSummary = "获得初始成长值 +58，资源点 +92";
  state.inventory = [
    { id: "badge", name: "启程徽记", detail: "进入主线后自动获得", equipped: true },
    { id: "agent", name: role.agentName, detail: "负责将学习记录写成冒险故事", equipped: true },
    ...buildSkillInventoryEntries(state.skillState.unlockedSkillIds),
  ];
  state.shop = defaultShop.map((item) => ({ ...item }));
  state.memories = [];

  const activeSeason = startNewSeason(state.memoryTree, {
    seasonId: allocateId(state, "season"),
    index: 1,
    goal: profile.goal,
    roleId: role.id,
    roleName: role.name,
    chapterTitle: state.agent.chapter,
  });
  state.agent.currentSeasonId = activeSeason.seasonId;

  createDiaryEntry(state, {
    title: "世界初始化完成",
    body: blueprint.openingStory,
    reward: "获得初始成长值 +58，资源点 +92",
  });

  createMemoryEntry(state, {
    type: "init",
    title: "旅程初始化",
    memorySummary: `围绕目标“${profile.goal}”完成第一轮主线初始化`,
    storyText: blueprint.openingStory,
    reward: "初始成长值 +58 / 资源点 +92",
    storyAsset: openingAsset,
  });

  // Finish all asynchronous world/plan generation before committing the
  // account. A failed initialization must not leave a login-only ghost account.
  if (confirmedDraft) {
    const confirmedGoal = buildPortfolioGoal(state, {
      title: profile.goal,
      durationDays: draftProfile.durationDays || parseGoalDurationDays(profile.deadline, 30),
      plan: state.goalPlan,
      sourceBoundPlan: approvedPlan,
      learningSources: confirmedDraft.selectedSources || [],
      selectedSourceBundleId: confirmedDraft.selectedBundleId,
      sourcePreferences: {
        currentLevel: profile.currentLevel,
        sourcePreference: profile.sourcePreference,
        accessPreference: profile.accessPreference,
      },
      originDraftId: confirmedDraft.draftId,
      planStatus: "CONFIRMED",
      planConfirmedAt: confirmedDraft.updatedAt || new Date().toISOString(),
      constellationIndex: 0,
      priority: "PRIMARY",
    });
    state.goalPortfolio = { version: 2, goals: [confirmedGoal] };
  } else {
    ensureGoalPortfolioState(state);
  }
  await ensureDailyPlan(state, { source: "SESSION_CREATED" });
  syncAgentArtifacts(state);

  const accountRecord = await registerAccount({
    account,
    password,
    nickname: profile.name,
  });
  state.profile.userId = accountRecord.userId;
  state.profile.account = accountRecord.account;

  if (getRequestContext()) {
    await bindUserToRequest(accountRecord.userId, { useCurrentState: true });
  }
  const sessionToken = await createAuthSession(accountRecord.userId);

  saveStore();

  return {
    tag: "session.created",
    title: "旅程初始化完成",
    storyText: blueprint.openingStory,
    rewardSummary: "获得初始成长值 +58，资源点 +92",
    characterArc: getCurrentCharacterArc(state),
    storyAsset: openingAsset,
    sessionToken,
  };
}

async function createParallelGoalFromConfirmedDraft(draft) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);
  ensureGoalPortfolioState(state);
  const profile = draft.goalProfile || {};
  const title = String(profile.title || "").trim();
  if (!title) throw new AppError("INVALID_GOAL_PROFILE", "长期目标不能为空", 400);
  if ((state.goalPortfolio.goals || []).some((goal) => goal && goal.status === "ACTIVE" && goal.title === title)) {
    throw new AppError("DUPLICATE_GOAL", "该长期目标已经在进行中", 409);
  }
  const activeGoals = (state.goalPortfolio.goals || []).filter((goal) => goal && goal.status === "ACTIVE");
  const priority = activeGoals.some((goal) => goal.priority === "PRIMARY")
    ? activeGoals.some((goal) => goal.priority === "SECONDARY") ? "INACTIVE" : "SECONDARY"
    : "PRIMARY";
  const goal = buildPortfolioGoal(state, {
    title,
    durationDays: profile.durationDays || parseGoalDurationDays(profile.deadline, 30),
    plan: buildLegacyPlanFromSourceBoundDraft(draft, state),
    sourceBoundPlan: draft.planDraft,
    learningSources: draft.selectedSources || [],
    selectedSourceBundleId: draft.selectedBundleId,
    sourcePreferences: {
      currentLevel: profile.currentLevel,
      sourcePreference: profile.sourcePreference,
      accessPreference: profile.accessPreference,
    },
    originDraftId: draft.draftId,
    planStatus: "CONFIRMED",
    planConfirmedAt: draft.updatedAt || new Date().toISOString(),
    constellationIndex: state.goalPortfolio.goals.length,
    priority,
  });
  state.goalPortfolio.version = 2;
  state.goalPortfolio.goals.push(goal);
  state.transition.needsNewGoalPrompt = false;
  state.agent.emotion = "期待";
  state.lastStory = `长期目标「${title}」已加入并行星图。`;
  state.lastRewardSummary = `${profile.durationDays || goal.durationDays} 天学习路线已确认`;
  await ensureDailyPlan(state, { source: "GOAL_ADDED" });
  syncAgentArtifacts(state);
  saveStore();
  return {
    tag: "goal.created.parallel",
    title: "长期目标已加入",
    storyText: state.lastStory,
    rewardSummary: state.lastRewardSummary,
  };
}

async function confirmGoalDraftUnlocked(preparedDraft, payload = {}) {
  const draft = preparedDraft;
  const confirmationKey = String(payload.confirmationKey || "").trim();
  if (confirmationKey.length < 8 || confirmationKey.length > 120) {
    throw new AppError("CONFIRMATION_KEY_INVALID", "确认请求标识无效", 400);
  }
  const existing = findConfirmationReceipt(draft.draftId, confirmationKey);
  if (existing && existing.event) return existing.event;
  const currentDraft = getGoalDraft(draft.draftId);
  if (currentDraft.status === "CONFIRMED") {
    throw new AppError("DRAFT_ALREADY_CONFIRMED", "该学习路线已经确认", 409);
  }
  const existingGoal = getState().goalPortfolio && (getState().goalPortfolio.goals || [])
    .find((goal) => goal.originDraftId === draft.draftId);
  if (existingGoal) {
    const recovered = {
      tag: draft.mode === "INITIAL" ? "session.created" : "goal.created.parallel",
      title: draft.mode === "INITIAL" ? "旅程初始化完成" : "长期目标已加入",
      storyText: getState().lastStory || `学习路线「${existingGoal.title}」已确认。`,
      rewardSummary: getState().lastRewardSummary || "学习路线已确认",
    };
    markGoalDraftConfirmed(draft.draftId, draft.revision, { confirmationKey, goalId: existingGoal.goalId, event: recovered });
    return recovered;
  }

  let event;
  if (draft.mode === "INITIAL") {
    const registration = payload.registration || {};
    const account = String(registration.account || "").trim();
    const password = String(registration.password || "").trim();
    if (!account || !password) throw new AppError("REGISTRATION_REQUIRED", "首次初始化需要账号和密码", 400);
    event = await createSession({
      account,
      password,
      apiKey: String(registration.apiKey || "").trim(),
      confirmedDraft: draft,
    });
  } else {
    event = await createParallelGoalFromConfirmedDraft(draft);
  }
  const state = getState();
  const createdGoal = state.goalPortfolio && state.goalPortfolio.goals
    ? state.goalPortfolio.goals.find((goal) => goal.originDraftId === draft.draftId)
    : null;
  const receiptEvent = { ...event };
  delete receiptEvent.sessionToken;
  markGoalDraftConfirmed(draft.draftId, draft.revision, {
    confirmationKey,
    goalId: createdGoal && createdGoal.goalId,
    event: receiptEvent,
  });
  return event;
}

async function confirmGoalDraft(preparedDraft, payload = {}) {
  const draftId = preparedDraft && preparedDraft.draftId;
  const previous = confirmationLocks.get(draftId) || Promise.resolve();
  const current = previous.catch(() => {}).then(() => confirmGoalDraftUnlocked(preparedDraft, payload));
  confirmationLocks.set(draftId, current);
  try {
    return await current;
  } finally {
    if (confirmationLocks.get(draftId) === current) confirmationLocks.delete(draftId);
  }
}

async function updateGoalPriority(goalId, priority) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);
  const goal = (state.goalPortfolio.goals || []).find((entry) => entry && entry.goalId === String(goalId || ""));
  if (!goal) throw new AppError("GOAL_NOT_FOUND", "长期目标不存在", 404);
  const nextPriority = ["PRIMARY", "SECONDARY", "INACTIVE"].includes(priority) ? priority : "";
  if (!nextPriority) throw new AppError("GOAL_PRIORITY_INVALID", "目标优先级无效", 400);
  const goals = state.goalPortfolio.goals;
  if (nextPriority === "PRIMARY") {
    const oldPrimary = goals.find((entry) => entry.priority === "PRIMARY" && entry.goalId !== goal.goalId);
    const oldSecondary = goals.find((entry) => entry.priority === "SECONDARY" && entry.goalId !== goal.goalId);
    if (oldPrimary) oldPrimary.priority = oldSecondary && oldSecondary.goalId !== goal.goalId ? "INACTIVE" : "SECONDARY";
    goal.priority = "PRIMARY";
  } else if (nextPriority === "SECONDARY") {
    const oldSecondary = goals.find((entry) => entry.priority === "SECONDARY" && entry.goalId !== goal.goalId);
    if (oldSecondary) oldSecondary.priority = "INACTIVE";
    if (!goals.some((entry) => entry.priority === "PRIMARY")) goal.priority = "PRIMARY";
    else goal.priority = "SECONDARY";
  } else {
    goal.priority = "INACTIVE";
  }
  const activeGoals = goals.filter((entry) => entry && entry.status === "ACTIVE");
  if (!activeGoals.some((entry) => entry.priority === "PRIMARY") && activeGoals.length) {
    activeGoals[0].priority = "PRIMARY";
  }
  let secondarySeen = false;
  activeGoals.forEach((entry) => {
    if (entry.priority !== "SECONDARY") return;
    if (secondarySeen) entry.priority = "INACTIVE";
    secondarySeen = true;
  });
  state.goalPortfolio.version = 2;
  // Rebuild generated optional actions immediately so a priority change is
  // reflected in today's queue. User-created actions remain untouched.
  if (state.dailyPlan) {
    const generatedOptionalIds = new Set(
      (state.tasks || [])
        .filter((task) => task && !task.done && task.priorityTier === "OPTIONAL" && task.source !== "CUSTOM")
        .map((task) => task.id)
    );
    if (generatedOptionalIds.size > 0) {
      const removed = (state.tasks || []).filter((task) => generatedOptionalIds.has(task.id));
      removed.forEach((task) => archiveUnscheduledTask(state, task, "OPTIONAL_PRIORITY_REBUILT"));
      state.tasks = (state.tasks || []).filter((task) => !generatedOptionalIds.has(task.id));
      state.dailyPlan.taskIds = (state.dailyPlan.taskIds || []).filter((id) => !generatedOptionalIds.has(id));
      state.dailyPlan.optionalTaskIds = (state.dailyPlan.optionalTaskIds || []).filter((id) => !generatedOptionalIds.has(id));
      state.dailyPlan.optionalSlotsUsed = Math.max(0, Number(state.dailyPlan.optionalSlotsUsed || 0) - generatedOptionalIds.size);
    }
  }
  state.lastStory = `目标「${goal.title}」已调整为${goal.priority === "PRIMARY" ? "主目标" : goal.priority === "SECONDARY" ? "次目标" : "暂停自动发布"}。`;
  await ensureDailyPlan(state, { source: "GOAL_PRIORITY_UPDATED", force: true });
  saveStore();
  return { tag: "goal.priority.updated", title: "目标优先级已更新", storyText: state.lastStory, rewardSummary: "" };
}

async function loginSession(payload) {
  const account = String(payload.account || "").trim();
  const password = String(payload.password || "").trim();
  const accountRecord = await authenticateAccount(account, password);
  const snapshot = await loadAccountSnapshot(accountRecord.userId);

  if (!snapshot || !snapshot.state) {
    throw new Error("该账号尚未完成初始化，请先注册");
  }

  if (getRequestContext()) {
    // Restore the persisted version as well as the user identity. A fresh login
    // has no bearer token, so its request context starts at version zero.
    await bindUserToRequest(accountRecord.userId);
  }
  setDeepseekApiKey(snapshot.apiKey || "");
  replaceState(clone(snapshot.state));

  const state = getState();
  migrateLegacyState(state);
  if (!state.profile) {
    throw new Error("账号数据损坏，请重新注册");
  }

  state.profile.userId = accountRecord.userId;
  state.profile.account = accountRecord.account;
  if (!state.profile.name && accountRecord.nickname) {
    state.profile.name = accountRecord.nickname;
  }

  syncAgentArtifacts(state);
  saveStore();
  await updateLastLoginAt(accountRecord.userId);
  const sessionToken = await createAuthSession(accountRecord.userId);

  return {
    tag: "session.logged_in",
    title: "登录成功",
    storyText: `欢迎回来，${state.profile.name || accountRecord.nickname || accountRecord.account}。`,
    rewardSummary: state.profile.goal
      ? `当前主线目标：${state.profile.goal}`
      : "已恢复账号状态",
    characterArc: getCurrentCharacterArc(state),
    sessionToken,
  };
}

async function completeTask(taskId, payload = {}) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);

  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error("任务不存在");
  }
  if (task.done) {
    throw new Error("该任务已经完成");
  }

  const completionSummary = normalizeOptionalSummary(payload && payload.summary);

  const role = getRole(state.selectedRoleId);
  const currentChapterTitle = state.agent.chapter;
  ensureTaskDeadlines(state);
  const overdueDays = getOverdueDays(task);
  const baseRewardGrowth = getEffectiveRewardGrowth(task);
  const rewardTask = {
    ...task,
    rewardGrowth: baseRewardGrowth,
    completionSummary,
  };
  task.done = true;
  task.completionSummary = completionSummary;
  task.completedAt = new Date().toISOString();
  task.overdueDays = 0;
  task.debuffActive = false;
  let stageProgress = {
    previousStageId: null,
    currentStageId: null,
    stageAdvanced: false,
    goalCompleted: false,
  };
  let constellationAwards = [];
  if (task.portfolioGoalId && task.portfolioNodeId) {
    const { goal, node } = findPortfolioGoalAndNode(state, task.portfolioGoalId, task.portfolioNodeId);
    if (!goal || !node) throw new Error("长期目标日节点不存在");
    node.status = "DONE";
    node.completedAt = task.completedAt;
    node.completionSummary = completionSummary || null;
    refreshPortfolioGoalMetrics(goal);
    if (goal.status === "COMPLETED") {
      goal.completedAt = task.completedAt;
    }
    constellationAwards = collectCompletedPortfolioConstellations(state, goal)
      .map((award) => ({ title: `${award.map.constellationName} · ${goal.title}`, tool: award.tool }));
    state.transition.needsNewGoalPrompt = false;
  } else if (task.portfolioGoalId) {
    // Goal-linked side quests belong to today's five-task group but never light a star.
    state.transition.needsNewGoalPrompt = false;
  } else {
    const linkedStageTask = findStageTask(state, task.stageTaskId);
    if (linkedStageTask) {
      linkedStageTask.task.status = "DONE";
      linkedStageTask.task.completedAt = task.completedAt;
    }
    stageProgress = refreshGoalPlanProgress(state);
    constellationAwards = collectCompletedConstellations(state);
  }
  updateDailyPlanMetrics(state);

  const skillResolution = evaluateTriggeredSkills({
    role,
    state,
    task: rewardTask,
  });

  state.stats.growth += baseRewardGrowth;
  state.stats.resources += task.rewardResource;

  if (skillResolution.triggeredSkills.length > 0) {
    applyTriggeredSkillEffects(state, skillResolution);
    state.agent.emotion = "共鸣";
  } else {
    clearLastTriggeredSkills(state);
    state.agent.emotion = "专注";
  }

  const totalGrowth = baseRewardGrowth + skillResolution.rewardGrowthDelta;
  const totalResource = task.rewardResource + skillResolution.rewardResourceDelta;
  const levelUps = calculateLevelUps(state);
  const characterArc = applyAgentArcState(state);

  const allMainDone = stageProgress.goalCompleted;
  const skillEffectSummary = buildSkillEffectSummary(skillResolution);
  const narrativeContext = buildNarrativeContext(state);
  const storyAsset = selectEventStoryAsset(state, {
    eventTag: task.type === "main" ? "task.completed.main" : "task.completed.side",
    taskType: task.type,
    phase: allMainDone ? "finale" : task.type,
    taskTitle: task.title,
    text: `${task.title} ${task.detail || ""} ${skillEffectSummary}`,
    allMainDone,
    triggeredSkills: skillResolution.publicTriggeredSkills,
  });

  const story = await generateTaskNarrative({
    role,
    agent: state.agent,
    profile: state.profile,
    task: rewardTask,
    stats: state.stats,
    recentSummaries: narrativeContext.recentSummaries,
    allMainDone,
    apiKey: getDeepseekApiKey(),
    triggeredSkills: skillResolution.publicTriggeredSkills,
    skillPromptText: skillResolution.promptText,
    skillEffectSummary,
    characterArc,
    userSummary: completionSummary || null,
    permanentTitles: narrativeContext.permanentTitles,
    worldEntities: narrativeContext.worldEntities,
    seasonDigests: narrativeContext.seasonDigests,
    storyAsset,
  });

  const constellationRewardText = constellationAwards.length > 0
    ? ` / 星宿「${constellationAwards[0].title}」已收录，获得${constellationAwards[0].tool.name} ×1`
    : "";
  const rewardSummary =
    buildRewardSummary(baseRewardGrowth, task.rewardResource, skillResolution) +
    (overdueDays > 0 ? ` / 超时 Debuff：已超时 ${overdueDays} 天，成长值按 70% 结算` : "") +
    constellationRewardText;
  const touchedWorldEntities = upsertWorldEntities(state.worldState, story.worldEntities || [], {
    sourceSeasonId: state.agent.currentSeasonId,
    sourceTaskId: task.id,
  });

  createDiaryEntry(state, {
    title: `${task.type === "main" ? "主线推进" : "支线完成"}：${task.title}`,
    body: `${story.storyText}${levelUps > 0 ? ` 角色升至 Lv.${state.stats.level}。` : ""}${completionSummary ? `\n\n今日总结：${completionSummary}` : ""}`,
    reward: rewardSummary,
  });

  const taskMemory = createMemoryEntry(state, {
    type: task.type === "main" ? "task_completed_main" : "task_completed_side",
    title: `${task.type === "main" ? "主线" : "支线"}完成：${task.title}`,
    memorySummary: completionSummary ? `${story.memorySummary} 用户总结：${completionSummary}` : story.memorySummary,
    storyText: story.storyText,
    reward: rewardSummary,
    relatedTaskId: task.id,
    storyAsset,
    skillsTriggered: skillResolution.triggeredSkills.map((skill) => skill.name),
    dungeonBuffs:
      skillResolution.triggeredSkills.length > 0
        ? { ...skillResolution.effectTotals.dungeonBuff }
        : null,
    worldEntities: touchedWorldEntities,
  });

  recordTaskMemory(state.memoryTree, {
    memoryId: taskMemory.id,
    title: taskMemory.title,
    memorySummary: taskMemory.memorySummary,
    taskId: task.id,
    createdAt: taskMemory.createdAt,
  });

  let chapterFinaleResult = null;
  if (stageProgress.stageAdvanced) {
    const previousStage = state.goalPlan.stageGoals.find((stage) => stage.id === stageProgress.previousStageId);
    const nextStage = getCurrentStage(state);
    const transitionText = `阶段「${previousStage ? previousStage.title : "上一阶段"}」已完成，主线自动进入「${nextStage ? nextStage.title : "下一阶段"}」。`;
    state.transition.needsNewGoalPrompt = false;
    state.agent.mainline = nextStage
      ? `当前阶段：${nextStage.title}。完成该阶段全部必做任务后将自动继续推进。`
      : state.agent.mainline;
    state.agent.stage = "stage-advanced";
    state.agent.emotion = "前进";
    createDiaryEntry(state, {
      title: "主线阶段推进",
      body: transitionText,
      reward: "下一阶段已解锁",
    });
    createMemoryEntry(state, {
      type: "stage_advanced",
      title: `进入阶段：${nextStage ? nextStage.title : "下一阶段"}`,
      memorySummary: transitionText,
      storyText: transitionText,
      reward: "目标路线继续推进",
    });
  }
  if (allMainDone) {
    const finaleContext = buildNarrativeContext(state);
    chapterFinaleResult = await generateChapterFinale({
      role,
      agent: state.agent,
      profile: state.profile,
      chapterTitle: currentChapterTitle,
      taskSummaries: state.memoryTree.activeSeason
        ? state.memoryTree.activeSeason.taskMemories
        : finaleContext.recentSummaries,
      apiKey: getDeepseekApiKey(),
      characterArc: finaleContext.characterArc,
      permanentTitles: finaleContext.permanentTitles,
      worldEntities: finaleContext.worldEntities,
      seasonDigests: finaleContext.seasonDigests,
    });

    createDiaryEntry(state, {
      title: `章节大结局：${currentChapterTitle}`,
      body: chapterFinaleResult.chapterFinale,
      reward: "章节终章已写入史诗纪要",
    });

    createMemoryEntry(state, {
      type: "chapter_finale",
      title: `章节大结局：${currentChapterTitle}`,
      memorySummary: chapterFinaleResult.chapterDigest,
      storyText: chapterFinaleResult.chapterFinale,
      reward: "章节终章已归档",
    });

    recordChapterFinale(state.memoryTree, {
      chapterTitle: currentChapterTitle,
      title: `章节大结局：${currentChapterTitle}`,
      finalText: chapterFinaleResult.chapterFinale,
      finalDigest: chapterFinaleResult.chapterDigest,
    });

    state.transition.needsNewGoalPrompt = true;
    state.transition.promptVersion += 1;
    state.agent.mainline = "长期目标的全部阶段已经完成，可以输入下一项长期目标开启新的主线。";
    state.agent.chapter = `${role.chapter} · 长期目标已完成`;
    state.agent.stage = "awaiting-next-goal";
    state.agent.emotion = "期待";

    createDiaryEntry(state, {
      title: "长期目标完成",
      body: "长期目标中的全部阶段任务已经完成，章节终章已生成。系统将邀请用户输入下一项长期目标。",
      reward: "等待输入新的长期目标",
    });

    createMemoryEntry(state, {
      type: "mainline_complete",
      title: "长期目标主线完成",
      memorySummary: "长期目标全部完成，等待新的长期目标",
      storyText: "长期目标中的全部阶段已经完成，可以开启一条新的长期目标主线。",
      reward: "等待新的长期目标",
    });
  }

  refreshGoalPlanProgress(state);
  state.nextSuggestion = task.portfolioNodeId
    ? `「${task.goalTitle}」的一颗主线星已点亮，今天的核心行动已完成。`
    : task.portfolioGoalId
      ? `「${task.goalTitle}」的今日支线已完成，支线不计入星图进度。`
    : await planNextSuggestion(state.goalPlan, task, state.stats, {
        apiKey: getDeepseekApiKey(),
      });
  syncAgentArtifacts(state);
  state.lastStory = chapterFinaleResult
    ? `${story.storyText}\n\n【章节大结局】\n${chapterFinaleResult.chapterFinale}`
    : story.storyText;
  state.lastRewardSummary = rewardSummary;
  saveStore();

  return {
    tag: task.type === "main" ? "task.completed.main" : "task.completed.side",
    title: task.type === "main" ? "任务完成，剧情推进" : "支线完成",
    storyText: chapterFinaleResult
      ? `${story.storyText}\n\n【章节大结局】\n${chapterFinaleResult.chapterFinale}`
      : story.storyText,
    memorySummary: completionSummary ? `${story.memorySummary} 用户总结：${completionSummary}` : story.memorySummary,
    completionSummary,
    rewardSummary,
    chapterFinale: chapterFinaleResult,
    triggeredSkills: skillResolution.publicTriggeredSkills,
    rewardDelta: {
      growth: totalGrowth,
      resources: totalResource,
    },
    characterArc,
    storyAsset,
    worldEntities: touchedWorldEntities,
  };
}

async function createTask(payload) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);

  const title = typeof payload === "string" ? payload : payload && payload.title;
  const trimmed = String(title || "").trim();
  if (!trimmed) {
    throw new Error("支线任务内容不能为空");
  }
  const activeOptional = (state.tasks || []).filter((task) => task && !task.done && task.priorityTier === "OPTIONAL");
  const slotsUsed = Math.max(0, Math.min(PORTFOLIO_SIDE_TASKS_PER_DAY, Number(state.dailyPlan && state.dailyPlan.optionalSlotsUsed) || activeOptional.length));
  let replacingSlot = false;
  if (slotsUsed >= PORTFOLIO_SIDE_TASKS_PER_DAY) {
    const automatic = activeOptional.find((task) => task.source !== "CUSTOM");
    if (!automatic) {
      throw new AppError("DAILY_OPTIONAL_LIMIT_REACHED", "今天的支线任务名额已用完，请明天再添加", 409);
    }
    replacingSlot = true;
    archiveUnscheduledTask(state, automatic, "OPTIONAL_REPLACED_BY_CUSTOM");
    state.tasks = (state.tasks || []).filter((task) => task.id !== automatic.id);
    if (state.dailyPlan) {
      state.dailyPlan.taskIds = (state.dailyPlan.taskIds || []).filter((id) => id !== automatic.id);
      state.dailyPlan.optionalTaskIds = (state.dailyPlan.optionalTaskIds || []).filter((id) => id !== automatic.id);
    }
  }
  const planDate = state.dailyPlan && state.dailyPlan.planDate
    ? state.dailyPlan.planDate
    : getPlanDate(new Date(), state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE);

  state.tasks.unshift(
    ...mapTasks(
      state,
      [
        {
          title: trimmed,
          detail: "支线任务，可按自己的节奏补充执行细节。",
          estimate: "15 分钟",
          deadlineAt: payload && payload.deadlineAt,
          rewardGrowth: 10,
          rewardResource: 12,
          stageGoalId: null,
          stageTaskId: null,
          dailyPlanId: state.dailyPlan && state.dailyPlan.id,
          scheduledDate: planDate,
          source: "CUSTOM",
          priorityTier: "OPTIONAL",
          difficulty: 1,
          narrativeHook: "一条新的支线补给路标出现在目标地图上。",
        },
      ],
      "side",
      {
        dailyPlanId: state.dailyPlan && state.dailyPlan.id,
        scheduledDate: planDate,
        source: "CUSTOM",
      }
    )
  );
  if (state.dailyPlan) {
    state.dailyPlan.taskIds = state.tasks
      .filter((task) => task.dailyPlanId === state.dailyPlan.id)
      .map((task) => task.id);
    if (!replacingSlot) state.dailyPlan.optionalSlotsUsed = Math.min(PORTFOLIO_SIDE_TASKS_PER_DAY, slotsUsed + 1);
    updateDailyPlanMetrics(state);
  }
  refreshGoalPlanProgress(state);

  const role = getRole(state.selectedRoleId);
  const narrativeContext = buildNarrativeContext(state);
  const storyAsset = selectEventStoryAsset(state, {
    eventTag: "task.created",
    taskType: "side",
    phase: "side",
    taskTitle: trimmed,
    text: trimmed,
  });
  const story = await generateSideQuestNarrative({
    role,
    profile: state.profile,
    title: trimmed,
    apiKey: getDeepseekApiKey(),
    characterArc: narrativeContext.characterArc,
    permanentTitles: narrativeContext.permanentTitles,
    worldEntities: narrativeContext.worldEntities,
    seasonDigests: narrativeContext.seasonDigests,
    storyAsset,
  });

  createDiaryEntry(state, {
    title: "新增支线任务",
    body: story,
    reward: "等待完成后结算",
  });

  createMemoryEntry(state, {
    type: "side_quest_created",
    title: `新增支线：${trimmed}`,
    memorySummary: `新增支线“${trimmed}”待完成`,
    storyText: story,
    reward: "等待完成",
    storyAsset,
  });

  syncAgentArtifacts(state);
  state.lastStory = story;
  state.lastRewardSummary = "等待完成后结算";
  saveStore();

  return {
    tag: "task.created",
    title: "支线已创建",
    storyText: story,
    rewardSummary: "等待完成后结算",
    storyAsset,
  };
}

async function createParallelGoal(payload) {
  if (payload && payload.confirmedDraft) {
    return createParallelGoalFromConfirmedDraft(payload.confirmedDraft);
  }
  if (env.nodeEnv !== "test") {
    throw new AppError("GOAL_DRAFT_REQUIRED", "新增长期目标必须先确认学习来源和计划", 410);
  }
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);
  ensureGoalPortfolioState(state);
  const title = String(payload && (payload.title || payload.goal) || "").trim();
  const durationDays = parseGoalDurationDays(payload && (payload.durationDays || payload.deadline), 30);
  if (!title) throw new Error("长期目标不能为空");
  if ((state.goalPortfolio.goals || []).some((goal) => goal && goal.status === "ACTIVE" && goal.title === title)) {
    throw new Error("该长期目标已经在进行中");
  }
  const activeGoals = (state.goalPortfolio.goals || []).filter((goal) => goal && goal.status === "ACTIVE");
  const priority = activeGoals.some((goal) => goal.priority === "PRIMARY")
    ? activeGoals.some((goal) => goal.priority === "SECONDARY") ? "INACTIVE" : "SECONDARY"
    : "PRIMARY";

  const rawPlan = await generateGoalPlan(title, [
    { id: "deadline", question: "计划持续多久？", answer: `${durationDays} 天` },
    { id: "dailyTime", question: "每天投入多久？", answer: state.profile.dailyTime || "25 分钟" },
  ], { apiKey: getDeepseekApiKey() });
  rawPlan.rollingTaskPlan = await generateRollingTaskPlan({
    goalText: title,
    durationDays,
    startDay: 1,
    dayCount: Math.min(7, durationDays),
    dailyMinutes: parseDailyMinutes(state.profile && state.profile.dailyTime, 120),
    phases: (rawPlan.stageGoals || []).map((stage) => ({
      title: stage.title,
      description: stage.description,
      tasks: (stage.tasks || []).map((task) => ({ title: task.title, description: task.description })),
    })),
  }, { apiKey: getDeepseekApiKey() });
  const goal = buildPortfolioGoal(state, {
    title,
    durationDays,
    plan: rawPlan,
    constellationIndex: state.goalPortfolio.goals.length,
    priority,
  });
  state.goalPortfolio.goals.push(goal);
  await ensurePortfolioDailyPlan(state, { source: "GOAL_ADDED" });
  state.transition.needsNewGoalPrompt = false;
  state.agent.emotion = "期待";
  state.lastStory = `长期目标「${title}」已加入并行星图。`;
  state.lastRewardSummary = `${durationDays} 个日节点 · ${goal.constellationName}`;
  saveStore();
  return {
    tag: "goal.created.parallel",
    title: "长期目标已加入",
    storyText: state.lastStory,
    rewardSummary: state.lastRewardSummary,
  };
}

function updateTask(taskId, payload) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);

  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error("任务不存在");
  }

  const title = String(payload.title || "").trim();
  const detail = String(payload.detail || "").trim();
  const estimatedMinutes = normalizeEstimatedMinutes(payload.estimatedMinutes, task.estimatedMinutes || 25);

  if (!title) {
    throw new Error("任务标题不能为空");
  }
  if (estimatedMinutes <= 0) {
    throw new Error("投入时长必须大于 0 分钟");
  }

  task.title = title;
  task.detail = detail;
  task.estimatedMinutes = estimatedMinutes;
  task.estimate = buildEstimateText(estimatedMinutes);
  task.deadlineAt = normalizeDeadlineAt(payload.deadlineAt, addDays(new Date(), 1));
  task.deadlineLabel = formatDeadlineLabel(task.deadlineAt);
  task.overdueDays = getOverdueDays(task);
  task.debuffActive = task.overdueDays > 0;
  const linkedStageTask = findStageTask(state, task.stageTaskId);
  if (linkedStageTask) {
    linkedStageTask.task.title = task.title;
    linkedStageTask.task.description = task.detail;
    linkedStageTask.task.estimatedMinutes = task.estimatedMinutes;
  }
  updateDailyPlanMetrics(state);
  const storyAsset = selectEventStoryAsset(state, {
    eventTag: "task.updated",
    phase: "focus",
    taskTitle: task.title,
    text: `${task.title} ${detail} ${estimatedMinutes} 分钟`,
  });

  syncAgentArtifacts(state);
  state.lastStory = `任务“${task.title}”的执行细节、投入时长与截止时间已更新。`;
  state.lastRewardSummary = `投入时长：${estimatedMinutes} 分钟 / 截止时间：${formatDeadlineLabel(task.deadlineAt)}`;
  saveStore();

  return {
    tag: "task.updated",
    title: "任务已更新",
    storyText: state.lastStory,
    rewardSummary: state.lastRewardSummary,
    storyAsset,
  };
}

function addPlannedTasksToState(state, rawTasks, stageId, type = "main") {
  const stage = state.goalPlan && Array.isArray(state.goalPlan.stageGoals)
    ? state.goalPlan.stageGoals.find((entry) => entry && entry.id === stageId)
    : null;
  if (!stage) {
    return [];
  }
  const startOrder = Array.isArray(stage.tasks) ? stage.tasks.length : 0;
  const canonicalTasks = (rawTasks || []).map((task, index) => ({
    id: allocateId(state, "stage-task"),
    title: String(task.title || `任务 ${startOrder + index + 1}`).trim(),
    description: String(task.description || task.detail || "").trim(),
    stageGoalId: stageId,
    difficulty: Number(task.difficulty || 2),
    estimatedMinutes: normalizeEstimatedMinutes(task.estimatedMinutes || task.estimate, 25),
    status: "TODO",
    rewardGrowth: Number(task.rewardGrowth || 12),
    rewardResource: Number(task.rewardResource || 14),
    narrativeHook: String(task.narrativeHook || "").trim(),
    order: startOrder + index,
    completedAt: null,
  }));
  stage.tasks.push(...canonicalTasks);
  const planDate = state.dailyPlan && state.dailyPlan.planDate
    ? state.dailyPlan.planDate
    : getPlanDate(new Date(), state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE);
  const mapped = mapTasks(
    state,
    canonicalTasks.map((task) => ({
      ...task,
      detail: task.description,
      stageGoalId: stageId,
      stageTaskId: task.id,
      dailyPlanId: state.dailyPlan && state.dailyPlan.id,
      scheduledDate: planDate,
      source: "STAGE",
    })),
    type,
    {
      dailyPlanId: state.dailyPlan && state.dailyPlan.id,
      scheduledDate: planDate,
      source: "STAGE",
    }
  );
  state.tasks.unshift(...mapped);
  if (state.dailyPlan) {
    state.dailyPlan.taskIds = state.tasks
      .filter((task) => task.dailyPlanId === state.dailyPlan.id)
      .map((task) => task.id);
    state.dailyPlan.version = Number(state.dailyPlan.version || 1) + 1;
    updateDailyPlanMetrics(state);
  }
  refreshGoalPlanProgress(state);
  return mapped;
}

async function replanGoalTasks(payload) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);
  await ensureGoalPlan(state);

  const reason = String(payload && payload.reason ? payload.reason : REPLAN_REASONS.NO_TIME).trim();
  const taskId = String(payload && payload.taskId ? payload.taskId : "").trim();
  const newGoal = String(payload && payload.newGoal ? payload.newGoal : "").trim();
  const currentStage = getCurrentStage(state);
  const targetTask = taskId ? state.tasks.find((task) => task && task.id === taskId) : null;

  if (state.goalPortfolio && Array.isArray(state.goalPortfolio.goals) && state.goalPortfolio.goals.length > 0) {
    if (reason === REPLAN_REASONS.CHANGE_DIRECTION) {
      throw new AppError("GOAL_DRAFT_REQUIRED", "更换长期目标需要重新搜索来源并确认计划", 409);
    }
    const linkedGoal = targetTask && targetTask.portfolioGoalId
      ? state.goalPortfolio.goals.find((goal) => goal.goalId === targetTask.portfolioGoalId)
      : null;
    if (linkedGoal) {
      linkedGoal.aiRollingUpgradePending = true;
      linkedGoal.planStatus = "CONFIRMED";
    }
    state.agent.emotion = "调整";
    state.lastStory = linkedGoal
      ? "已记录「" + linkedGoal.title + "」需要调整，今日核心任务保持不变。"
      : "已记录今日节奏调整，避免重新生成未经确认的长期路线。";
    state.lastRewardSummary = "执行计划已保留";
    await ensurePortfolioDailyPlan(state, { source: "PORTFOLIO_REPLAN", force: true });
    saveStore();
    return {
      tag: "goal.replanned",
      title: "调整请求已记录",
      storyText: state.lastStory,
      rewardSummary: state.lastRewardSummary,
    };
  }

  if (reason === REPLAN_REASONS.CHANGE_DIRECTION) {
    await buildGoalPlanForState(state, newGoal || state.profile.goal, []);
    state.agent.emotion = "焕新";
    state.lastStory = "目标地图已经按新方向重新编排，原有完成记录和日志已保留。";
    state.lastRewardSummary = "阶段目标已重规划";
    saveStore();
    return {
      tag: "goal.replanned",
      title: "目标地图已重规划",
      storyText: state.lastStory,
      rewardSummary: state.lastRewardSummary,
    };
  }

  const result = await planReplacementTasks(
    state.goalPlan,
    reason,
    {
      task: targetTask,
      currentStageTitle: currentStage && currentStage.title,
      newGoal,
      stats: state.stats,
    },
    { apiKey: getDeepseekApiKey() }
  );
  const stageId = (targetTask && targetTask.stageGoalId) || (currentStage && currentStage.id);
  const stage = state.goalPlan.stageGoals.find((entry) => entry && entry.id === stageId);
  const targetIsCustom = Boolean(targetTask && (targetTask.source === "CUSTOM" || !targetTask.stageTaskId));

  if (targetIsCustom && targetTask && !targetTask.done) {
    state.tasks = state.tasks.filter((task) => task && task.id !== targetTask.id);
    const planDate = state.dailyPlan && state.dailyPlan.planDate
      ? state.dailyPlan.planDate
      : getPlanDate(new Date(), state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE);
    const replacements = mapTasks(
      state,
      result.tasks.map((task) => ({
        ...task,
        detail: task.description || task.detail,
        stageGoalId: null,
        stageTaskId: null,
        dailyPlanId: state.dailyPlan && state.dailyPlan.id,
        scheduledDate: planDate,
        source: "CUSTOM",
      })),
      "side",
      {
        dailyPlanId: state.dailyPlan && state.dailyPlan.id,
        scheduledDate: planDate,
        source: "CUSTOM",
      }
    );
    state.tasks.unshift(...replacements);
    if (state.dailyPlan) {
      state.dailyPlan.taskIds = state.tasks.map((task) => task.id);
      state.dailyPlan.version = Number(state.dailyPlan.version || 1) + 1;
      updateDailyPlanMetrics(state);
    }
  } else {
    if (result.mode === "replace_task" && targetTask && !targetTask.done) {
      state.tasks = state.tasks.filter((task) => task && task.id !== targetTask.id);
      if (stage && targetTask.stageTaskId) {
        stage.tasks = stage.tasks.filter((task) => task && task.id !== targetTask.stageTaskId);
      }
    }

    if (result.mode === "replace_today") {
      const removedStageTaskIds = new Set(
        state.tasks
          .filter((task) => task && !task.done && task.source === "STAGE" && task.stageGoalId === stageId)
          .map((task) => task.stageTaskId)
          .filter(Boolean)
      );
      state.tasks = state.tasks.filter(
        (task) => task && (task.done || task.source === "CUSTOM" || (stageId && task.stageGoalId !== stageId))
      );
      if (stage) {
        stage.tasks = stage.tasks.filter((task) => !removedStageTaskIds.has(task.id));
      }
    }

    addPlannedTasksToState(state, result.tasks, stageId, "main");
  }
  state.agent.emotion = "调整";
  state.lastStory = result.message || "今日任务已根据目标地图重新规划。";
  state.lastRewardSummary = "目标编排已更新";

  createDiaryEntry(state, {
    title: "目标重新规划",
    body: state.lastStory,
    reward: state.lastRewardSummary,
  });

  syncAgentArtifacts(state);
  saveStore();

  return {
    tag: "goal.replanned",
    title: "重新规划完成",
    storyText: state.lastStory,
    rewardSummary: state.lastRewardSummary,
  };
}

async function refreshNextSuggestion(payload = {}) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);
  await ensureGoalPlan(state);

  const completedTaskId = String(payload.completedTaskId || "").trim();
  const completedTask = completedTaskId
    ? state.tasks.find((task) => task && task.id === completedTaskId)
    : state.tasks.find((task) => task && task.done);

  state.nextSuggestion = await planNextSuggestion(state.goalPlan, completedTask, state.stats, {
    apiKey: getDeepseekApiKey(),
  });
  state.lastStory = "下一步建议已根据当前目标地图、完成记录和成长值刷新。";
  state.lastRewardSummary = state.nextSuggestion;
  saveStore();

  return {
    tag: "goal.next_suggestion",
    title: "下一步建议已更新",
    storyText: state.lastStory,
    rewardSummary: state.nextSuggestion,
  };
}

async function adoptNextSuggestion(payload = {}) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);
  await ensureGoalPlan(state);

  const suggestion = String(payload.suggestion || state.nextSuggestion || "").trim();
  if (!suggestion) {
    throw new Error("暂无可采纳的下一步建议");
  }
  return createTask({
    title: suggestion,
    stageGoalId: getCurrentStage(state) && getCurrentStage(state).id,
  });
}

function getCurrentDungeonStatus(demoMode) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);

  const timeState = getDungeonState(Boolean(demoMode));
  return {
    ...timeState,
    demoMode: Boolean(demoMode),
    run: buildDungeonRunSnapshot(state),
  };
}

function hasDungeonRewardForPlan(state, context) {
  const history = Array.isArray(state.dungeonSettlementHistory) ? state.dungeonSettlementHistory : [];
  return history.some((entry) => {
    if (!entry || !entry.rewardGranted) {
      return false;
    }
    if (context.dailyPlanId && entry.dailyPlanId) {
      return entry.dailyPlanId === context.dailyPlanId;
    }
    return Boolean(context.planDate && entry.planDate === context.planDate);
  });
}

function startDungeonRun(demoMode, options = {}) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);
  const storyline = getDungeonStoryline(state.selectedRoleId);
  const learningContext = buildDungeonLearningContext(state);
  const rewardPreview = calculateDungeonReward(learningContext);

  const timeState = getDungeonState(Boolean(demoMode));
  if (!timeState.unlocked && !options.ignoreTime) {
    throw new Error("副本尚未开放，默认每天 22:00 开启");
  }
  if (state.dungeonRun && state.dungeonRun.active) {
    throw new Error("当前已有进行中的副本，请先完成本轮");
  }

  state.dungeonRun = createEmptyDungeonRun();
  state.dungeonRun.active = true;
  state.dungeonRun.runId = allocateId(state, "dungeon");
  state.dungeonRun.startedAt = new Date().toISOString();
  state.dungeonRun.totalNodes = Number(storyline.maxScenes || 4);
  state.dungeonRun.storylineId = storyline.roleId;
  state.dungeonRun.lineName = learningContext.stageTheme.name;
  state.dungeonRun.chapterTitle = `${learningContext.stageTitle} · ${learningContext.routeLabel}`;
  state.dungeonRun.stateLabels = clone(storyline.stateLabels || {});
  state.dungeonRun.currentEventId = storyline.startEventId;
  state.dungeonRun.visitedEventIds = [storyline.startEventId];
  state.dungeonRun.routeState = createInitialDungeonRouteState(state);
  state.dungeonRun.flags = buildInitialDungeonFlags(state);
  state.dungeonRun.planDate = learningContext.planDate;
  state.dungeonRun.dailyPlanId = learningContext.dailyPlanId;
  state.dungeonRun.stageGoalId = learningContext.stageGoalId;
  state.dungeonRun.stageTitle = learningContext.stageTitle;
  state.dungeonRun.nextStageTitle = learningContext.nextStageTitle;
  state.dungeonRun.stageTheme = clone(learningContext.stageTheme);
  state.dungeonRun.completionRoute = learningContext.route;
  state.dungeonRun.routeLabel = learningContext.routeLabel;
  state.dungeonRun.plannedTaskCount = learningContext.plannedTaskCount;
  state.dungeonRun.completedTaskCount = learningContext.completedTaskCount;
  state.dungeonRun.completedTaskIds = [...learningContext.completedTaskIds];
  state.dungeonRun.completedTaskTitles = [...learningContext.completedTaskTitles];
  state.dungeonRun.demoMode = Boolean(demoMode);
  state.dungeonRun.rewardEligible = !demoMode && !hasDungeonRewardForPlan(state, learningContext);
  state.dungeonRun.rewardPreview = state.dungeonRun.rewardEligible
    ? clone(rewardPreview)
    : { growth: 0, resources: 0 };
  const openingStory = `${learningContext.stageTheme.eventLead} 今夜将以「${learningContext.routeLabel}」映照你当天的真实推进。`;
  state.dungeonRun.recentOutcome = openingStory;

  state.agent.stage = "dungeon-running";
  state.agent.emotion = "出征";
  state.lastStory = openingStory;
  state.lastRewardSummary = state.dungeonRun.rewardEligible
    ? `正式副本已开启：${state.dungeonRun.chapterTitle}`
    : `${demoMode ? "演示" : "重玩"}副本已开启，本轮不重复发放正式奖励`;
  const storyAsset = selectEventStoryAsset(state, {
    eventTag: "dungeon.entered",
    phase: "opening",
    text: `${state.dungeonRun.lineName} ${state.dungeonRun.chapterTitle} ${openingStory}`,
  });

  saveStore();

  return {
    tag: "dungeon.entered",
    title: `进入${state.dungeonRun.lineName}`,
    storyText: openingStory,
    rewardSummary: `本轮共有 ${state.dungeonRun.totalNodes} 幕关键抉择`,
    storyAsset,
  };
}

function resolveDungeonEvent(choiceId) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);

  if (!state.dungeonRun || !state.dungeonRun.active) {
    throw new Error("当前没有进行中的副本");
  }

  const storyline = getDungeonStoryline(state.dungeonRun.storylineId || state.selectedRoleId);

  const activeEvent = getStorylineEvent(storyline, state.dungeonRun.currentEventId);
  if (!activeEvent) {
    throw new Error("当前节点不存在，请重新进入副本");
  }

  const selectedChoice = buildAvailableStoryChoices(activeEvent, state, state.dungeonRun).find(
    (entry) => entry.choiceId === choiceId
  );
  if (!selectedChoice) {
    throw new Error("无效的事件选项");
  }

  const effects = selectedChoice.effects || {};
  const insightDelta = Number(effects.insight || 0);
  const bondDelta = Number(effects.bond || 0);
  const resolveDelta = Number(effects.resolve || 0);
  const labels = buildDungeonStateLabels(storyline, state.dungeonRun);

  state.dungeonRun.routeState.insight += insightDelta;
  state.dungeonRun.routeState.bond += bondDelta;
  state.dungeonRun.routeState.resolve += resolveDelta;
  if (Array.isArray(selectedChoice.flags)) {
    for (const flag of selectedChoice.flags) {
      if (!state.dungeonRun.flags.includes(flag)) {
        state.dungeonRun.flags.push(flag);
      }
    }
  }

  state.dungeonRun.history.push({
    nodeId: activeEvent.eventId,
    nodeTitle: activeEvent.title,
    choiceId: selectedChoice.choiceId,
    choiceLabel: selectedChoice.label,
    outcome: selectedChoice.outcome,
    growth: 0,
    resources: 0,
    routeSummary: buildDungeonRewardSummary({ insight: insightDelta, bond: bondDelta, resolve: resolveDelta }, labels),
  });

  const nextIndex = state.dungeonRun.currentIndex + 1;
  state.dungeonRun.currentIndex = nextIndex;
  state.dungeonRun.recentOutcome = selectedChoice.outcome || activeEvent.description;

  if (storyline.endings && storyline.endings[selectedChoice.nextEventId]) {
    state.dungeonRun.active = false;
    state.dungeonRun.readyToSettle = true;
    state.dungeonRun.currentEventId = null;
    state.dungeonRun.preparedEnding = buildPreparedEnding(storyline, selectedChoice.nextEventId);
    state.agent.stage = "dungeon-awaiting-settlement";
    state.agent.emotion = "凯旋";
    state.dungeonRun.endingSummary = `结局方向已显现：${
      state.dungeonRun.preparedEnding ? state.dungeonRun.preparedEnding.direction : "夜幕已闭合"
    }`;
    state.lastStory = selectedChoice.outcome;
    state.lastRewardSummary = `${buildDungeonRewardSummary({ insight: insightDelta, bond: bondDelta, resolve: resolveDelta }, labels)}；${state.dungeonRun.endingSummary}`;
  } else {
    state.dungeonRun.currentEventId = selectedChoice.nextEventId;
    if (selectedChoice.nextEventId && !state.dungeonRun.visitedEventIds.includes(selectedChoice.nextEventId)) {
      state.dungeonRun.visitedEventIds.push(selectedChoice.nextEventId);
    }
    state.lastStory = selectedChoice.outcome;
    state.lastRewardSummary = buildDungeonRewardSummary({ insight: insightDelta, bond: bondDelta, resolve: resolveDelta }, labels);
  }

  const storyAsset = selectEventStoryAsset(state, {
    eventTag: "dungeon.event.resolved",
    phase: "dungeon",
    taskTitle: activeEvent.title,
    text: `${activeEvent.title} ${selectedChoice.label} ${selectedChoice.outcome}`,
  });

  saveStore();

  return {
    tag: "dungeon.event.resolved",
    title: `事件完成：${activeEvent.title}`,
    storyText: selectedChoice.outcome,
    rewardSummary: buildDungeonRewardSummary({ insight: insightDelta, bond: bondDelta, resolve: resolveDelta }, labels),
    rewardDelta: {
      growth: 0,
      resources: 0,
    },
    characterArc: getCurrentCharacterArc(state),
    storyAsset,
  };
}

async function settleDungeonRun() {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);

  if (!state.dungeonRun || !state.dungeonRun.readyToSettle) {
    throw new Error("副本尚未完成全部事件节点，无法结算");
  }

  const ending = state.dungeonRun.preparedEnding;
  if (!ending) {
    throw new Error("当前结局信息缺失，请重新开始本轮副本");
  }

  const settlingRunId = state.dungeonRun.runId;
  const routeRecap = state.dungeonRun.history
    .map((entry, index) => `${index + 1}. ${entry.nodeTitle}：${entry.choiceLabel}`)
    .join("\n");
  const narrative = await generateDungeonSettlementNarrative(
    {
      goalTitle: state.goalPlan && (state.goalPlan.longTermGoal || state.goalPlan.title),
      stageTitle: state.dungeonRun.stageTitle,
      nextStageTitle: state.dungeonRun.nextStageTitle,
      stageThemeName: state.dungeonRun.stageTheme && state.dungeonRun.stageTheme.name,
      routeLabel: state.dungeonRun.routeLabel,
      completedTaskCount: state.dungeonRun.completedTaskCount,
      completedTaskTitles: state.dungeonRun.completedTaskTitles,
      endingTitle: ending.title,
      endingStory: ending.storyText,
      routeRecap,
    },
    { apiKey: getDeepseekApiKey() }
  );

  if (!state.dungeonRun || state.dungeonRun.runId !== settlingRunId || !state.dungeonRun.readyToSettle) {
    throw new Error("本轮副本已经结算，请勿重复提交");
  }

  const settlementKey = {
    dailyPlanId: state.dungeonRun.dailyPlanId,
    planDate: state.dungeonRun.planDate,
  };
  const rewardEligible = Boolean(
    state.dungeonRun.rewardEligible &&
      !state.dungeonRun.demoMode &&
      !hasDungeonRewardForPlan(state, settlementKey)
  );
  const fixedReward = rewardEligible
    ? calculateDungeonReward({
        route: state.dungeonRun.completionRoute,
        completedTaskCount: state.dungeonRun.completedTaskCount,
      })
    : { growth: 0, resources: 0 };
  state.stats.growth += fixedReward.growth;
  state.stats.resources += fixedReward.resources;
  state.dungeonRun.totals = clone(fixedReward);
  state.dungeonRun.rewardGranted = rewardEligible;
  const levelUps = calculateLevelUps(state);
  applyAgentArcState(state);

  const rewardText = rewardEligible
    ? `成长值 +${fixedReward.growth} / 资源点 +${fixedReward.resources}`
    : "本轮为演示或重玩，不发放正式奖励";
  const settleStory = `${narrative.storyText}\n\n【本轮抉择】\n${routeRecap}\n\n【章节归档】\n${rewardText}`;

  createDiaryEntry(state, {
    title: `夜间副本结局：${ending.direction}`,
    body: settleStory,
    reward: rewardText,
  });

  createMemoryEntry(state, {
    type: "dungeon_settlement",
    title: `夜间副本完成：${ending.direction}`,
    memorySummary: narrative.memorySummary,
    storyText: settleStory,
    reward: rewardText,
  });

  state.agent.stage = "chapter-continue";
  state.agent.emotion = "稳态前进";
  state.lastStory = settleStory;
  state.lastRewardSummary = `副本结算：${rewardText}`;
  if (levelUps > 0) {
    state.lastRewardSummary += `；角色升至 Lv.${state.stats.level}`;
  }
  state.dungeonRun.readyToSettle = false;
  state.dungeonRun.settled = true;
  state.dungeonRun.endingSummary = `${ending.title} · ${ending.direction}`;
  if (!Array.isArray(state.dungeonSettlementHistory)) {
    state.dungeonSettlementHistory = [];
  }
  if (rewardEligible) {
    state.dungeonSettlementHistory.unshift({
      runId: state.dungeonRun.runId,
      dailyPlanId: state.dungeonRun.dailyPlanId,
      planDate: state.dungeonRun.planDate,
      stageGoalId: state.dungeonRun.stageGoalId,
      completionRoute: state.dungeonRun.completionRoute,
      demoMode: false,
      rewardGranted: true,
      reward: clone(fixedReward),
      settledAt: new Date().toISOString(),
    });
    state.dungeonSettlementHistory = state.dungeonSettlementHistory.slice(0, 60);
  }

  syncAgentArtifacts(state);
  const storyAsset = selectEventStoryAsset(state, {
    eventTag: "dungeon.settled",
    phase: "finale",
    text: `${ending.title} ${ending.direction} ${settleStory}`,
    allMainDone: true,
  });
  saveStore();

  return {
    tag: "dungeon.settled",
    title: narrative.title || ending.title,
    storyText: settleStory,
    rewardSummary: state.lastRewardSummary,
    rewardDelta: {
      growth: fixedReward.growth,
      resources: fixedReward.resources,
    },
    characterArc: getCurrentCharacterArc(state),
    storyAsset,
  };
}

function createPurchase(itemId) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);

  const item = state.shop.find((entry) => entry.id === itemId);
  if (!item) {
    throw new Error("商品不存在");
  }
  if (item.purchased) {
    throw new Error("该商品已经购买过了");
  }
  if (state.stats.resources < item.price) {
    throw new Error("当前资源点不足");
  }

  state.stats.resources -= item.price;
  item.purchased = true;
  state.inventory.unshift({
    id: item.id,
    name: item.name,
    detail: item.effect,
    equipped: true,
  });
  state.agent.emotion = "振奋";
  const storyAsset = selectEventStoryAsset(state, {
    eventTag: "purchase.created",
    phase: "reward",
    text: `${item.name} ${item.effect || ""}`,
  });

  const worldEntities = upsertWorldEntities(
    state.worldState,
    [
      {
        type: "item",
        name: item.name,
        status: "equipped",
        summary: item.effect,
      },
    ],
    {
      sourceSeasonId: state.agent.currentSeasonId,
    }
  );

  createDiaryEntry(state, {
    title: "商店兑换完成",
    body: `${item.name} 已加入角色面板，并会在夜间副本入口中体现成长加成。`,
    reward: `消耗资源点 ${item.price}`,
  });

  createMemoryEntry(state, {
    type: "item_purchased",
    title: `获得物品：${item.name}`,
    memorySummary: `${item.name} 入库并加入世界线实体`,
    storyText: `${item.name} 已加入角色背包，后续会影响副本入口与叙事反馈。`,
    reward: `资源点 -${item.price}`,
    storyAsset,
    worldEntities,
  });

  syncAgentArtifacts(state);
  state.lastStory = `${item.name} 已加入角色背包，并将在后续副本事件中提供额外反馈。`;
  state.lastRewardSummary = `资源点 -${item.price}`;
  saveStore();

  return {
    tag: "purchase.created",
    title: "购买成功",
    storyText: `${item.name} 已加入角色面板，并会在副本入口中体现成长加成。`,
    rewardSummary: `资源点 -${item.price}`,
    storyAsset,
  };
}

function consumeStarToolCharge(state, toolId) {
  const toolState = state.starMap.tools[toolId];
  toolState.charges = Math.max(0, Number(toolState.charges || 0) - 1);
  toolState.timesUsed = Number(toolState.timesUsed || 0) + 1;
  toolState.lastUsedAt = new Date().toISOString();
  const inventoryItem = (state.inventory || []).find((item) => item && item.id === toolId);
  if (inventoryItem) {
    inventoryItem.charges = toolState.charges;
  }
}

async function useStarMapTool(payload) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);
  ensureStarMapState(state);

  const toolId = String(payload && payload.toolId || "").trim();
  const taskId = String(payload && payload.taskId || "").trim();
  const tool = getStarTool(toolId);
  const toolState = state.starMap.tools[toolId];
  if (!tool || !toolState) {
    throw new Error("该星宿道具尚未获得");
  }
  if (Number(toolState.charges || 0) <= 0) {
    throw new Error("该道具当前没有可用次数");
  }

  const target = findStarToolTarget(state, taskId);
  if (!target) {
    throw new Error("请选择一个可用任务");
  }

  let title = `${tool.name}已生效`;
  let storyText = "星宿道具已经作用到任务计划。";
  let action = "REFRESH";
  let actionPayload = { taskId };

  if (tool.action === "FOCUS") {
    if (target.done || String(target.status || "").toUpperCase() === "DONE") {
      throw new Error("专注披风只能用于未完成任务");
    }
    action = "FOCUS";
    actionPayload = { taskId, focusMinutes: 25 };
    storyText = `已为「${target.title}」准备 25 分钟专注空间。`;
  } else if (tool.action === "SPLIT") {
    if (target.done || String(target.status || "").toUpperCase() === "DONE") {
      throw new Error("洞察卷轴只能拆解未完成任务");
    }
    await replanGoalTasks({ reason: REPLAN_REASONS.TOO_HARD, taskId });
    storyText = `「${target.title}」已拆成三个更容易开始的步骤。`;
  } else if (tool.action === "REVIEW") {
    if (!target.done && String(target.status || "").toUpperCase() !== "DONE") {
      throw new Error("记忆符印只能用于已完成任务");
    }
    const today = new Date();
    const timeZone = state.profile && state.profile.timeZone || DEFAULT_TIME_ZONE;
    const existing = state.starMap.scheduledReviews.some(
      (review) => review && review.sourceTaskId === taskId && !review.cancelledAt
    );
    if (existing) {
      throw new Error("该任务已经安排过间隔复习");
    }
    [1, 3, 7].forEach((offsetDays) => {
      state.starMap.scheduledReviews.push({
        reviewId: allocateId(state, "star-review"),
        sourceTaskId: taskId,
        sourceTitle: target.title,
        offsetDays,
        dueDate: getPlanDate(addDays(today, offsetDays), timeZone),
        materializedTaskId: null,
        createdAt: new Date().toISOString(),
      });
    });
    storyText = `已为「${target.title}」安排第 1、3、7 天复习。`;
  } else if (tool.action === "REFLECT") {
    if (!target.done && String(target.status || "").toUpperCase() !== "DONE") {
      throw new Error("回溯之镜只能用于已完成任务");
    }
    const created = createStarToolTask(state, {
      title: `回溯复盘：${target.title}`,
      detail: `回顾「${target.title}」，整理一个错误、疑点或最值得保留的方法。`,
      estimatedMinutes: 15,
      toolId,
      sourceTaskId: taskId,
    });
    actionPayload = { taskId: created.id };
    storyText = `已从「${target.title}」生成一项 15 分钟复盘任务。`;
  } else if (tool.action === "FALLBACK") {
    if (target.done || String(target.status || "").toUpperCase() === "DONE") {
      throw new Error("守护契约只能用于未完成任务");
    }
    const duplicate = (state.tasks || []).find(
      (task) => task && !task.done && task.starToolId === toolId && task.starSourceTaskId === taskId
    );
    if (duplicate) {
      throw new Error("该任务已有保底版本");
    }
    const created = createStarToolTask(state, {
      title: `保底行动：${target.title}`,
      detail: `只做 5 分钟：打开材料、完成第一步，并写下下一次从哪里继续。原任务不会因此被冒充完成。`,
      estimatedMinutes: 5,
      rewardGrowth: 3,
      rewardResource: 3,
      toolId,
      sourceTaskId: taskId,
    });
    actionPayload = { taskId: created.id };
    storyText = `已为「${target.title}」生成 5 分钟保底版本，原任务保持不变。`;
  }

  consumeStarToolCharge(state, toolId);
  state.lastStory = storyText;
  state.lastRewardSummary = `${tool.name}剩余 ${state.starMap.tools[toolId].charges} 次`;
  saveStore();
  return {
    tag: "star-map.tool.used",
    title,
    storyText,
    rewardSummary: state.lastRewardSummary,
    action,
    actionPayload,
  };
}

async function advanceGoal(payload) {
  if (env.nodeEnv !== "test") {
    throw new AppError("GOAL_DRAFT_REQUIRED", "开启新目标必须先确认学习来源和计划", 410);
  }
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);

  const goal = String(payload.goal || "").trim();
  if (!goal) {
    throw new Error("缺少新的阶段目标");
  }

  const role = getRole(state.selectedRoleId);
  const previousGoal = state.profile.goal;
  const currentSeason = state.memoryTree.activeSeason;
  const archiveContext = buildNarrativeContext(state);
  let seasonArchive = null;

  if (currentSeason) {
    const latestFinale = currentSeason.chapterFinales[currentSeason.chapterFinales.length - 1];
    seasonArchive = await generateSeasonArchive({
      role,
      profile: state.profile,
      seasonIndex: currentSeason.index,
      seasonGoal: currentSeason.goal || previousGoal,
      seasonTaskSummaries: currentSeason.taskMemories,
      chapterFinale: latestFinale ? latestFinale.finalText : "",
      apiKey: getDeepseekApiKey(),
      characterArc: archiveContext.characterArc,
      permanentTitles: archiveContext.permanentTitles,
      worldEntities: archiveContext.worldEntities,
      seasonDigests: archiveContext.seasonDigests,
    });

    const archivedSeason = archiveActiveSeason(state.memoryTree, {
      seasonEpic: seasonArchive.seasonEpic,
      seasonDigest: seasonArchive.seasonDigest,
      earnedTitles: seasonArchive.earnedTitles,
    });

    createMemoryEntry(state, {
      type: "season_archive",
      title: `赛季归档：${previousGoal}`,
      memorySummary: seasonArchive.seasonDigest,
      storyText: seasonArchive.seasonEpic,
      reward:
        archivedSeason && archivedSeason.earnedTitles.length > 0
          ? `获得称号：${archivedSeason.earnedTitles.map((title) => title.name).join("、")}`
          : "本季史诗已归档",
    });
  }

  const blueprintContext = buildNarrativeContext(state);
  const storyAsset = selectEventStoryAsset(state, {
    eventTag: "goal.advanced",
    phase: "opening",
    goal,
    text: `${goal} ${previousGoal || ""}`,
  });
  const blueprint = await generateGoalBlueprint({
    role,
    profile: {
      ...state.profile,
      goal,
      deadline: String(payload.deadline || "7 天后").trim(),
      dailyTime: String(payload.dailyTime || state.profile.dailyTime || "2 小时").trim(),
    },
    currentChapter: `${role.chapter} · 新篇章`,
    previousGoal,
    apiKey: getDeepseekApiKey(),
    characterArc: blueprintContext.characterArc,
    permanentTitles: blueprintContext.permanentTitles,
    worldEntities: blueprintContext.worldEntities,
    seasonDigests: blueprintContext.seasonDigests,
    storyAsset,
  });

  state.profile.goal = goal;
  state.profile.deadline = String(payload.deadline || "7 天后").trim();
  state.profile.dailyTime = String(payload.dailyTime || state.profile.dailyTime || "2 小时").trim();
  await buildGoalPlanForState(state, goal, [
    { id: "deadline", question: "距离关键节点或截止日期还有多久？", answer: state.profile.deadline },
    { id: "dailyTime", question: "每天大约能稳定投入几小时？", answer: state.profile.dailyTime },
  ]);
  state.transition.needsNewGoalPrompt = false;
  state.agent.chapter = blueprint.chapterTitle || `${role.chapter} · 新篇章`;
  state.agent.mainline = blueprint.mainlineSummary || buildMainline(goal, role);
  state.agent.stage = "chapter-next";
  state.agent.emotion = "焕新";
  state.agent.blueprintSource = blueprint.source;
  state.stats.streak += 1;
  applyAgentArcState(state);

  const nextSeason = startNewSeason(state.memoryTree, {
    seasonId: allocateId(state, "season"),
    index: (state.memoryTree.seasonArchives || []).length + 1,
    goal,
    roleId: role.id,
    roleName: role.name,
    chapterTitle: state.agent.chapter,
  });
  state.agent.currentSeasonId = nextSeason.seasonId;

  createDiaryEntry(state, {
    title: "新主线已生成",
    body: blueprint.openingStory,
    reward: `连击天数 +1，当前为 ${state.stats.streak}`,
  });

  createMemoryEntry(state, {
    type: "next_goal_created",
    title: `新主线：${goal}`,
    memorySummary: blueprint.mainlineSummary,
    storyText: blueprint.openingStory,
    reward: `连击天数 +1，当前为 ${state.stats.streak}`,
    storyAsset,
  });

  syncAgentArtifacts(state);
  saveStore();

  return {
    tag: "goal.advanced",
    title: "新的主线已生成",
    storyText: blueprint.openingStory,
    rewardSummary: `连击天数 +1，当前为 ${state.stats.streak}`,
    seasonArchive,
    characterArc: getCurrentCharacterArc(state),
    storyAsset,
  };
}

function getCurrentAgentProfile() {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);

  return clone({
    agent: state.agent,
    profile: state.profile,
    stats: state.stats,
    recentMemories: (state.memories || []).slice(0, 8),
    identityPath: state.agent.identityPath,
    memoryPath: state.agent.memoryPath,
    roleConfigPath: state.agent.roleConfigPath,
    skillConfigPaths: getSkillsByIds(state.skillState.unlockedSkillIds).map((skill) => skill.configPath),
    skillState: getSkillStateSnapshot(state.skillState),
    dungeonProfile: getDungeonProfileSnapshot(state.dungeon),
    characterArc: getCurrentCharacterArc(state),
    memoryTree: buildMemoryTreeSnapshot(state.memoryTree),
    worldState: getWorldStateSnapshot(state.worldState),
  });
}

function getCurrentAgentMemories() {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);

  return {
    memories: clone(state.memories || []),
    markdown: buildMemoryMarkdown({
      agent: state.agent,
      memories: state.memories || [],
      memoryTree: buildMemoryTreeSnapshot(state.memoryTree),
      worldState: getWorldStateSnapshot(state.worldState),
    }),
    memoryTree: buildMemoryTreeSnapshot(state.memoryTree),
    worldState: getWorldStateSnapshot(state.worldState),
  };
}

function listAvailableRoles() {
  return listRoles();
}

function getCurrentDungeonProfile() {
  const state = getState();
  if (!state.initialized) {
    return null;
  }

  migrateLegacyState(state);
  return clone(getDungeonProfileSnapshot(state.dungeon));
}

module.exports = {
  getCurrentSessionState,
  createSession,
  confirmGoalDraft,
  loginSession,
  completeTask,
  createTask,
  createParallelGoal,
  updateGoalPriority,
  updateTask,
  replanGoalTasks,
  refreshNextSuggestion,
  adoptNextSuggestion,
  createPurchase,
  useStarMapTool,
  advanceGoal,
  getCurrentDungeonStatus,
  startDungeonRun,
  resolveDungeonEvent,
  settleDungeonRun,
  getCurrentAgentProfile,
  getCurrentAgentMemories,
  listAvailableRoles,
  getCurrentDungeonProfile,
};
