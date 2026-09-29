const STAR_TOOLS = Object.freeze([
  {
    id: "focus-cloak",
    name: "专注披风",
    icon: "◐",
    action: "FOCUS",
    detail: "为一个未完成任务开启 25 分钟专注模式。",
  },
  {
    id: "insight-scroll",
    name: "洞察卷轴",
    icon: "◇",
    action: "SPLIT",
    detail: "把一个困难任务拆成三个可执行步骤。",
  },
  {
    id: "memory-sigil",
    name: "记忆符印",
    icon: "✦",
    action: "REVIEW",
    detail: "为一个已完成任务安排第 1、3、7 天间隔复习。",
  },
  {
    id: "review-mirror",
    name: "回溯之镜",
    icon: "◎",
    action: "REFLECT",
    detail: "从一项完成记录生成错题或复盘任务。",
  },
  {
    id: "guardian-contract",
    name: "守护契约",
    icon: "⬡",
    action: "FALLBACK",
    detail: "为一个难以继续的任务生成 5 分钟保底版本。",
  },
]);

function getStarTool(toolId) {
  return STAR_TOOLS.find((tool) => tool.id === toolId) || null;
}

function getConstellationReward(collectedCount = 0) {
  const index = Math.max(0, Number(collectedCount) || 0);
  return STAR_TOOLS[index % STAR_TOOLS.length];
}

module.exports = {
  STAR_TOOLS,
  getStarTool,
  getConstellationReward,
};
