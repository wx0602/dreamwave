const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const { defaultShop } = require("../constants/shop");
const { clone } = require("../utils/clone");
const { createEmptyMemoryTree } = require("../services/memoryTreeService");
const { createEmptyWorldState } = require("../services/worldStateService");
const { getDeepseekApiKey } = require("./runtimeSecrets");
const { saveAccountSnapshot } = require("./accountStore");
const { getRequestContext } = require("../context/requestContext");

function createEmptyState() {
  return {
    meta: {
      nextId: 1,
      version: 9,
      updatedAt: new Date().toISOString(),
    },
    initialized: false,
    selectedRoleId: "scholar",
    profile: null,
    stats: {
      level: 3,
      growth: 58,
      nextLevel: 100,
      resources: 92,
      streak: 4,
    },
    agent: null,
    openingNarrative: null,
    lastStory: null,
    lastRewardSummary: null,
    tasks: [],
    taskHistory: [],
    goalPlan: null,
    dailyPlan: null,
    dailyPlanHistory: [],
    goalPortfolio: {
      version: 2,
      goals: [],
    },
    nextSuggestion: null,
    diary: [],
    memories: [],
    skillState: {
      unlockedSkillIds: [],
      lastTriggeredSkillIds: [],
      activationCount: 0,
      lastTriggeredAt: null,
    },
    overdueState: {
      maxOverdueDays: 0,
      lastNarrativeOverdueDays: 0,
      lastNarrativeTaskId: null,
      pendingNarrative: null,
    },
    dungeon: {
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
    },
    dungeonRun: {
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
    },
    dungeonSettlementHistory: [],
    starMap: {
      version: 1,
      collections: [],
      tools: {},
      scheduledReviews: [],
    },
    inventory: [],
    shop: defaultShop.map((item) => ({ ...item })),
    transition: {
      needsNewGoalPrompt: false,
      promptVersion: 0,
    },
    memoryTree: createEmptyMemoryTree(),
    worldState: createEmptyWorldState(),
  };
}

let state = null;

function ensureRuntimeDir() {
  fs.mkdirSync(env.runtimeDir, { recursive: true });
  fs.mkdirSync(env.agentsDir, { recursive: true });
  fs.mkdirSync(env.accountsDir, { recursive: true });
}

function clearDirectoryPreserveGitkeep(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".gitkeep") {
      continue;
    }

    const targetPath = path.join(dirPath, entry.name);
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function loadStore() {
  if (state) {
    return state;
  }

  ensureRuntimeDir();

  if (fs.existsSync(env.storeFile)) {
    state = JSON.parse(fs.readFileSync(env.storeFile, "utf8"));
  } else {
    state = createEmptyState();
    saveStore();
  }

  if (!Array.isArray(state.memories)) {
    state.memories = [];
  }
  if (!Array.isArray(state.taskHistory)) {
    state.taskHistory = [];
  }
  if (!Array.isArray(state.dailyPlanHistory)) {
    state.dailyPlanHistory = [];
  }
  if (!Array.isArray(state.dungeonSettlementHistory)) {
    state.dungeonSettlementHistory = [];
  }
  if (!Object.prototype.hasOwnProperty.call(state, "dailyPlan")) {
    state.dailyPlan = null;
  }
  if (!state.meta) {
    state.meta = {
      nextId: 1,
      version: 6,
      updatedAt: new Date().toISOString(),
    };
  }
  if (!state.skillState) {
    state.skillState = {
      unlockedSkillIds: [],
      lastTriggeredSkillIds: [],
      activationCount: 0,
      lastTriggeredAt: null,
    };
  }
  if (!state.dungeon) {
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
  }
  if (!state.memoryTree) {
    state.memoryTree = createEmptyMemoryTree();
  }
  if (!state.worldState) {
    state.worldState = createEmptyWorldState();
  }
  if (!state.dungeonRun) {
    state.dungeonRun = {
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

  return state;
}

function saveStore() {
  const context = getRequestContext();
  if (context) {
    const scopedState = context.state || createEmptyState();
    if (!scopedState.meta) scopedState.meta = { nextId: 1, version: 9 };
    scopedState.meta.updatedAt = new Date().toISOString();
    context.state = scopedState;
    context.stateDirty = true;
    return;
  }
  ensureRuntimeDir();
  state.meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(env.storeFile, JSON.stringify(state, null, 2), "utf8");

  if (state.profile && state.profile.userId) {
    saveAccountSnapshot({
      userId: state.profile.userId,
      state,
      apiKey: getDeepseekApiKey(),
    });
  }
}

function getState() {
  const context = getRequestContext();
  if (context) {
    if (!context.state) context.state = createEmptyState();
    return context.state;
  }
  return loadStore();
}

function getStateSnapshot() {
  return clone(getState());
}

function replaceState(nextState) {
  const context = getRequestContext();
  if (context) {
    context.state = nextState;
    saveStore();
    return context.state;
  }
  state = nextState;
  saveStore();
  return state;
}

function updateState(mutator) {
  const current = loadStore();
  const result = mutator(current) || current;
  replaceState(result);
  return result;
}

function createId(prefix) {
  const current = loadStore();
  current.meta.nextId += 1;
  saveStore();
  return `${prefix}-${current.meta.nextId}`;
}

function resetStore() {
  const context = getRequestContext();
  if (context) {
    context.state = createEmptyState();
    saveStore();
    return context.state;
  }
  state = createEmptyState();
  saveStore();
  return state;
}

function destroyRuntimeCache() {
  ensureRuntimeDir();
  if (fs.existsSync(env.storeFile)) {
    fs.rmSync(env.storeFile, { force: true });
  }
  clearDirectoryPreserveGitkeep(env.agentsDir);
  state = null;
}

function initializeFreshRuntime() {
  destroyRuntimeCache();
  state = createEmptyState();
  saveStore();
  return state;
}

function initializeRuntime() {
  if (env.persistence.isMysql) {
    ensureRuntimeDir();
    return null;
  }
  return loadStore();
}

function getAgentDir(agentId) {
  const context = getRequestContext();
  const owner = context && (context.userId || context.clientId)
    ? String(context.userId || context.clientId).replace(/[^a-zA-Z0-9._-]/g, "_")
    : "legacy";
  return path.join(env.agentsDir, owner, String(agentId || "agent").replace(/[^a-zA-Z0-9._-]/g, "_"));
}

module.exports = {
  createEmptyState,
  loadStore,
  saveStore,
  getState,
  getStateSnapshot,
  replaceState,
  updateState,
  createId,
  resetStore,
  destroyRuntimeCache,
  initializeFreshRuntime,
  initializeRuntime,
  getAgentDir,
};
