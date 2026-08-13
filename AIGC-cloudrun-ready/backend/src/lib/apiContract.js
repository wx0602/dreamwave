function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text && text !== "null" ? text : null;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function cloneStats(stats) {
  const source = asObject(stats) || {};
  return {
    hp: toNumber(source.hp, 0),
    attack: toNumber(source.attack, 0),
    defense: toNumber(source.defense, 0),
    shield: toNumber(source.shield, 0),
  };
}

function parseEstimatedMinutes(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  const text = cleanText(value);
  if (!text) {
    return 0;
  }

  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function buildSkillDto(skill) {
  if (typeof skill === "string") {
    return {
      id: skill,
      name: skill,
    };
  }

  const source = asObject(skill) || {};
  return {
    id: cleanText(source.id),
    name: cleanText(source.name),
    description: cleanText(source.description),
    scope: cleanText(source.scope),
    ownerRoleIds: Array.isArray(source.ownerRoleIds) ? [...source.ownerRoleIds] : [],
    trigger: asObject(source.trigger),
    mechanicalEffects: asObject(source.mechanicalEffects),
    configPath: cleanText(source.configPath),
  };
}

function buildRoleDto(role) {
  const source = asObject(role) || {};
  const startingSkills = Array.isArray(source.startingSkills)
    ? source.startingSkills
        .map((skill) => {
          if (typeof skill === "string") {
            return cleanText(skill);
          }
          return cleanText(skill && skill.name);
        })
        .filter(Boolean)
    : [];

  return {
    id: cleanText(source.id),
    name: cleanText(source.name),
    description: cleanText(source.description),
    agentName: cleanText(source.agentName),
    storyTone: cleanText(source.tone),
    worldSetting: cleanText(source.world),
    icon: cleanText(source.spriteClass),
    startingSkills,
    dungeonBaseStats: cloneStats(source.dungeonBaseStats),
  };
}

function buildUserDto(state) {
  const source = asObject(state) || {};
  const profile = asObject(source.profile) || {};
  const agent = asObject(source.agent) || {};

  if (!cleanText(profile.name) && !cleanText(agent.agentId)) {
    return null;
  }

  return {
    userId: cleanText(profile.userId) || cleanText(agent.agentId),
    nickname: cleanText(profile.name),
    selectedRoleId: cleanText(source.selectedRoleId) || cleanText(agent.roleId),
    roleName: cleanText(agent.roleName),
    currentGoal: cleanText(profile.goal),
    currentChapter: cleanText(agent.chapter),
    worldSetting: cleanText(agent.world),
    deadline: cleanText(profile.deadline),
    dailyTime: cleanText(profile.dailyTime),
  };
}

function buildProgressDto(state) {
  const stats = asObject(state && state.stats) || {};
  return {
    level: toNumber(stats.level, 0),
    growthValue: toNumber(stats.growth, 0),
    nextLevel: toNumber(stats.nextLevel, 0),
    resourcePoints: toNumber(stats.resources, 0),
    streak: toNumber(stats.streak, 0),
  };
}

function buildAgentDto(state) {
  const agent = asObject(state && state.agent);
  if (!agent) {
    return null;
  }

  return {
    agentId: cleanText(agent.agentId),
    agentName: cleanText(agent.agentName),
    roleId: cleanText(agent.roleId),
    roleName: cleanText(agent.roleName),
    roleDescription: cleanText(agent.roleDescription),
    roleConfigPath: cleanText(agent.roleConfigPath),
    spriteClass: cleanText(agent.spriteClass),
    storyTone: cleanText(agent.tone),
    prologue: cleanText(agent.prologue),
    chapterTitle: cleanText(agent.chapter),
    mainlineSummary: cleanText(agent.mainline),
    stage: cleanText(agent.stage),
    emotion: cleanText(agent.emotion),
    currentSeasonId: cleanText(agent.currentSeasonId),
    activeSkillIds: Array.isArray(agent.activeSkillIds) ? [...agent.activeSkillIds] : [],
  };
}

function buildTaskDto(task) {
  const source = asObject(task) || {};
  const taskType =
    cleanText(source.type) || cleanText(source.taskType) || cleanText(source.task_type) || "main";
  const done =
    Boolean(source.done) ||
    cleanText(source.status) === "completed" ||
    cleanText(source.status) === "2" ||
    cleanText(source.status) === "2.0";

  return {
    taskId: cleanText(source.id) || cleanText(source.taskId),
    title: cleanText(source.title),
    detail: cleanText(source.detail) || cleanText(source.rationale),
    taskType,
    estimatedMinutes: parseEstimatedMinutes(
      source.estimatedMinutes ?? source.estimate_minutes ?? source.estimate
    ),
    status: done ? "completed" : "pending",
    deadlineAt: cleanText(source.deadlineAt),
    deadlineLabel: cleanText(source.deadlineLabel),
    overdueDays: toNumber(source.overdueDays, 0),
    debuffActive: Boolean(source.debuffActive),
    rewardGrowth: toNumber(source.rewardGrowth ?? source.reward_growth, 0),
    rewardResource: toNumber(source.rewardResource ?? source.reward_resource, 0),
    stageGoalId: cleanText(source.stageGoalId),
    difficulty: toNumber(source.difficulty, 0),
    dueDate: cleanText(source.dueDate) || cleanText(source.deadlineAt),
    narrativeHook: cleanText(source.narrativeHook),
  };
}

function buildGoalTaskDto(task) {
  const source = asObject(task) || {};
  return {
    id: cleanText(source.id) || cleanText(source.taskId),
    title: cleanText(source.title),
    description: cleanText(source.description) || cleanText(source.detail),
    stageGoalId: cleanText(source.stageGoalId),
    difficulty: toNumber(source.difficulty, 0),
    estimatedMinutes: parseEstimatedMinutes(source.estimatedMinutes ?? source.estimate),
    status: cleanText(source.status) || (source.done ? "DONE" : "TODO"),
    rewardGrowth: toNumber(source.rewardGrowth, 0),
    rewardResource: toNumber(source.rewardResource, 0),
    dueDate: cleanText(source.dueDate) || cleanText(source.deadlineAt),
    narrativeHook: cleanText(source.narrativeHook),
  };
}

function buildStageGoalDto(stage) {
  const source = asObject(stage) || {};
  return {
    id: cleanText(source.id),
    title: cleanText(source.title),
    description: cleanText(source.description),
    progress: toNumber(source.progress, 0),
    status: cleanText(source.status) || "NOT_STARTED",
    tasks: Array.isArray(source.tasks) ? source.tasks.map(buildGoalTaskDto) : [],
  };
}

function buildClarifyingQuestionDto(question) {
  const source = asObject(question) || {};
  return {
    id: cleanText(source.id),
    question: cleanText(source.question),
    answer: cleanText(source.answer),
  };
}

function buildGoalPlanDto(goalPlan) {
  const source = asObject(goalPlan);
  if (!source) {
    return null;
  }
  return {
    id: cleanText(source.id),
    longTermGoal: cleanText(source.longTermGoal),
    goalLevel: cleanText(source.goalLevel),
    currentStageId: cleanText(source.currentStageId),
    stageGoals: Array.isArray(source.stageGoals) ? source.stageGoals.map(buildStageGoalDto) : [],
    clarifyingQuestions: Array.isArray(source.clarifyingQuestions)
      ? source.clarifyingQuestions.map(buildClarifyingQuestionDto)
      : [],
    createdAt: cleanText(source.createdAt),
    updatedAt: cleanText(source.updatedAt),
  };
}

function buildDiaryEntryDto(entry) {
  const source = asObject(entry) || {};
  return {
    diaryId: cleanText(source.id),
    title: cleanText(source.title),
    body: cleanText(source.body) || cleanText(source.content),
    rewardSummary: cleanText(source.reward) || cleanText(source.rewardSummary),
    createdAt: cleanText(source.time) || cleanText(source.timestamp) || cleanText(source.createdAt),
  };
}

function buildInventoryItemDto(item) {
  const source = asObject(item) || {};
  return {
    inventoryId: cleanText(source.id),
    name: cleanText(source.name),
    detail: cleanText(source.detail),
    equipped: Boolean(source.equipped),
    category: cleanText(source.category),
  };
}

function buildShopItemDto(item) {
  const source = asObject(item) || {};
  return {
    itemId: cleanText(source.id) || cleanText(source.itemId),
    name: cleanText(source.name),
    price: toNumber(source.price ?? source.cost, 0),
    type: cleanText(source.type),
    effect: cleanText(source.effect) || cleanText(source.description),
    purchased: Boolean(source.purchased),
  };
}

function buildTransitionDto(transition) {
  const source = asObject(transition) || {};
  return {
    needsNextGoalPrompt: Boolean(source.needsNewGoalPrompt),
    promptVersion: toNumber(source.promptVersion, 0),
  };
}

function buildCharacterArcDto(arc) {
  const source = asObject(arc) || {};
  if (!source) {
    return null;
  }

  return {
    id: cleanText(source.id) || cleanText(source.stageId),
    label: cleanText(source.label),
    levelRange: cleanText(source.levelRange),
    tone: cleanText(source.tone),
    prompt: cleanText(source.prompt),
    summary: cleanText(source.summary),
  };
}

function buildSkillStateDto(skillState) {
  const source = asObject(skillState) || {};
  return {
    unlockedSkills: Array.isArray(source.unlockedSkills)
      ? source.unlockedSkills.map(buildSkillDto)
      : [],
    lastTriggeredSkills: Array.isArray(source.lastTriggeredSkills)
      ? source.lastTriggeredSkills.map(buildSkillDto)
      : [],
    activationCount: toNumber(source.activationCount, 0),
    lastTriggeredAt: cleanText(source.lastTriggeredAt),
  };
}

function buildDungeonProfileDto(dungeonProfile) {
  const source = asObject(dungeonProfile) || {};
  return {
    roleId: cleanText(source.roleId),
    baseStats: cloneStats(source.baseStats),
    temporaryBuffs: cloneStats(source.temporaryBuffs),
    currentStats: cloneStats(source.currentStats),
  };
}

function buildMemorySummaryDto(memory) {
  const source = asObject(memory) || {};
  return {
    memoryId: cleanText(source.memoryId),
    title: cleanText(source.title),
    memorySummary: cleanText(source.memorySummary),
    createdAt: cleanText(source.createdAt),
    taskId: cleanText(source.taskId),
  };
}

function buildTitleDto(title) {
  if (typeof title === "string") {
    return {
      name: cleanText(title),
      label: cleanText(title),
    };
  }

  const source = asObject(title) || {};
  return {
    name: cleanText(source.name),
    label: cleanText(source.label) || cleanText(source.name),
    description: cleanText(source.description),
    sourceSeasonId: cleanText(source.sourceSeasonId),
    earnedAt: cleanText(source.earnedAt),
  };
}

function buildWorldEntityDto(entity) {
  const source = asObject(entity) || {};
  return {
    key: cleanText(source.key),
    type: cleanText(source.type),
    name: cleanText(source.name),
    status: cleanText(source.status),
    summary: cleanText(source.summary),
    lastUpdatedAt: cleanText(source.lastUpdatedAt),
  };
}

function buildStoryAssetDto(asset) {
  const source = asObject(asset);
  if (!source) {
    return null;
  }

  return {
    id: cleanText(source.id),
    name: cleanText(source.name),
    category: cleanText(source.category),
    row: toNumber(source.row, 0),
    prompt: cleanText(source.prompt),
  };
}

function buildChapterFinaleDto(finale) {
  const source = asObject(finale) || {};
  if (!source || Object.keys(source).length === 0) {
    return null;
  }

  return {
    chapterTitle: cleanText(source.chapterTitle),
    chapterFinale: cleanText(source.chapterFinale) || cleanText(source.finalText),
    chapterDigest: cleanText(source.chapterDigest) || cleanText(source.finalDigest),
    createdAt: cleanText(source.createdAt),
  };
}

function buildSeasonArchiveDto(archive) {
  const source = asObject(archive) || {};
  if (!source || Object.keys(source).length === 0) {
    return null;
  }

  return {
    seasonId: cleanText(source.seasonId),
    index: toNumber(source.index, 0),
    goal: cleanText(source.goal),
    chapterTitle: cleanText(source.chapterTitle),
    seasonEpic: cleanText(source.seasonEpic),
    seasonDigest: cleanText(source.seasonDigest),
    earnedTitles: Array.isArray(source.earnedTitles)
      ? source.earnedTitles.map(buildTitleDto)
      : [],
    archivedAt: cleanText(source.archivedAt),
  };
}

function buildActiveSeasonDto(season) {
  const source = asObject(season) || {};
  if (!source || Object.keys(source).length === 0) {
    return null;
  }

  return {
    seasonId: cleanText(source.seasonId),
    index: toNumber(source.index, 0),
    goal: cleanText(source.goal),
    roleId: cleanText(source.roleId),
    roleName: cleanText(source.roleName),
    chapterTitle: cleanText(source.chapterTitle),
    startedAt: cleanText(source.startedAt),
    taskMemories: Array.isArray(source.taskMemories)
      ? source.taskMemories.map(buildMemorySummaryDto)
      : [],
    chapterFinales: Array.isArray(source.chapterFinales)
      ? source.chapterFinales.map(buildChapterFinaleDto)
      : [],
  };
}

function buildMemoryTreeDto(memoryTree) {
  const source = asObject(memoryTree) || {};
  return {
    l1WindowSize: toNumber(source.l1WindowSize, 0),
    l1Recent: Array.isArray(source.l1Recent) ? source.l1Recent.map(buildMemorySummaryDto) : [],
    activeSeason: buildActiveSeasonDto(source.activeSeason),
    seasonArchives: Array.isArray(source.seasonArchives)
      ? source.seasonArchives.map(buildSeasonArchiveDto)
      : [],
    permanentTitles: Array.isArray(source.permanentTitles)
      ? source.permanentTitles.map(buildTitleDto)
      : [],
  };
}

function buildWorldStateDto(worldState) {
  const source = asObject(worldState) || {};
  return {
    totalCount: toNumber(source.totalCount, 0),
    lastUpdatedAt: cleanText(source.lastUpdatedAt),
    entities: Array.isArray(source.entities) ? source.entities.map(buildWorldEntityDto) : [],
  };
}

function buildAgentMetaDto(agentMeta) {
  const source = asObject(agentMeta) || {};
  if (!source || Object.keys(source).length === 0) {
    return null;
  }

  return {
    agentId: cleanText(source.agentId),
    memoryCount: toNumber(source.memoryCount, 0),
    lastMemoryAt: cleanText(source.lastMemoryAt),
    identityPath: cleanText(source.identityPath),
    memoryPath: cleanText(source.memoryPath),
    llmEnabled: Boolean(source.llmEnabled),
  };
}

function buildRewardDeltaDto(rewardDelta) {
  const source = asObject(rewardDelta) || {};
  if (!source || Object.keys(source).length === 0) {
    return null;
  }

  return {
    growth: toNumber(source.growth, 0),
    resources: toNumber(source.resources, 0),
  };
}

function buildMemoryRecordDto(memory) {
  const source = asObject(memory) || {};
  return {
    memoryId: cleanText(source.id) || cleanText(source.memoryId),
    type: cleanText(source.type),
    title: cleanText(source.title),
    memorySummary: cleanText(source.memorySummary) || cleanText(source.summary),
    storyText: cleanText(source.storyText),
    rewardSummary: cleanText(source.reward),
    createdAt: cleanText(source.createdAt),
    relatedTaskId: cleanText(source.relatedTaskId),
    skillsTriggered: Array.isArray(source.skillsTriggered) ? [...source.skillsTriggered] : [],
    dungeonBuffs: asObject(source.dungeonBuffs),
    worldEntities: Array.isArray(source.worldEntities)
      ? source.worldEntities.map(buildWorldEntityDto)
      : [],
  };
}

function buildEventDto(event) {
  const source = asObject(event) || {};
  return {
    tag: cleanText(source.tag),
    title: cleanText(source.title),
    storyText: cleanText(source.storyText) || cleanText(source.body),
    memorySummary: cleanText(source.memorySummary),
    rewardSummary: cleanText(source.rewardSummary),
    rewardDelta: buildRewardDeltaDto(source.rewardDelta),
    triggeredSkills: Array.isArray(source.triggeredSkills)
      ? source.triggeredSkills.map(buildSkillDto)
      : [],
    chapterFinale: buildChapterFinaleDto(source.chapterFinale),
    seasonArchive: buildSeasonArchiveDto(source.seasonArchive),
    characterArc: buildCharacterArcDto(source.characterArc),
    storyAsset: buildStoryAssetDto(source.storyAsset),
    worldEntities: Array.isArray(source.worldEntities)
      ? source.worldEntities.map(buildWorldEntityDto)
      : [],
  };
}

function buildAppState(statePayload) {
  const source = asObject(statePayload) || {};
  return {
    initialized: Boolean(source.initialized),
    user: buildUserDto(source),
    progress: buildProgressDto(source),
    agent: buildAgentDto(source),
    tasks: Array.isArray(source.tasks) ? source.tasks.map(buildTaskDto) : [],
    goalPlan: buildGoalPlanDto(source.goalPlan),
    nextSuggestion: cleanText(source.nextSuggestion),
    diary: Array.isArray(source.diary) ? source.diary.map(buildDiaryEntryDto) : [],
    inventory: Array.isArray(source.inventory)
      ? source.inventory.map(buildInventoryItemDto)
      : [],
    shopItems: Array.isArray(source.shop) ? source.shop.map(buildShopItemDto) : [],
    transition: buildTransitionDto(source.transition),
    characterArc: buildCharacterArcDto(source.characterArc),
    skillState: buildSkillStateDto(source.skillState),
    dungeonProfile: buildDungeonProfileDto(source.dungeonProfile),
    memoryTree: buildMemoryTreeDto(source.memoryTree),
    worldState: buildWorldStateDto(source.worldState),
    agentMeta: buildAgentMetaDto(source.agentMeta),
    openingNarrative: cleanText(source.openingNarrative),
    lastStory: cleanText(source.lastStory),
    lastRewardSummary: cleanText(source.lastRewardSummary),
  };
}

function buildCommandResult(event, statePayload) {
  return {
    event: buildEventDto(event),
    state: buildAppState(statePayload),
  };
}

function buildDungeonStatus(dungeonState, panel) {
  const source = asObject(dungeonState) || {};
  const run = asObject(source.run);
  const activeNode = run && asObject(run.activeNode);
  return {
    isOpen: Boolean(source.isOpen || source.unlocked),
    currentTime: cleanText(source.currentTime) || cleanText(source.clock),
    countdown: cleanText(source.countdown),
    demoMode: Boolean(source.demoMode),
    statusText:
      cleanText(source.statusText) ||
      (Boolean(source.isOpen || source.unlocked)
        ? "副本已开启 - 迎接挑战吧！"
        : "副本已关闭 - 请准时归来"),
    panel: buildDungeonProfileDto(panel || source.panel),
    run: run
      ? {
          active: Boolean(run.active),
          runId: cleanText(run.runId),
          startedAt: cleanText(run.startedAt),
          currentIndex: toNumber(run.currentIndex, 0),
          totalNodes: toNumber(run.totalNodes, 0),
          lineName: cleanText(run.lineName),
          chapterTitle: cleanText(run.chapterTitle),
          stateSummary: cleanText(run.stateSummary),
          recentOutcome: cleanText(run.recentOutcome),
          readyToSettle: Boolean(run.readyToSettle),
          settled: Boolean(run.settled),
          totals: {
            growth: toNumber(run.totals && run.totals.growth, 0),
            resources: toNumber(run.totals && run.totals.resources, 0),
          },
          activeNode: activeNode
            ? {
                nodeId: cleanText(activeNode.nodeId),
                title: cleanText(activeNode.title),
                description: cleanText(activeNode.description),
                choices: Array.isArray(activeNode.choices)
                  ? activeNode.choices.map((choice) => ({
                      choiceId: cleanText(choice && choice.choiceId),
                      label: cleanText(choice && choice.label),
                    }))
                  : [],
              }
            : null,
          endingTitle: cleanText(run.endingTitle),
          endingSummary: cleanText(run.endingSummary),
        }
      : null,
  };
}

function buildAgentProfile(agentProfile) {
  const source = asObject(agentProfile) || {};
  return {
    user: buildUserDto({
      selectedRoleId: source.agent && source.agent.roleId,
      profile: source.profile,
      agent: source.agent,
    }),
    progress: buildProgressDto({ stats: source.stats }),
    agent: buildAgentDto({ agent: source.agent }),
    recentMemories: Array.isArray(source.recentMemories)
      ? source.recentMemories.map(buildMemoryRecordDto)
      : [],
    paths: {
      identityPath: cleanText(source.identityPath),
      memoryPath: cleanText(source.memoryPath),
      roleConfigPath: cleanText(source.roleConfigPath),
      skillConfigPaths: Array.isArray(source.skillConfigPaths) ? [...source.skillConfigPaths] : [],
    },
    skillState: buildSkillStateDto(source.skillState),
    dungeonProfile: buildDungeonProfileDto(source.dungeonProfile),
    characterArc: buildCharacterArcDto(source.characterArc),
    memoryTree: buildMemoryTreeDto(source.memoryTree),
    worldState: buildWorldStateDto(source.worldState),
  };
}

function buildAgentMemory(agentMemory) {
  const source = asObject(agentMemory) || {};
  return {
    memories: Array.isArray(source.memories) ? source.memories.map(buildMemoryRecordDto) : [],
    markdown: cleanText(source.markdown),
    memoryTree: buildMemoryTreeDto(source.memoryTree),
    worldState: buildWorldStateDto(source.worldState),
  };
}

function buildSuccessResponse(data, message = "ok") {
  return {
    code: 200,
    message,
    success: true,
    data,
  };
}

function buildErrorResponse(message, code = 400) {
  return {
    code,
    message,
    success: false,
    data: null,
  };
}

module.exports = {
  buildRoleDto,
  buildAppState,
  buildCommandResult,
  buildDungeonStatus,
  buildAgentProfile,
  buildAgentMemory,
  buildSuccessResponse,
  buildErrorResponse,
};
