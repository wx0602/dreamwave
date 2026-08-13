const { getRole, getRoleOrThrow, listRoles } = require("../constants/roles");
const { getDungeonStoryline } = require("../constants/dungeonStorylines");
const { defaultShop } = require("../constants/shop");
const { selectStoryAsset } = require("../constants/storyAssets");
const { formatDiaryTime, getDungeonState } = require("../utils/time");
const { clone } = require("../utils/clone");
const { getState, saveStore, replaceState } = require("../store/sessionStore");
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
} = require("../store/accountStore");
const { getResolvedApiKey } = require("./deepseekService");
const { generateGoalBlueprint } = require("./goalBlueprintService");
const {
  GOAL_LEVELS,
  REPLAN_REASONS,
  classifyGoal,
  generateClarifyingQuestions,
  generateGoalPlan,
  replanTasks: planReplacementTasks,
  generateNextSuggestion: planNextSuggestion,
} = require("./goalPlanningService");
const {
  generateTaskNarrative,
  generateSideQuestNarrative,
  generateChapterFinale,
  generateSeasonArchive,
} = require("./narrativeService");
const { getSkillsByIds } = require("./agentCatalogService");
const {
  syncIdentity,
  syncMemory,
  readMemoryMarkdown,
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

function mapTasks(state, tasks, type = "main") {
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
        type === "side" ? addDays(now, 1) : addDays(now, index + 1)
      ),
      deadlineLabel: "",
      overdueDays: 0,
      debuffActive: false,
      rewardGrowth: task.rewardGrowth,
      rewardResource: task.rewardResource,
      stageGoalId: task.stageGoalId || null,
      difficulty: Number(task.difficulty || (type === "side" ? 1 : 2)),
      narrativeHook: String(task.narrativeHook || "").trim(),
      type,
      done: false,
    };
  });
}

function getTaskStatus(task) {
  return task && task.done ? "DONE" : "TODO";
}

function refreshGoalPlanProgress(state) {
  if (!state.goalPlan || !Array.isArray(state.goalPlan.stageGoals)) {
    return;
  }

  state.goalPlan.stageGoals.forEach((stage) => {
    const tasks = Array.isArray(state.tasks)
      ? state.tasks.filter((task) => task && task.stageGoalId === stage.id)
      : [];
    const doneCount = tasks.filter((task) => task.done).length;
    const totalCount = tasks.length;
    stage.progress = totalCount > 0 ? Math.round((doneCount * 100) / totalCount) : Number(stage.progress || 0);
    if (totalCount > 0 && doneCount === totalCount) {
      stage.status = "DONE";
    } else if (totalCount > 0 && (doneCount > 0 || state.goalPlan.currentStageId === stage.id)) {
      stage.status = "IN_PROGRESS";
    } else {
      stage.status = stage.status === "DONE" ? "DONE" : "NOT_STARTED";
    }
    stage.tasks = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.detail,
      stageGoalId: task.stageGoalId,
      difficulty: Number(task.difficulty || 2),
      estimatedMinutes: Number(task.estimatedMinutes || 0),
      status: getTaskStatus(task),
      rewardGrowth: Number(task.rewardGrowth || 0),
      rewardResource: Number(task.rewardResource || 0),
      dueDate: task.deadlineAt,
      narrativeHook: task.narrativeHook || "",
    }));
  });
  state.goalPlan.updatedAt = new Date().toISOString();
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
    return {
      id: stageId,
      title: String(stage.title || `阶段 ${index + 1}`).trim(),
      description: String(stage.description || "").trim(),
      progress: Number(stage.progress || 0),
      status: index === 0 ? "IN_PROGRESS" : stage.status || "NOT_STARTED",
      tasks: Array.isArray(stage.tasks) ? stage.tasks : [],
    };
  });

  return plan;
}

