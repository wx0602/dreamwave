const PLANNING_VERSION = 5;
const ROLLING_HORIZON_DAYS = 7;
const CORE_TASKS_PER_DAY = 3;
const OPTIONAL_TASKS_PER_DAY = 2;

const MAIN_ROLES = Object.freeze([
  { id: "LEARN", label: "学习输入" },
  { id: "PRACTICE", label: "练习执行" },
  { id: "VERIFY", label: "输出验证" },
]);

const ACTION_PATTERN = /背诵|精听|写|列出|检查|梳理|阅读|理解|整理|完成|练习|执行|制作|实现|输出|验证|测试|复述|记录|对照|提交|订正|跑|训练/;
const SPECIFICITY_PATTERN = /\d|一|两|三|四|五|六|七|八|九|十|个|篇|组|页|题|段|次|份|分钟|小时|公里|字|章节|材料|文件|真题/;

function text(value, fallback = "") {
  const result = String(value || "").trim();
  return result || fallback;
}

function clamp(value, minimum, maximum, fallback = minimum) {
  const parsed = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(parsed) ? parsed : fallback));
}

function buildPlanningBlueprint({ goalTitle, durationDays, plan }) {
  const title = text(goalTitle, "未命名目标");
  const days = clamp(durationDays, 1, 365);
  const sourceStages = plan && Array.isArray(plan.stageGoals) ? plan.stageGoals.filter(Boolean) : [];
  const fallbackStages = [
    { title: "建立基础", description: "确认范围、材料和执行方法。", tasks: [{ title: "列出所需材料" }, { title: "完成基础练习" }] },
    { title: "稳定推进", description: "练习关键能力，保存每天的结果。", tasks: [{ title: "完成核心练习" }, { title: "处理一个典型问题" }] },
    { title: "综合验证", description: "检查结果，修补具体问题。", tasks: [{ title: "完成综合测试" }, { title: "订正薄弱环节" }] },
  ];
  const stages = sourceStages.length >= 2 ? sourceStages : fallbackStages;
  const phases = stages.map((stage, index) => {
    const startDay = Math.floor(index * days / stages.length) + 1;
    const endDay = index === stages.length - 1 ? days : Math.floor((index + 1) * days / stages.length);
    const focusItems = (Array.isArray(stage.tasks) ? stage.tasks : [])
      .map((task) => ({
        title: text(task && task.title),
        detail: text(task && (task.description || task.detail)),
      }))
      .filter((item) => item.title);
    return {
      phaseId: `phase-${index + 1}`,
      order: index + 1,
      title: text(stage.title, `阶段 ${index + 1}`),
      description: text(stage.description, `推进「${title}」的第 ${index + 1} 个阶段。`),
      startDay,
      endDay,
      focusItems: focusItems.length ? focusItems : [{ title: text(stage.title, title), detail: text(stage.description) }],
    };
  });
  const weekCount = Math.ceil(days / 7);
  const weeklyMilestones = Array.from({ length: weekCount }, (_, index) => {
    const startDay = index * 7 + 1;
    const endDay = Math.min(days, startDay + 6);
    const phase = phases.find((item) => startDay <= item.endDay && endDay >= item.startDay) || phases[phases.length - 1];
    const midpoint = Math.max(phase.startDay, Math.min(phase.endDay, Math.floor((startDay + endDay) / 2)));
    const phaseDuration = Math.max(1, phase.endDay - phase.startDay + 1);
    const focusIndex = Math.min(
      phase.focusItems.length - 1,
      Math.floor((midpoint - phase.startDay) * phase.focusItems.length / phaseDuration)
    );
    const focus = phase.focusItems[focusIndex];
    return {
      milestoneId: `week-${index + 1}`,
      week: index + 1,
      startDay,
      endDay,
      phaseId: phase.phaseId,
      title: `第 ${index + 1} 周 · ${phase.title}`,
      focus: focus.title,
      outcome: `完成「${focus.title}」`,
    };
  });
  const firstWeek = plan && Array.isArray(plan.firstWeek) ? plan.firstWeek.map((entry) => ({ ...entry })) : [];
  const rollingDays = plan && plan.rollingTaskPlan && Array.isArray(plan.rollingTaskPlan.days)
    ? plan.rollingTaskPlan.days.map((day) => ({ ...day }))
    : [];
  return { version: PLANNING_VERSION, goalTitle: title, durationDays: days, phases, weeklyMilestones, firstWeek, rollingDays };
}

