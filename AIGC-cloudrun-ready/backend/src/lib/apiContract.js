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
    stageTaskId: cleanText(source.stageTaskId),
    dailyPlanId: cleanText(source.dailyPlanId),
    scheduledDate: cleanText(source.scheduledDate),
    source: cleanText(source.source),
    carryoverCount: toNumber(source.carryoverCount, 0),
    completedAt: cleanText(source.completedAt),
    difficulty: toNumber(source.difficulty, 0),
    dueDate: cleanText(source.dueDate) || cleanText(source.deadlineAt),
    narrativeHook: cleanText(source.narrativeHook),
    portfolioGoalId: cleanText(source.portfolioGoalId),
    portfolioNodeId: cleanText(source.portfolioNodeId),
    portfolioDay: toNumber(source.portfolioDay, 0),
    portfolioSlot: toNumber(source.portfolioSlot, 0),
    portfolioReleaseDate: cleanText(source.portfolioReleaseDate),
    goalTitle: cleanText(source.goalTitle),
    taskRole: cleanText(source.taskRole),
    taskRoleLabel: cleanText(source.taskRoleLabel),
    phaseId: cleanText(source.phaseId),
    phaseTitle: cleanText(source.phaseTitle),
    weeklyMilestoneId: cleanText(source.weeklyMilestoneId),
    weeklyMilestoneTitle: cleanText(source.weeklyMilestoneTitle),
    qualityScore: toNumber(source.qualityScore, 0),
    priorityTier: cleanText(source.priorityTier) || (taskType === "main" ? "CORE" : "OPTIONAL"),
    selectionReason: cleanText(source.selectionReason),
    completionSummary: cleanText(source.completionSummary),
    originDraftId: cleanText(source.originDraftId),
    sourceRef: buildSourceRefDto(source.sourceRef),
  };
}

function buildSourceRefDto(sourceRef) {
  const source = asObject(sourceRef);
  if (!source) return null;
  return {
    sourceId: cleanText(source.sourceId),
    sourceTitle: cleanText(source.sourceTitle),
    locatorType: cleanText(source.locatorType),
    locatorLabel: cleanText(source.locatorLabel),
    locatorUrl: cleanText(source.locatorUrl),
    verified: Boolean(source.verified),
  };
}

function buildLearningSourceDto(source) {
  const value = asObject(source) || {};
  return {
    sourceId: cleanText(value.sourceId),
    origin: cleanText(value.origin),
    title: cleanText(value.title),
    provider: cleanText(value.provider),
    type: cleanText(value.type),
    url: cleanText(value.url),
    accessType: cleanText(value.accessType),
    editionOrVersion: cleanText(value.editionOrVersion),
    language: cleanText(value.language),
    description: cleanText(value.description),
    structure: Array.isArray(value.structure) ? value.structure.map((entry) => ({
      locatorType: cleanText(entry && entry.locatorType),
      locatorLabel: cleanText(entry && entry.locatorLabel),
      locatorUrl: cleanText(entry && entry.locatorUrl),
      order: toNumber(entry && entry.order, 0),
    })) : [],
    outlineStatus: cleanText(value.outlineStatus),
    verificationStatus: cleanText(value.verificationStatus),
    verifiedAt: cleanText(value.verifiedAt),
    caution: cleanText(value.caution),
  };
}

function buildSourceBundleDto(bundle) {
  const value = asObject(bundle) || {};
  return {
    bundleId: cleanText(value.bundleId),
    label: cleanText(value.label),
    sourceIds: Array.isArray(value.sourceIds) ? value.sourceIds.map(cleanText).filter(Boolean) : [],
    sourceRoles: Array.isArray(value.sourceRoles) ? value.sourceRoles.map((role) => ({
      sourceId: cleanText(role && role.sourceId),
      role: cleanText(role && role.role),
    })) : [],
    fitReason: cleanText(value.fitReason),
    caution: cleanText(value.caution),
    estimatedScope: cleanText(value.estimatedScope),
    recommended: Boolean(value.recommended),
  };
}

