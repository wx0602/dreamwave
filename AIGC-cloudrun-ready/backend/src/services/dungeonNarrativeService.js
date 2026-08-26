const { jsonCompletion } = require("./deepseekService");

function sanitizeText(value, maxLength = 1200) {
  return String(value || "").trim().slice(0, maxLength);
}

function buildFallbackNarrative(context) {
  const completedTasks = Array.isArray(context.completedTaskTitles)
    ? context.completedTaskTitles.filter(Boolean).slice(0, 5)
    : [];
  const taskText = completedTasks.length > 0
    ? `你带着「${completedTasks.join("」「")}」留下的光痕穿过此地。`
    : "今天没有可带入战场的主线成果，但你仍完成了一次整备与回望。";
  const nextStageText = context.nextStageTitle
    ? `远处已经显出下一阶段「${context.nextStageTitle}」的入口。`
    : "道路在夜色中暂时收束，等待下一次推进。";
  return {
    title: sanitizeText(context.endingTitle || `${context.stageThemeName}归档`, 80),
    storyText: `${sanitizeText(context.endingStory)}\n\n${taskText}${sanitizeText(context.routeLabel)}在此闭合。${nextStageText}`,
    memorySummary: `${sanitizeText(context.stageTitle)}完成${Number(context.completedTaskCount || 0)}项今日主线，并以${sanitizeText(context.routeLabel)}完成副本归档。`,
    source: "fallback",
  };
}

async function generateDungeonSettlementNarrative(context, options = {}) {
  const fallback = buildFallbackNarrative(context);
  try {
    const result = await jsonCompletion(
      [
        {
          role: "system",
          content: [
            "你是自律成长游戏的副本叙事编剧。",
            "把用户当天真实完成的学习任务映射成简洁、有画面感的副本结局。",
            "只描述完成与推进，不评价掌握程度、正确率、质量或学习能力。",
            "不得新增、修改或暗示任何数值奖励、连续天数、任务状态和阶段状态。",
            "仅输出 JSON：title、storyText、memorySummary。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            longTermGoal: context.goalTitle,
            stage: context.stageTitle,
            nextStage: context.nextStageTitle,
            theme: context.stageThemeName,
            route: context.routeLabel,
            completedTasks: context.completedTaskTitles,
            completedTaskCount: context.completedTaskCount,
            staticEnding: context.endingStory,
            choices: context.routeRecap,
          }),
        },
      ],
      {
        apiKey: options.apiKey,
        temperature: 0.75,
        maxTokens: 700,
      }
    );
    if (!result || !sanitizeText(result.storyText)) {
      return fallback;
    }
    return {
      title: sanitizeText(result.title, 80) || fallback.title,
      storyText: sanitizeText(result.storyText, 1600),
      memorySummary: sanitizeText(result.memorySummary, 220) || fallback.memorySummary,
      source: "ai",
    };
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  generateDungeonSettlementNarrative,
};