function findContext(goal, day) {
  const blueprint = goal.planningBlueprint;
  const milestone = blueprint.weeklyMilestones.find((item) => day >= item.startDay && day <= item.endDay)
    || blueprint.weeklyMilestones[blueprint.weeklyMilestones.length - 1];
  const phase = blueprint.phases.find((item) => item.phaseId === milestone.phaseId)
    || blueprint.phases.find((item) => day >= item.startDay && day <= item.endDay)
    || blueprint.phases[blueprint.phases.length - 1];
  const phaseDay = Math.max(0, day - phase.startDay);
  const phaseDuration = Math.max(1, phase.endDay - phase.startDay + 1);
  const focusIndex = Math.min(
    phase.focusItems.length - 1,
    Math.floor(phaseDay * phase.focusItems.length / phaseDuration)
  );
  const focusStartOffset = Math.floor(focusIndex * phaseDuration / phase.focusItems.length);
  const focusRound = phaseDay - focusStartOffset + 1;
  const focus = phase.focusItems[focusIndex];
  return { milestone, phase, focus, phaseDay, focusRound };
}

function allocateMinutes(dailyBudgetMinutes) {
  const budget = clamp(dailyBudgetMinutes, 25, 480);
  const optionalEach = Math.max(5, Math.floor(budget * 0.15));
  const mainBudget = Math.max(15, budget - optionalEach * OPTIONAL_TASKS_PER_DAY);
  const base = Math.max(5, Math.floor(mainBudget / CORE_TASKS_PER_DAY));
  return {
    optionalEach,
    main: [base, base, Math.max(5, mainBudget - base * 2)],
    mainBudget,
    totalBudget: budget,
  };
}

function withContext(tasks, goal, day, context) {
  return tasks.map((task, index) => ({
    ...task,
    day,
    slot: index + 1,
    phaseId: context.phase.phaseId,
    phaseTitle: context.phase.title,
    weeklyMilestoneId: context.milestone.milestoneId,
    weeklyMilestoneTitle: context.milestone.title,
  }));
}

function actionableTitle(value, fallback) {
  const title = text(value, fallback).replace(/^第\s*\d+\s*天\s*[·:：-]?\s*/, "").replace(/^主线\s*\d*\s*[·:：-]?\s*/, "").replace(/^支线\s*[·:：-]?\s*/, "");
  return ACTION_PATTERN.test(title) ? title : `完成「${title}」`;
}

function createConcreteDomainTasks(goal, day, context, minutes) {
  const defaultSource = Array.isArray(goal.learningSources) ? goal.learningSources[0] : null;
  const defaultSourceRef = defaultSource ? {
    sourceId: defaultSource.sourceId,
    sourceTitle: defaultSource.title,
    locatorType: "URL",
    locatorLabel: defaultSource.title,
    locatorUrl: defaultSource.url || "",
    verified: false,
  } : null;
  const firstWeek = goal.planningBlueprint && Array.isArray(goal.planningBlueprint.firstWeek)
    ? goal.planningBlueprint.firstWeek.find((entry) => Number(entry.day) === Number(day))
    : null;
  const aiDay = goal.planningBlueprint && Array.isArray(goal.planningBlueprint.rollingDays)
    ? goal.planningBlueprint.rollingDays.find((entry) => Number(entry.day) === Number(day))
    : null;
  const items = context.phase.focusItems;
  const phaseOffset = Math.max(0, day - context.phase.startDay) * CORE_TASKS_PER_DAY;
  const suppliedTasks = firstWeek
    ? (Array.isArray(firstWeek.mainTasks) ? firstWeek.mainTasks : firstWeek.coreTask ? [firstWeek.coreTask] : [])
    : aiDay
      ? (Array.isArray(aiDay.mainTasks) ? aiDay.mainTasks : aiDay.coreTask ? [aiDay.coreTask] : [])
      : [];
  const titles = (item) => [
    `列出「${item.title}」的 3 个学习要点`,
    `完成 1 项「${item.title}」练习或操作`,
    `检查「${item.title}」的结果并记录 1 个问题`,
  ];
  return withContext(MAIN_ROLES.map((role, index) => {
    const raw = suppliedTasks[index] || {};
    const item = items[Math.min(items.length - 1, phaseOffset + index)] || context.focus;
    return {
      role: role.id,
      roleLabel: role.label,
      title: actionableTitle(raw.title, titles(item)[index]),
      detail: text(raw.detail || raw.description, `${text(item.detail, "按要求完成具体操作")}；保存笔记、答案、文件或一个未解决问题。`),
      estimatedMinutes: clamp(raw.estimatedMinutes, 5, 90, minutes.main[index]),
      sourceRef: raw.sourceRef || defaultSourceRef,
      selectionReason: text(raw.selectionReason, `作为今天的${role.label}环节，与另外两条主线形成完整推进。`),
    };
  }), goal, day, context);
}