function buildSourceBoundPlanDto(plan) {
  const value = asObject(plan);
  if (!value) return null;
  return {
    version: toNumber(value.version, 1),
    goalTitle: cleanText(value.goalTitle),
    stageGoals: Array.isArray(value.stageGoals) ? value.stageGoals.map((stage) => ({
      stageId: cleanText(stage && stage.stageId),
      title: cleanText(stage && stage.title),
      description: cleanText(stage && stage.description),
      startDay: toNumber(stage && stage.startDay, 0),
      endDay: toNumber(stage && stage.endDay, 0),
      sourceIds: Array.isArray(stage && stage.sourceIds) ? stage.sourceIds.map(cleanText).filter(Boolean) : [],
    })) : [],
    firstWeek: Array.isArray(value.firstWeek) ? value.firstWeek.map((day) => ({
      day: toNumber(day && day.day, 0),
      coreTask: day && day.coreTask ? {
        title: cleanText(day.coreTask.title),
        detail: cleanText(day.coreTask.detail),
        estimatedMinutes: toNumber(day.coreTask.estimatedMinutes, 0),
        sourceRef: buildSourceRefDto(day.coreTask.sourceRef),
        selectionReason: cleanText(day.coreTask.selectionReason),
      } : null,
      optionalTasks: Array.isArray(day && day.optionalTasks) ? day.optionalTasks.map((task) => ({
        title: cleanText(task && task.title),
        detail: cleanText(task && task.detail),
        estimatedMinutes: toNumber(task && task.estimatedMinutes, 0),
        sourceRef: buildSourceRefDto(task && task.sourceRef),
        selectionReason: cleanText(task && task.selectionReason),
      })) : [],
    })) : [],
    weeklyMilestones: Array.isArray(value.weeklyMilestones) ? value.weeklyMilestones.map((milestone) => ({
      week: toNumber(milestone && milestone.week, 0),
      title: cleanText(milestone && milestone.title),
      outcome: cleanText(milestone && milestone.outcome),
    })) : [],
    totalEstimatedMinutesFirstWeek: toNumber(value.totalEstimatedMinutesFirstWeek, 0),
    generatedAt: cleanText(value.generatedAt),
    source: cleanText(value.source),
    planWarnings: Array.isArray(value.planWarnings) ? value.planWarnings.map(cleanText).filter(Boolean) : [],
  };
}

function buildGoalDraftDto(draft) {
  const value = asObject(draft) || {};
  const profile = asObject(value.goalProfile) || {};
  return {
    draftId: cleanText(value.draftId),
    revision: toNumber(value.revision, 0),
    mode: cleanText(value.mode),
    status: cleanText(value.status),
    goalProfile: {
      roleId: cleanText(profile.roleId),
      name: cleanText(profile.name),
      title: cleanText(profile.title),
      deadline: cleanText(profile.deadline),
      durationDays: toNumber(profile.durationDays, 0),
      dailyTime: cleanText(profile.dailyTime),
      dailyBudgetMinutes: toNumber(profile.dailyBudgetMinutes, 0),
      currentLevel: cleanText(profile.currentLevel),
      sourcePreference: cleanText(profile.sourcePreference),
      accessPreference: cleanText(profile.accessPreference),
    },
    userProvidedSources: Array.isArray(value.userProvidedSources) ? value.userProvidedSources.map(buildLearningSourceDto) : [],
    sourceCandidates: Array.isArray(value.sourceCandidates) ? value.sourceCandidates.map(buildLearningSourceDto) : [],
    sourceBundles: Array.isArray(value.sourceBundles) ? value.sourceBundles.map(buildSourceBundleDto) : [],
    selectedBundleId: cleanText(value.selectedBundleId),
    selectedSourceIds: Array.isArray(value.selectedSourceIds) ? value.selectedSourceIds.map(cleanText).filter(Boolean) : [],
    planDraft: buildSourceBoundPlanDto(value.planDraft),
    planWarnings: Array.isArray(value.planWarnings) ? value.planWarnings.map(cleanText).filter(Boolean) : [],
    searchMode: cleanText(value.searchMode),
    lastAdjustment: cleanText(value.lastAdjustment),
    createdAt: cleanText(value.createdAt),
    updatedAt: cleanText(value.updatedAt),
    expiresAt: cleanText(value.expiresAt),
    confirmedAt: cleanText(value.confirmedAt),
    confirmedGoalId: cleanText(value.confirmedGoalId),
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
    order: toNumber(source.order, 0),
    completedAt: cleanText(source.completedAt),
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
    status: cleanText(source.status) || "ACTIVE",
    stageGoals: Array.isArray(source.stageGoals) ? source.stageGoals.map(buildStageGoalDto) : [],
    clarifyingQuestions: Array.isArray(source.clarifyingQuestions)
      ? source.clarifyingQuestions.map(buildClarifyingQuestionDto)
      : [],
    createdAt: cleanText(source.createdAt),
    updatedAt: cleanText(source.updatedAt),
  };
}

