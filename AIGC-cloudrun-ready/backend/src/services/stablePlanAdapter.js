// Reuse the stage + rolling-task generator from commit 63ffb9c.
const { generateGoalPlan, generateRollingTaskPlan } = require('./goalPlanningService');
const { AppError } = require('../lib/errors');

async function generateStablePlan(context, options) {
  const profile = context.goalProfile || {};
  const durationDays = Math.max(1, Number(profile.durationDays) || 30);
  const dailyMinutes = Math.max(25, Number(profile.dailyBudgetMinutes) || 120);
  const sources = (context.sources || []).filter(source => (context.selectedSourceIds || []).includes(source.sourceId));
  const answers = [
    { question: '计划持续多久？', answer: `${durationDays} 天` },
    { question: '每天投入多久？', answer: `${dailyMinutes} 分钟` },
    { question: '当前基础？', answer: profile.currentLevel || '未提供' },
    { question: '补充要求？', answer: context.adjustment || '' },
    { question: '已选择的参考资料？', answer: sources.map(source => source.title).join('；') || '未绑定资料，不虚构教材或章节' },
  ];
  const stages = await generateGoalPlan(profile.title, answers, options);
  const rolling = await generateRollingTaskPlan({
    goalText: profile.title,
    durationDays,
    startDay: 1,
    dayCount: Math.min(7, durationDays),
    dailyMinutes,
    phases: stages.stageGoals.map(stage => ({
      title: stage.title,
      description: stage.description,
      tasks: stage.tasks.map(task => ({ title: task.title, description: task.description })),
    })),
    recentExecution: [],
  }, options);
  if (!rolling) throw new AppError('PLAN_AI_UNAVAILABLE', '任务生成暂时失败，请重试；你的目标和资料已保留', 503);
  // Old tasks do not claim chapter locators. Keep references at the selected source URL.
  const primary = sources[0];
  const sourceRef = primary ? { sourceId: primary.sourceId, locatorType: 'URL', locatorLabel: primary.title, locatorUrl: primary.url } : null;
  const mapTask = task => ({ ...task, sourceRef });
  return {
    goalTitle: profile.title,
    stageGoals: stages.stageGoals.map((stage, index, all) => ({
      stageId: `stage-${index + 1}`, title: stage.title, description: stage.description,
      startDay: Math.min(durationDays, Math.floor(index * durationDays / all.length) + 1),
      endDay: Math.max(1, Math.floor((index + 1) * durationDays / all.length)),
      sourceIds: sources.map(source => source.sourceId),
    })),
    firstWeek: rolling.days.map(day => ({ day: day.day, mainTasks: day.mainTasks.map(mapTask), sideTasks: day.sideTasks.map(mapTask) })),
    weeklyMilestones: [{ week: 1, title: stages.stageGoals[0].title, outcome: stages.stageGoals[0].description }],
    source: 'llm',
    generator: 'stable-63ffb9c',
  };
}

module.exports = { generateStablePlan };