function createDayTaskSet(goal, day) {
  const context = findContext(goal, day);
  const minutes = allocateMinutes(goal.dailyBudgetMinutes);
  return createConcreteDomainTasks(goal, day, context, minutes);
}

function normalizedFingerprint(value) {
  return text(value).replace(/第\s*\d+\s*(天|轮|周)?/g, "").replace(/[「」\s·：:，,。]/g, "");
}

function validateDayTaskSet(goal, tasks) {
  const issues = [];
  const roles = new Set(tasks.map((task) => task.role));
  if (tasks.length !== CORE_TASKS_PER_DAY) issues.push("CORE_TASK_COUNT");
  if (MAIN_ROLES.some((role) => !roles.has(role.id))) issues.push("ROLE_COVERAGE");
  if (tasks.some((task) => !ACTION_PATTERN.test(text(task.title)))) issues.push("MISSING_ACTION");
  if (tasks.some((task) => !SPECIFICITY_PATTERN.test(`${text(task.title)} ${text(task.detail)}`))) issues.push("LOW_SPECIFICITY");
  if (tasks.some((task) => !text(task.phaseId) || !text(task.weeklyMilestoneId))) issues.push("LOW_RELEVANCE");
  if (tasks.some((task) => Number(task.estimatedMinutes) < 5 || Number(task.estimatedMinutes) > 90)) issues.push("INVALID_DURATION");
  const fingerprints = tasks.map((task) => normalizedFingerprint(task.title));
  if (new Set(fingerprints).size !== fingerprints.length) issues.push("DUPLICATE_TASK");
  const mainBudget = allocateMinutes(goal.dailyBudgetMinutes).totalBudget;
  if (tasks.reduce((sum, task) => sum + Number(task.estimatedMinutes || 0), 0) > mainBudget) issues.push("OVER_BUDGET");
  if (Array.isArray(goal.learningSources) && goal.learningSources.length > 0
    && tasks.some((task) => !task.sourceRef || !task.sourceRef.sourceId)) issues.push("MISSING_SOURCE_REF");
  return { valid: issues.length === 0, score: Math.max(0, 100 - issues.length * 15), issues };
}

function repairDayTaskSet(goal, day, tasks) {
  let result = Array.isArray(tasks) ? tasks.map((task) => ({ ...task })) : [];
  let quality = validateDayTaskSet(goal, result);
  let attempts = 0;
  while (!quality.valid && attempts < 2) {
    result = createDayTaskSet(goal, day);
    quality = validateDayTaskSet(goal, result);
    attempts += 1;
  }
  return { tasks: result, quality: { ...quality, repairAttempts: attempts } };
}

function planRollingHorizon(goal, fromDay, horizonDays = ROLLING_HORIZON_DAYS, overwriteAvailable = false) {
  const startDay = clamp(fromDay, 1, goal.durationDays);
  const endDay = Math.min(goal.durationDays, startDay + horizonDays - 1);
  const checks = [];
  for (let day = startDay; day <= endDay; day += 1) {
    let nodes = (goal.nodes || []).filter((node) => Number(node.day) === day).sort((a, b) => a.slot - b.slot);
    if (nodes.length < CORE_TASKS_PER_DAY) {
      const existingSlots = new Set(nodes.map((node) => Number(node.slot)));
      for (let slot = 1; slot <= CORE_TASKS_PER_DAY; slot += 1) {
        if (existingSlots.has(slot)) continue;
        const node = {
          nodeId: `${goal.goalId}-core-${day}-${slot}`,
          day,
          slot,
          status: "LOCKED",
          releasedDate: null,
          completedAt: null,
        };
        goal.nodes.push(node);
        nodes.push(node);
      }
      nodes.sort((left, right) => left.slot - right.slot);
    }
    if (nodes.length !== CORE_TASKS_PER_DAY || (!overwriteAvailable && nodes.every((node) => node.planningStatus === "PLANNED"))) continue;
    const repaired = repairDayTaskSet(goal, day, createDayTaskSet(goal, day));
    repaired.tasks.forEach((task, index) => {
      const node = nodes[index];
      if (!node || (node.status !== "LOCKED" && !(overwriteAvailable && node.status === "AVAILABLE"))) return;
      node.title = `第 ${day} 天：${task.title}`;
      node.detail = task.detail;
      node.estimatedMinutes = task.estimatedMinutes;
      node.planningStatus = "PLANNED";
      node.qualityScore = repaired.quality.score;
      node.qualityIssues = [...repaired.quality.issues];
      node.taskRole = task.role;
      node.taskRoleLabel = task.roleLabel;
      node.phaseId = task.phaseId;
      node.phaseTitle = task.phaseTitle;
      node.weeklyMilestoneId = task.weeklyMilestoneId;
      node.weeklyMilestoneTitle = task.weeklyMilestoneTitle;
      node.sourceRef = task.sourceRef || null;
      node.priorityTier = "CORE";
      node.selectionReason = task.selectionReason || "按已确认计划推进。";
    });
    checks.push({ day, ...repaired.quality });
  }
  const planned = (goal.nodes || []).filter((node) => node.planningStatus === "PLANNED" && (node.status === "LOCKED" || node.status === "AVAILABLE"));
  const scores = planned.map((node) => Number(node.qualityScore || 0)).filter(Boolean);
  goal.planningQuality = {
    score: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
    status: scores.length
      && scores.every((score) => score >= 85)
      && planned.every((node) => !Array.isArray(node.qualityIssues) || node.qualityIssues.length === 0)
      ? "PASSED"
      : "NEEDS_REVIEW",
    checkedDays: checks.length,
    horizonStartDay: startDay,
    horizonEndDay: endDay,
    checkedAt: new Date().toISOString(),
  };
  goal.plannedThroughDay = Math.max(Number(goal.plannedThroughDay || 0), endDay);
  return checks;
}