function buildGoalPortfolioDto(portfolio) {
  const source = asObject(portfolio) || {};
  return {
    goals: Array.isArray(source.goals)
      ? source.goals.map((goal) => ({
          goalId: cleanText(goal && goal.goalId),
          title: cleanText(goal && goal.title),
          description: cleanText(goal && goal.description),
          durationDays: toNumber(goal && goal.durationDays, 0),
          completedDays: toNumber(goal && goal.completedDays, 0),
          starsPerDay: toNumber(goal && goal.starsPerDay, 1),
          completedStars: toNumber(goal && goal.completedStars, 0),
          totalStarCount: toNumber(goal && goal.totalStarCount, 0),
          planningVersion: toNumber(goal && goal.planningVersion, 0),
          dailyBudgetMinutes: toNumber(goal && goal.dailyBudgetMinutes, 0),
          originDraftId: cleanText(goal && goal.originDraftId),
          sourcePreferences: asObject(goal && goal.sourcePreferences),
          learningSources: Array.isArray(goal && goal.learningSources) ? goal.learningSources.map(buildLearningSourceDto) : [],
          selectedSourceBundleId: cleanText(goal && goal.selectedSourceBundleId),
          planStatus: cleanText(goal && goal.planStatus),
          planConfirmedAt: cleanText(goal && goal.planConfirmedAt),
          priority: cleanText(goal && goal.priority) || "INACTIVE",
          planningQuality: goal && goal.planningQuality ? {
            score: toNumber(goal.planningQuality.score, 0),
            status: cleanText(goal.planningQuality.status),
            horizonStartDay: toNumber(goal.planningQuality.horizonStartDay, 0),
            horizonEndDay: toNumber(goal.planningQuality.horizonEndDay, 0),
          } : null,
          phases: goal && goal.planningBlueprint && Array.isArray(goal.planningBlueprint.phases)
            ? goal.planningBlueprint.phases.map((phase) => ({
                phaseId: cleanText(phase && phase.phaseId),
                order: toNumber(phase && phase.order, 0),
                title: cleanText(phase && phase.title),
                description: cleanText(phase && phase.description),
                startDay: toNumber(phase && phase.startDay, 0),
                endDay: toNumber(phase && phase.endDay, 0),
              }))
            : [],
          weeklyMilestones: goal && goal.planningBlueprint && Array.isArray(goal.planningBlueprint.weeklyMilestones)
            ? goal.planningBlueprint.weeklyMilestones.map((milestone) => ({
                milestoneId: cleanText(milestone && milestone.milestoneId),
                week: toNumber(milestone && milestone.week, 0),
                startDay: toNumber(milestone && milestone.startDay, 0),
                endDay: toNumber(milestone && milestone.endDay, 0),
                phaseId: cleanText(milestone && milestone.phaseId),
                title: cleanText(milestone && milestone.title),
                focus: cleanText(milestone && milestone.focus),
                outcome: cleanText(milestone && milestone.outcome),
              }))
            : [],
          status: cleanText(goal && goal.status) || "ACTIVE",
          constellationId: cleanText(goal && goal.constellationId),
          constellationName: cleanText(goal && goal.constellationName),
          constellations: Array.isArray(goal && goal.constellations)
            ? goal.constellations.map((map) => ({
                mapId: cleanText(map && map.mapId),
                order: toNumber(map && map.order, 0),
                constellationId: cleanText(map && map.constellationId),
                constellationName: cleanText(map && map.constellationName),
                nodeIds: Array.isArray(map && map.nodeIds) ? [...map.nodeIds] : [],
                starCount: toNumber(map && map.starCount, 0),
                completedStars: toNumber(map && map.completedStars, 0),
                status: cleanText(map && map.status) || "LOCKED",
                completedAt: cleanText(map && map.completedAt),
              }))
            : [],
          startDate: cleanText(goal && goal.startDate),
          lastReleasedDate: cleanText(goal && goal.lastReleasedDate),
          createdAt: cleanText(goal && goal.createdAt),
          completedAt: cleanText(goal && goal.completedAt),
          nodes: Array.isArray(goal && goal.nodes)
            ? goal.nodes.map((node) => ({
                nodeId: cleanText(node && node.nodeId),
                day: toNumber(node && node.day, 0),
                slot: toNumber(node && node.slot, 0),
                title: cleanText(node && node.title),
                detail: cleanText(node && node.detail),
                estimatedMinutes: toNumber(node && node.estimatedMinutes, 25),
                status: cleanText(node && node.status) || "LOCKED",
                releasedDate: cleanText(node && node.releasedDate),
                completedAt: cleanText(node && node.completedAt),
                planningStatus: cleanText(node && node.planningStatus),
                qualityScore: toNumber(node && node.qualityScore, 0),
                taskRole: cleanText(node && node.taskRole),
                taskRoleLabel: cleanText(node && node.taskRoleLabel),
                phaseId: cleanText(node && node.phaseId),
                phaseTitle: cleanText(node && node.phaseTitle),
                weeklyMilestoneId: cleanText(node && node.weeklyMilestoneId),
                weeklyMilestoneTitle: cleanText(node && node.weeklyMilestoneTitle),
                sourceRef: buildSourceRefDto(node && node.sourceRef),
                priorityTier: cleanText(node && node.priorityTier) || "CORE",
                selectionReason: cleanText(node && node.selectionReason),
                legacyNode: Boolean(node && node.legacyNode),
              }))
            : [],
        }))
      : [],
  };
}

