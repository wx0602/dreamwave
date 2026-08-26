const { jsonCompletion } = require("./deepseekService");
const { buildStoryAssetPrompt } = require("../constants/storyAssets");

function formatTitles(titles = []) {
  return titles.length > 0
    ? titles.map((title) => `${title.name}${title.description ? `(${title.description})` : ""}`).join("、")
    : "无";
}

function formatWorldEntities(entities = []) {
  return entities.length > 0
    ? entities
        .map((entity) => `${entity.name}[${entity.type}/${entity.status || "active"}]`)
        .join("、")
    : "无";
}

function formatSeasonDigests(seasonDigests = []) {
  return seasonDigests.length > 0
    ? seasonDigests
        .map((season, index) => `${index + 1}. ${season.goal}：${season.seasonDigest || "暂无摘要"}`)
        .join("\n")
    : "无";
}

function buildFallbackBlueprint({ role, profile, chapterTitle, storyAsset }) {
  return {
    chapterTitle: chapterTitle || role.chapter,
    mainlineSummary: `围绕“${profile.goal}”展开主线。你将在 ${chapterTitle || role.chapter} 中按阶段依次完成长期路线上的行动任务。`,
    openingStory: `${role.agentName} 已接管本阶段档案。${storyAsset && storyAsset.name ? `「${storyAsset.name}」成为本章的初始意象。` : ""}你的目标“${profile.goal}”会被拆解成更小、更科学的行动单元，并逐步转写成一段魔幻冒险。`,
    tasks: [],
    source: "fallback",
  };
}

async function generateGoalBlueprint({
  role,
  profile,
  currentChapter,
  apiKey,
  previousGoal,
  characterArc,
  permanentTitles = [],
  worldEntities = [],
  seasonDigests = [],
  storyAsset,
}) {
  const fallback = buildFallbackBlueprint({
    role,
    profile,
    chapterTitle: currentChapter || role.chapter,
    storyAsset,
  });
  const storyAssetPrompt = buildStoryAssetPrompt(storyAsset);

  const prompt = `请为一个长期学习目标生成带魔幻冒险感的轻量主线开场。目标拆解和每日任务由独立规划器负责，你只负责章节标题与叙事，不要生成或评价学习任务。

必须返回 JSON，格式如下：
{
  "chapterTitle": "字符串",
  "mainlineSummary": "字符串，80字以内",
  "openingStory": "字符串，80-140字"
}

约束：
1. 故事风格必须贴合角色设定，带一点魔幻、冒险、成长感。
2. openingStory 需要自然承接本次视觉素材，不要写成图片说明。
3. 不要输出 tasks，不要判断正确率或掌握度。
4. 不要输出解释文字，只输出 JSON。`;

  try {
    const result = await jsonCompletion(
      [
        {
          role: "system",
          content: `${prompt}

以下是角色 Front-matter 中定义的系统 Prompt，请据此保持叙事口径一致：

${role.systemPrompt}${storyAssetPrompt ? `\n\n${storyAssetPrompt}` : ""}`,
        },
        {
          role: "user",
          content: `角色：${role.name}
叙事风格：${role.tone}
表达风格：${role.speechStyle}
角色人格：${role.personality}
角色弧光阶段：${characterArc ? `${characterArc.label} / ${characterArc.tone}` : "无"}
世界观：${role.world}
角色关键词：${role.preferredNarrativeKeywords.join("、")}
历史称号：${formatTitles(permanentTitles)}
世界线实体：${formatWorldEntities(worldEntities)}
最近赛季纪要：
${formatSeasonDigests(seasonDigests)}
用户：${profile.name}
当前阶段目标：${profile.goal}
截止时间：${profile.deadline}
每日可投入：${profile.dailyTime}
上一阶段目标：${previousGoal || "无"}
当前章节候选：${currentChapter || role.chapter}`,
        },
      ],
      {
        apiKey,
        temperature: 0.7,
        maxTokens: 700,
      }
    );

    if (!result || typeof result !== "object") {
      return fallback;
    }

    return {
      chapterTitle: String(result.chapterTitle || currentChapter || role.chapter).trim(),
      mainlineSummary: String(result.mainlineSummary || fallback.mainlineSummary).trim(),
      openingStory: String(result.openingStory || fallback.openingStory).trim(),
      tasks: [],
      source: "deepseek",
    };
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  generateGoalBlueprint,
};