function initializeGoalPlanning(goal, plan, dailyBudgetMinutes) {
  goal.planningVersion = PLANNING_VERSION;
  goal.dailyBudgetMinutes = clamp(dailyBudgetMinutes, 25, 480);
  goal.planningBlueprint = buildPlanningBlueprint({ goalTitle: goal.title, durationDays: goal.durationDays, plan });
  const existingNodes = Array.isArray(goal.nodes) ? goal.nodes : [];
  const firstAvailable = existingNodes.find((node) => node.status === "AVAILABLE");
  const firstLegacyLocked = existingNodes.find((node) => node.status === "LOCKED");
  const preserved = existingNodes.filter((node) => node.status !== "LOCKED");
  goal.nodes = preserved;
  const nextDay = firstAvailable
    ? Number(firstAvailable.day)
    : firstLegacyLocked
      ? Number(firstLegacyLocked.day)
      : Math.min(Number(goal.durationDays), Math.max(1, Number(goal.completedDays || 0) + 1));
  for (let day = 1; day < nextDay; day += 1) {
    const existingSlots = new Set(goal.nodes.filter((node) => Number(node.day) === day).map((node) => Number(node.slot) || 1));
    for (let slot = 1; slot <= CORE_TASKS_PER_DAY; slot += 1) {
      if (existingSlots.has(slot)) continue;
      goal.nodes.push({
        nodeId: `${goal.goalId}-core-${day}-${slot}`,
        day,
        slot,
        status: "MISSED",
        releasedDate: null,
        completedAt: null,
        missedAt: new Date().toISOString(),
        planningStatus: "LEGACY_MISSED",
        qualityScore: 0,
        taskRole: MAIN_ROLES[slot - 1].id,
        taskRoleLabel: MAIN_ROLES[slot - 1].label,
        priorityTier: "CORE",
        sourceRef: null,
        selectionReason: "旧版每日计划迁移时补齐的历史星位。",
        title: `第 ${day} 天：旧版计划未记录的主线 ${slot}`,
        detail: "此星位用于兼容新版每天三个主线的星图结构。",
        estimatedMinutes: 0,
      });
    }
  }
  goal.plannedThroughDay = Math.max(0, ...goal.nodes.map((node) => Number(node.day) || 0));
  if (nextDay <= Number(goal.durationDays)) planRollingHorizon(goal, nextDay, ROLLING_HORIZON_DAYS, true);
  goal.nodes.sort((left, right) => Number(left.day || 0) - Number(right.day || 0) || Number(left.slot || 0) - Number(right.slot || 0));
  return goal;
}

function ensureGoalPlanning(goal, plan, dailyBudgetMinutes) {
  if (!goal || !Array.isArray(goal.nodes)) return false;
  let changed = false;
  if (Number(goal.planningVersion) !== PLANNING_VERSION || !goal.planningBlueprint) {
    initializeGoalPlanning(goal, plan, dailyBudgetMinutes);
    changed = true;
  }
  const firstAvailable = goal.nodes.find((node) => node.status === "AVAILABLE");
  const firstLocked = goal.nodes.find((node) => node.status === "LOCKED");
  const horizonStart = firstAvailable || firstLocked;
  if (horizonStart) {
    const before = goal.nodes.filter((node) => node.planningStatus === "PLANNED").length;
    planRollingHorizon(goal, horizonStart.day);
    changed = changed || before !== goal.nodes.filter((node) => node.planningStatus === "PLANNED").length;
  }
  return changed;
}