function flattenGoalPlanTasks(state, plan) {
  const tasks = [];
  if (!plan || !Array.isArray(plan.stageGoals)) {
    return tasks;
  }

  plan.stageGoals.forEach((stage, stageIndex) => {
    const taskType = stage.id === plan.currentStageId ? "main" : "side";
    const stageTasks = Array.isArray(stage.tasks) ? stage.tasks : [];
    const mapped = mapTasks(
      state,
      stageTasks.map((task) => ({
        ...task,
        detail: task.description || task.detail,
        stageGoalId: stage.id,
        deadlineAt: task.deadlineAt,
      })),
      taskType
    );
    mapped.forEach((task) => {
      if (stageIndex > 0) {
        task.done = false;
      }
      tasks.push(task);
    });
  });
  return tasks;
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
  state.goalPlan = plan;
  state.profile.goal = plan.longTermGoal || goal;
  state.tasks = flattenGoalPlanTasks(state, plan);
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
    description: activeEvent.description,
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

function migrateLegacyState(state) {
  if (!state.initialized || !state.agent) {
    return;
  }

  let changed = false;

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
  }

  if (ensureRoleDerivedState(state)) {
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
  state.goalPlan = null;
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
  const overdueChanged = ensureTaskDeadlines(state);
  const narrativeChanged = syncOverdueNarrative(state);
  refreshGoalPlanProgress(state);
  if (goalPlanChanged || overdueChanged || narrativeChanged) {
    saveStore();
  }

  return clone({
    initialized: state.initialized,
    selectedRoleId: state.selectedRoleId,
    profile: state.profile,
    stats: state.stats,
    agent: state.agent,
    tasks: state.tasks,
    goalPlan: state.goalPlan,
    nextSuggestion: state.nextSuggestion,
    diary: state.diary,
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
  const requestedRoleId = String(payload.roleId || "scholar").trim();
  const role = getRoleOrThrow(requestedRoleId);
  const account = String(payload.account || "").trim();
  const password = String(payload.password || "").trim();
  const sessionApiKey = String(payload.apiKey || "").trim();
  const profile = {
    name: String(payload.name || "林岚").trim(),
    goal: String(payload.goal || "").trim(),
    deadline: String(payload.deadline || "30 天后").trim(),
    dailyTime: String(payload.dailyTime || "2 小时").trim(),
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

  assertAccountAvailable(account);
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
  await buildGoalPlanForState(state, profile.goal, [
    { id: "deadline", question: "距离关键节点或截止日期还有多久？", answer: profile.deadline },
    { id: "dailyTime", question: "每天大约能稳定投入几小时？", answer: profile.dailyTime },
  ]);
  if (!Array.isArray(state.tasks) || state.tasks.length === 0) {
    state.tasks = mapTasks(state, blueprint.tasks);
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
    title: "Agent 初始化",
    memorySummary: `围绕目标“${profile.goal}”完成第一轮主线初始化`,
    storyText: blueprint.openingStory,
    reward: "初始成长值 +58 / 资源点 +92",
    storyAsset: openingAsset,
  });

  const accountRecord = registerAccount({
    account,
    password,
    nickname: profile.name,
  });
  state.profile.userId = accountRecord.userId;
  state.profile.account = accountRecord.account;

  syncAgentArtifacts(state);
  saveStore();

  return {
    tag: "session.created",
    title: "Agent 初始化完成",
    storyText: blueprint.openingStory,
    rewardSummary: "获得初始成长值 +58，资源点 +92",
    characterArc: getCurrentCharacterArc(state),
    storyAsset: openingAsset,
  };
}

function loginSession(payload) {
  const account = String(payload.account || "").trim();
  const password = String(payload.password || "").trim();
  const accountRecord = authenticateAccount(account, password);
  const snapshot = loadAccountSnapshot(accountRecord.userId);

  if (!snapshot || !snapshot.state) {
    throw new Error("该账号尚未完成初始化，请先注册");
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
  updateLastLoginAt(accountRecord.userId);

  return {
    tag: "session.logged_in",
    title: "登录成功",
    storyText: `欢迎回来，${state.profile.name || accountRecord.nickname || accountRecord.account}。`,
    rewardSummary: state.profile.goal
      ? `当前主线目标：${state.profile.goal}`
      : "已恢复账号状态",
    characterArc: getCurrentCharacterArc(state),
  };
}

async function completeTask(taskId) {
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

  const role = getRole(state.selectedRoleId);
  const currentChapterTitle = state.agent.chapter;
  ensureTaskDeadlines(state);
  const overdueDays = getOverdueDays(task);
  const baseRewardGrowth = getEffectiveRewardGrowth(task);
  const rewardTask = {
    ...task,
    rewardGrowth: baseRewardGrowth,
  };
  task.done = true;
  task.overdueDays = 0;
  task.debuffActive = false;

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

  const mainTasks = state.tasks.filter((entry) => entry.type === "main");
  const allMainDone = mainTasks.length > 0 && mainTasks.every((entry) => entry.done);
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
    permanentTitles: narrativeContext.permanentTitles,
    worldEntities: narrativeContext.worldEntities,
    seasonDigests: narrativeContext.seasonDigests,
    storyAsset,
  });

  const rewardSummary =
    buildRewardSummary(baseRewardGrowth, task.rewardResource, skillResolution) +
    (overdueDays > 0 ? ` / 超时 Debuff：已超时 ${overdueDays} 天，成长值按 70% 结算` : "");
  const touchedWorldEntities = upsertWorldEntities(state.worldState, story.worldEntities || [], {
    sourceSeasonId: state.agent.currentSeasonId,
    sourceTaskId: task.id,
  });

  createDiaryEntry(state, {
    title: `${task.type === "main" ? "主线推进" : "支线完成"}：${task.title}`,
    body: `${story.storyText}${levelUps > 0 ? ` 角色升至 Lv.${state.stats.level}。` : ""}`,
    reward: rewardSummary,
  });

  const taskMemory = createMemoryEntry(state, {
    type: task.type === "main" ? "task_completed_main" : "task_completed_side",
    title: `${task.type === "main" ? "主线" : "支线"}完成：${task.title}`,
    memorySummary: story.memorySummary,
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
    state.agent.mainline = "当前阶段主线已经完成，请立即输入下一阶段新目标以生成新的主线任务。";
    state.agent.chapter = `${role.chapter} · 当前阶段已完成`;
    state.agent.stage = "awaiting-next-goal";
    state.agent.emotion = "期待";

    createDiaryEntry(state, {
      title: "主线阶段完成",
      body: "当前阶段的主线任务已经全部完成，章节终章已生成。系统将弹出输入框，要求用户录入下一阶段目标并开启新的剧情章节。",
      reward: "等待输入新的主线目标",
    });

    createMemoryEntry(state, {
      type: "mainline_complete",
      title: "当前阶段主线完成",
      memorySummary: "本阶段主线完成，等待新的阶段目标",
      storyText: "本阶段主线已经全部完成，系统需要用户输入新的阶段目标。",
      reward: "等待新的主线目标",
    });
  }

  refreshGoalPlanProgress(state);
  state.nextSuggestion = await planNextSuggestion(state.goalPlan, task, state.stats, {
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
    memorySummary: story.memorySummary,
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
  const currentStage = getCurrentStage(state);

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
          stageGoalId: payload && payload.stageGoalId ? payload.stageGoalId : currentStage && currentStage.id,
          difficulty: 1,
          narrativeHook: "一条新的支线补给路标出现在目标地图上。",
        },
      ],
      "side"
    )
  );
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
  const mapped = mapTasks(
    state,
    (rawTasks || []).map((task) => ({
      ...task,
      detail: task.description || task.detail,
      stageGoalId: stageId,
      deadlineAt: task.deadlineAt,
    })),
    type
  );
  state.tasks.unshift(...mapped);
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

  if (result.mode === "replace_task" && targetTask && !targetTask.done) {
    state.tasks = state.tasks.filter((task) => task && task.id !== targetTask.id);
  }

  if (result.mode === "replace_today") {
    state.tasks = state.tasks.filter(
      (task) => task && (task.done || (stageId && task.stageGoalId !== stageId))
    );
  }

  addPlannedTasksToState(state, result.tasks, stageId, "main");
  state.agent.emotion = "调整";
  state.lastStory = result.message || "今日任务已根据目标地图重新规划。";
  state.lastRewardSummary = "目标编排已更新";

  createDiaryEntry(state, {
    title: "AI 目标重规划",
    body: state.lastStory,
    reward: state.lastRewardSummary,
  });

  syncAgentArtifacts(state);
  saveStore();

  return {
    tag: "goal.replanned",
    title: "AI 重新规划完成",
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
    title: "AI 已重新建议",
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

function startDungeonRun(demoMode) {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);
  const storyline = getDungeonStoryline(state.selectedRoleId);

  const timeState = getDungeonState(Boolean(demoMode));
  if (!timeState.unlocked) {
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
  state.dungeonRun.lineName = storyline.lineName;
  state.dungeonRun.chapterTitle = storyline.chapterTitle;
  state.dungeonRun.stateLabels = clone(storyline.stateLabels || {});
  state.dungeonRun.currentEventId = storyline.startEventId;
  state.dungeonRun.visitedEventIds = [storyline.startEventId];
  state.dungeonRun.routeState = createInitialDungeonRouteState(state);
  state.dungeonRun.flags = buildInitialDungeonFlags(state);
  state.dungeonRun.recentOutcome = storyline.chapterIntro;

  state.agent.stage = "dungeon-running";
  state.agent.emotion = "出征";
  state.lastStory = storyline.chapterIntro;
  state.lastRewardSummary = `夜幕章节已开启：${storyline.chapterTitle}`;
  const storyAsset = selectEventStoryAsset(state, {
    eventTag: "dungeon.entered",
    phase: "opening",
    text: `${storyline.lineName} ${storyline.chapterTitle} ${storyline.chapterIntro}`,
  });

  saveStore();

  return {
    tag: "dungeon.entered",
    title: `进入${storyline.lineName}`,
    storyText: storyline.chapterIntro,
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
  const growthDelta = Number(effects.growth || 0);
  const resourceDelta = Number(effects.resources || 0);
  const insightDelta = Number(effects.insight || 0);
  const bondDelta = Number(effects.bond || 0);
  const resolveDelta = Number(effects.resolve || 0);
  const labels = buildDungeonStateLabels(storyline, state.dungeonRun);

  state.stats.growth += growthDelta;
  state.stats.resources += resourceDelta;
  state.dungeonRun.totals.growth += growthDelta;
  state.dungeonRun.totals.resources += resourceDelta;
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
    growth: growthDelta,
    resources: resourceDelta,
    routeSummary: buildDungeonRewardSummary(effects, labels),
  });

  const levelUps = calculateLevelUps(state);
  applyAgentArcState(state);

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
    state.lastRewardSummary = `${buildDungeonRewardSummary(effects, labels)}；${state.dungeonRun.endingSummary}`;
  } else {
    state.dungeonRun.currentEventId = selectedChoice.nextEventId;
    if (selectedChoice.nextEventId && !state.dungeonRun.visitedEventIds.includes(selectedChoice.nextEventId)) {
      state.dungeonRun.visitedEventIds.push(selectedChoice.nextEventId);
    }
    state.lastStory = selectedChoice.outcome;
    state.lastRewardSummary = buildDungeonRewardSummary(effects, labels);
  }

  if (levelUps > 0) {
    state.lastRewardSummary += `；角色升至 Lv.${state.stats.level}`;
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
    rewardSummary: buildDungeonRewardSummary(effects, labels),
    rewardDelta: {
      growth: growthDelta,
      resources: resourceDelta,
    },
    characterArc: getCurrentCharacterArc(state),
    storyAsset,
  };
}

function settleDungeonRun() {
  const state = getState();
  ensureInitialized(state);
  migrateLegacyState(state);

  if (!state.dungeonRun || !state.dungeonRun.readyToSettle) {
    throw new Error("副本尚未完成全部事件节点，无法结算");
  }

  const storyline = getDungeonStoryline(state.dungeonRun.storylineId || state.selectedRoleId);
  const ending = state.dungeonRun.preparedEnding;
  if (!ending) {
    throw new Error("当前结局信息缺失，请重新开始本轮副本");
  }

  const endingGrowth = Number(ending.rewardDelta && ending.rewardDelta.growth) || 0;
  const endingResources = Number(ending.rewardDelta && ending.rewardDelta.resources) || 0;
  state.stats.growth += endingGrowth;
  state.stats.resources += endingResources;
  state.dungeonRun.totals.growth += endingGrowth;
  state.dungeonRun.totals.resources += endingResources;
  const levelUps = calculateLevelUps(state);
  applyAgentArcState(state);

  const totals = {
    growth: Number(state.dungeonRun.totals && state.dungeonRun.totals.growth) || 0,
    resources: Number(state.dungeonRun.totals && state.dungeonRun.totals.resources) || 0,
  };
  const routeRecap = state.dungeonRun.history
    .map((entry, index) => `${index + 1}. ${entry.nodeTitle}：${entry.choiceLabel}`)
    .join("\n");
  const settleStory = `${ending.storyText}\n\n【本轮抉择】\n${routeRecap}\n\n【章节归档】\n${
    storyline.chapterTitle
  } 已闭合，你带回了累计成长值 +${totals.growth}、资源点 +${totals.resources} 的夜行成果。`;

  createDiaryEntry(state, {
    title: `夜间副本结局：${ending.direction}`,
    body: settleStory,
    reward: `成长值 +${totals.growth} / 资源点 +${totals.resources}`,
  });

  createMemoryEntry(state, {
    type: "dungeon_settlement",
    title: `夜间副本完成：${ending.direction}`,
    memorySummary: `${storyline.lineName} 达成「${ending.direction}」，累计成长值 +${totals.growth}，资源点 +${totals.resources}`,
    storyText: settleStory,
    reward: `成长值 +${totals.growth} / 资源点 +${totals.resources}`,
  });

  state.stats.streak += 1;
  state.agent.stage = "chapter-continue";
  state.agent.emotion = "稳态前进";
  state.lastStory = settleStory;
  state.lastRewardSummary = `副本结算：成长值 +${totals.growth}，资源点 +${totals.resources}，连击天数 +1`;
  if (levelUps > 0) {
    state.lastRewardSummary += `；角色升至 Lv.${state.stats.level}`;
  }
  state.dungeonRun.readyToSettle = false;
  state.dungeonRun.settled = true;
  state.dungeonRun.endingSummary = `${ending.title} · ${ending.direction}`;

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
    title: ending.title,
    storyText: settleStory,
    rewardSummary: state.lastRewardSummary,
    rewardDelta: {
      growth: totals.growth,
      resources: totals.resources,
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

async function advanceGoal(payload) {
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
  if (!Array.isArray(state.tasks) || state.tasks.length === 0) {
    state.tasks = mapTasks(state, blueprint.tasks);
  }
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
    markdown: readMemoryMarkdown(state.agent.agentId),
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
  loginSession,
  completeTask,
  createTask,
  updateTask,
  replanGoalTasks,
  refreshNextSuggestion,
  adoptNextSuggestion,
  createPurchase,
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