function buildDailyPlanDto(dailyPlan) {
  const source = asObject(dailyPlan);
  if (!source) {
    return null;
  }
  const metrics = asObject(source.metrics) || {};
  return {
    id: cleanText(source.id),
    planDate: cleanText(source.planDate),
    goalPlanId: cleanText(source.goalPlanId),
    stageGoalId: cleanText(source.stageGoalId),
    status: cleanText(source.status) || "ACTIVE",
    capacityMinutes: toNumber(source.capacityMinutes, 0),
    taskIds: Array.isArray(source.taskIds) ? [...source.taskIds] : [],
    source: cleanText(source.source),
    version: toNumber(source.version, 1),
    message: cleanText(source.message),
    generatedAt: cleanText(source.generatedAt),
    completedAt: cleanText(source.completedAt),
    metrics: {
      plannedCount: toNumber(metrics.plannedCount, 0),
      completedCount: toNumber(metrics.completedCount, 0),
      plannedMinutes: toNumber(metrics.plannedMinutes, 0),
      completedMinutes: toNumber(metrics.completedMinutes, 0),
    },
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
    charges: toNumber(source.charges, 0),
  };
}

function buildStarMapDto(starMap) {
  const source = asObject(starMap) || {};
  const tools = asObject(source.tools) || {};
  return {
    collections: Array.isArray(source.collections)
      ? source.collections.map((entry) => ({
          constellationId: cleanText(entry && entry.constellationId),
          seriesMapId: cleanText(entry && entry.seriesMapId),
          goalPlanId: cleanText(entry && entry.goalPlanId),
          longTermGoal: cleanText(entry && entry.longTermGoal),
          stageGoalId: cleanText(entry && entry.stageGoalId),
          title: cleanText(entry && entry.title),
          description: cleanText(entry && entry.description),
          completedAt: cleanText(entry && entry.completedAt),
          starCount: toNumber(entry && entry.starCount, 0),
          stars: Array.isArray(entry && entry.stars)
            ? entry.stars.map((star) => ({
                taskId: cleanText(star && star.taskId),
                title: cleanText(star && star.title),
                completedAt: cleanText(star && star.completedAt),
              }))
            : [],
          rewardToolId: cleanText(entry && entry.rewardToolId),
          rewardToolName: cleanText(entry && entry.rewardToolName),
        }))
      : [],
    tools: Object.keys(tools).map((toolId) => ({
      toolId,
      name: cleanText(tools[toolId] && tools[toolId].name),
      icon: cleanText(tools[toolId] && tools[toolId].icon),
      detail: cleanText(tools[toolId] && tools[toolId].detail),
      action: cleanText(tools[toolId] && tools[toolId].action),
      charges: toNumber(tools[toolId] && tools[toolId].charges, 0),
      timesUsed: toNumber(tools[toolId] && tools[toolId].timesUsed, 0),
      obtainedAt: cleanText(tools[toolId] && tools[toolId].obtainedAt),
    })),
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
    action: cleanText(source.action),
    actionPayload: asObject(source.actionPayload),
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
    taskHistory: Array.isArray(source.taskHistory) ? source.taskHistory.map(buildTaskDto) : [],
    goalPlan: buildGoalPlanDto(source.goalPlan),
    goalPortfolio: buildGoalPortfolioDto(source.goalPortfolio),
    dailyPlan: buildDailyPlanDto(source.dailyPlan),
    dailyPlanHistory: Array.isArray(source.dailyPlanHistory)
      ? source.dailyPlanHistory.map(buildDailyPlanDto)
      : [],
    nextSuggestion: cleanText(source.nextSuggestion),
    diary: Array.isArray(source.diary) ? source.diary.map(buildDiaryEntryDto) : [],
    inventory: Array.isArray(source.inventory)
      ? source.inventory.map(buildInventoryItemDto)
      : [],
    starMap: buildStarMapDto(source.starMap),
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
          planDate: cleanText(run.planDate),
          dailyPlanId: cleanText(run.dailyPlanId),
          stageGoalId: cleanText(run.stageGoalId),
          stageTitle: cleanText(run.stageTitle),
          nextStageTitle: cleanText(run.nextStageTitle),
          stageTheme: asObject(run.stageTheme)
            ? {
                id: cleanText(run.stageTheme.id),
                name: cleanText(run.stageTheme.name),
                eventLead: cleanText(run.stageTheme.eventLead),
              }
            : null,
          completionRoute: cleanText(run.completionRoute),
          routeLabel: cleanText(run.routeLabel),
          plannedTaskCount: toNumber(run.plannedTaskCount, 0),
          completedTaskCount: toNumber(run.completedTaskCount, 0),
          rewardEligible: Boolean(run.rewardEligible),
          rewardGranted: Boolean(run.rewardGranted),
          rewardPreview: {
            growth: toNumber(run.rewardPreview && run.rewardPreview.growth, 0),
            resources: toNumber(run.rewardPreview && run.rewardPreview.resources, 0),
          },
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
  buildSourceRefDto,
  buildLearningSourceDto,
  buildSourceBundleDto,
  buildSourceBoundPlanDto,
  buildGoalDraftDto,
};