function applyRollingTaskPlan(goal, rollingTaskPlan, overwriteAvailable = false) {
  if (!goal || !goal.planningBlueprint || !rollingTaskPlan || !Array.isArray(rollingTaskPlan.days)) return false;
  const byDay = new Map((goal.planningBlueprint.rollingDays || []).map((entry) => [Number(entry.day), entry]));
  rollingTaskPlan.days.forEach((entry) => byDay.set(Number(entry.day), { ...entry }));
  goal.planningBlueprint.rollingDays = [...byDay.values()].sort((left, right) => left.day - right.day);
  const days = new Set(rollingTaskPlan.days.map((entry) => Number(entry.day)));
  (goal.nodes || []).forEach((node) => {
    if (!days.has(Number(node.day))) return;
    if (node.status === "LOCKED" || (overwriteAvailable && node.status === "AVAILABLE")) {
      node.planningStatus = "REPLAN";
    }
  });
  const startDay = Math.min(...days);
  planRollingHorizon(goal, startDay, Math.max(...days) - startDay + 1, overwriteAvailable);
  return true;
}

function buildSideTasks(goal, day) {
  const { focus } = findContext(goal, day);
  const minutes = allocateMinutes(goal.dailyBudgetMinutes);
  const firstWeek = goal.planningBlueprint && Array.isArray(goal.planningBlueprint.firstWeek)
    ? goal.planningBlueprint.firstWeek.find((entry) => Number(entry.day) === Number(day))
    : null;
  const firstWeekSideTasks = firstWeek && (Array.isArray(firstWeek.sideTasks)
    ? firstWeek.sideTasks : Array.isArray(firstWeek.optionalTasks) ? firstWeek.optionalTasks : []);
  if (firstWeekSideTasks && firstWeekSideTasks.length) {
    return firstWeekSideTasks.slice(0, OPTIONAL_TASKS_PER_DAY).map((task, index) => ({
      title: `第 ${day} 天：${actionableTitle(task.title, `可选行动 ${index + 1}`)}`,
      detail: text(task.detail),
      estimatedMinutes: clamp(task.estimatedMinutes, 5, 45),
      taskRole: "OPTIONAL",
      sourceRef: task.sourceRef || null,
      selectionReason: text(task.selectionReason),
    }));
  }
  const aiDay = goal.planningBlueprint && Array.isArray(goal.planningBlueprint.rollingDays)
    ? goal.planningBlueprint.rollingDays.find((entry) => Number(entry.day) === Number(day))
    : null;
  const optionalTasks = aiDay && Array.isArray(aiDay.optionalTasks)
    ? aiDay.optionalTasks
    : aiDay && Array.isArray(aiDay.sideTasks) ? aiDay.sideTasks : [];
  if (optionalTasks.length > 0) {
    return optionalTasks.slice(0, OPTIONAL_TASKS_PER_DAY).map((task, index) => ({
      title: `第 ${day} 天：${actionableTitle(task.title, `辅助任务 ${index + 1}`)}`,
      detail: text(task.detail),
      estimatedMinutes: clamp(task.estimatedMinutes, 5, 30),
      taskRole: index === 0 ? "ORGANIZE" : "REFLECT",
      sourceRef: task.sourceRef || null,
      selectionReason: text(task.selectionReason),
    }));
  }
  return [
    {
      title: `第 ${day} 天：整理「${focus.title}」的完成结果`,
      detail: `用 ${minutes.optionalEach} 分钟归档今天的笔记、答案或作品。`,
      estimatedMinutes: minutes.optionalEach,
      taskRole: "ORGANIZE",
    },
    {
      title: `第 ${day} 天：写下明天的第一个具体动作`,
      detail: `用 ${minutes.optionalEach} 分钟写下一个未解决问题和明天开始后的第一个动作。`,
      estimatedMinutes: minutes.optionalEach,
      taskRole: "REFLECT",
    },
  ];
}

module.exports = {
  PLANNING_VERSION,
  ROLLING_HORIZON_DAYS,
  CORE_TASKS_PER_DAY,
  OPTIONAL_TASKS_PER_DAY,
  MAIN_ROLES,
  buildPlanningBlueprint,
  createDayTaskSet,
  validateDayTaskSet,
  repairDayTaskSet,
  initializeGoalPlanning,
  ensureGoalPlanning,
  planRollingHorizon,
  applyRollingTaskPlan,
  buildSideTasks,
};
