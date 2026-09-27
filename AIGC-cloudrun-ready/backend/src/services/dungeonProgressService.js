const DUNGEON_ROUTES = Object.freeze({
  RECOVERY: "RECOVERY",
  PARTIAL_PROGRESS: "PARTIAL_PROGRESS",
  DAILY_CLEAR: "DAILY_CLEAR",
  STAGE_BREAKTHROUGH: "STAGE_BREAKTHROUGH",
});

const ROUTE_LABELS = Object.freeze({
  [DUNGEON_ROUTES.RECOVERY]: "整备路线",
  [DUNGEON_ROUTES.PARTIAL_PROGRESS]: "推进路线",
  [DUNGEON_ROUTES.DAILY_CLEAR]: "今日全清路线",
  [DUNGEON_ROUTES.STAGE_BREAKTHROUGH]: "阶段突破路线",
});

function sanitizeText(value) {
  return String(value || "").trim();
}

function findStage(goalPlan, stageGoalId) {
  if (!goalPlan || !Array.isArray(goalPlan.stageGoals) || !stageGoalId) {
    return null;
  }
  return goalPlan.stageGoals.find((stage) => stage && stage.id === stageGoalId) || null;
}

function resolveStageTheme(stageTitle, goalTitle) {
  const source = `${sanitizeText(stageTitle)} ${sanitizeText(goalTitle)}`;
  if (/多元|偏导|重积分|空间/i.test(source)) {
    return {
      id: "multidimensional-corridor",
      name: "多维回廊",
      eventLead: "多维坐标在脚下展开，今日的学习轨迹化成通往深处的回廊。",
    };
  }
  if (/微分方程|常微分/i.test(source)) {
    return {
      id: "dynamic-core-city",
      name: "动力核心城",
      eventLead: "方程的流向驱动着整座核心城，今日完成的节点正逐一亮起。",
    };
  }
  if (/级数|数列/i.test(source)) {
    return {
      id: "star-sequence-observatory",
      name: "星序观测站",
      eventLead: "无数序列在夜空排列，今日的推进决定观测站能点亮多少星轨。",
    };
  }
  if (/积分/i.test(source)) {
    return {
      id: "integral-river",
      name: "积分之河",
      eventLead: "连续的微小积累汇成河流，今日的学习成果正改变水道的走向。",
    };
  }
  if (/导数|微分|中值/i.test(source)) {
    return {
      id: "instant-change-tower",
      name: "瞬变机关塔",
      eventLead: "机关随变化率不断转动，今日掌握的线索化成攀登高塔的齿轮。",
    };
  }
  if (/函数|极限|连续/i.test(source)) {
    return {
      id: "infinite-mist-frontier",
      name: "无穷迷雾边境",
      eventLead: "函数曲线穿过无穷迷雾，今日完成的节点化成一盏盏引路灯。",
    };
  }

  const name = sanitizeText(stageTitle) || "当前阶段";
  return {
    id: "stage-reflection",
    name: `${name} · 夜幕映界`,
    eventLead: `围绕「${name}」的今日推进化成夜幕中的道路。`,
  };
}

function collectDailyMainTasks(state) {
  const dailyPlan = state && state.dailyPlan;
  if (!dailyPlan || !Array.isArray(state.tasks)) {
    return [];
  }
  const taskIds = new Set(Array.isArray(dailyPlan.taskIds) ? dailyPlan.taskIds : []);
  return state.tasks.filter((task) => {
    if (!task || (task.source !== "STAGE" && !(task.type === "main" && task.priorityTier === "CORE"))) {
      return false;
    }
    return task.dailyPlanId === dailyPlan.id || taskIds.has(task.id);
  });
}

function buildDungeonLearningContext(state) {
  const dailyPlan = state && state.dailyPlan;
  const goalPlan = state && state.goalPlan;
  const mainTasks = collectDailyMainTasks(state);
  const completedTasks = mainTasks.filter((task) => Boolean(task.done));
  const stageGoalId = dailyPlan && dailyPlan.stageGoalId;
  const stage = findStage(goalPlan, stageGoalId);
  const currentStage = findStage(goalPlan, goalPlan && goalPlan.currentStageId);
  const stageAdvancedToday = Boolean(
    stage &&
      String(stage.status || "").toUpperCase() === "DONE" &&
      (!goalPlan.currentStageId || goalPlan.currentStageId !== stage.id)
  );

  let route = DUNGEON_ROUTES.RECOVERY;
  if (stageAdvancedToday) {
    route = DUNGEON_ROUTES.STAGE_BREAKTHROUGH;
  } else if (mainTasks.length > 0 && completedTasks.length === mainTasks.length) {
    route = DUNGEON_ROUTES.DAILY_CLEAR;
  } else if (completedTasks.length > 0) {
    route = DUNGEON_ROUTES.PARTIAL_PROGRESS;
  }

  const stageTitle = sanitizeText(stage && stage.title) || sanitizeText(currentStage && currentStage.title) || "当前阶段";
  return {
    planDate: sanitizeText(dailyPlan && dailyPlan.planDate),
    dailyPlanId: sanitizeText(dailyPlan && dailyPlan.id),
    stageGoalId: sanitizeText(stageGoalId || (currentStage && currentStage.id)),
    stageTitle,
    nextStageTitle: stageAdvancedToday ? sanitizeText(currentStage && currentStage.title) : "",
    goalTitle: sanitizeText(goalPlan && (goalPlan.longTermGoal || goalPlan.title)),
    route,
    routeLabel: ROUTE_LABELS[route],
    stageAdvancedToday,
    plannedTaskCount: mainTasks.length,
    completedTaskCount: completedTasks.length,
    completedTaskIds: completedTasks.map((task) => task.id),
    completedTaskTitles: completedTasks.map((task) => sanitizeText(task.title)).filter(Boolean),
    stageTheme: resolveStageTheme(stageTitle, goalPlan && (goalPlan.longTermGoal || goalPlan.title)),
  };
}

function calculateDungeonReward(context) {
  const completedTaskCount = Math.max(0, Number(context && context.completedTaskCount) || 0);
  const route = context && context.route;
  const cleared = route === DUNGEON_ROUTES.DAILY_CLEAR || route === DUNGEON_ROUTES.STAGE_BREAKTHROUGH;
  return {
    growth: route === DUNGEON_ROUTES.STAGE_BREAKTHROUGH ? 15 : 0,
    resources: completedTaskCount * 4 + (cleared ? 8 : 0),
  };
}

module.exports = {
  DUNGEON_ROUTES,
  ROUTE_LABELS,
  resolveStageTheme,
  buildDungeonLearningContext,
  calculateDungeonReward,
};
