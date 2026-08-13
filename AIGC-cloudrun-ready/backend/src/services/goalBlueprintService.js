const { jsonCompletion } = require("./deepseekService");
const { generateTasks } = require("./taskPlannerService");
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

function normalizeTask(task, index) {
  const rewardGrowth = Number(task.rewardGrowth || 12 + index * 2);
  const rewardResource = Number(task.rewardResource || 14 + index * 2);
  return {
    title: String(task.title || `阶段任务 ${index + 1}`).trim(),
    estimate: String(task.estimate || "25 分钟").trim(),
    rewardGrowth,
    rewardResource,
    rationale: String(task.rationale || "").trim(),
  };
}

function buildFallbackBlueprint({ role, profile, chapterTitle, storyAsset }) {
  const tasks = generateTasks(profile.goal).map((task, index) => ({
    ...task,
    rationale:
      index === 0
        ? "先从最小可执行块开始，降低行动门槛。"
        : index === 1
          ? "用一段完整练习巩固当前阶段重点。"
          : "通过复盘把输入转成可持续的记忆。",
  }));

  return {
    chapterTitle: chapterTitle || role.chapter,
    mainlineSummary: `围绕“${profile.goal}”展开主线。你需要在 ${chapterTitle || role.chapter} 中依次完成 3 个可执行学习任务。`,
    openingStory: `${role.agentName} 已接管本阶段档案。${storyAsset && storyAsset.name ? `「${storyAsset.name}」成为本章的初始意象。` : ""}你的目标“${profile.goal}”会被拆解成更小、更科学的行动单元，并逐步转写成一段魔幻冒险。`,
    tasks,
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

  const prompt = `请将一个阶段性学习目标拆解为科学合理、可执行的小任务，并包装成带魔幻冒险感的轻量主线剧情。

必须返回 JSON，格式如下：
{
  "chapterTitle": "字符串",
  "mainlineSummary": "字符串，80字以内",
  "openingStory": "字符串，80-140字",
  "tasks": [
    {
      "title": "字符串",
      "estimate": "如 25 分钟",
      "rewardGrowth": 16,
      "rewardResource": 18,
      "rationale": "为什么这个任务科学合理"
    }
  ]
}

约束：
1. tasks 必须正好 3 条。
2. 任务要和用户目标直接相关，粒度清晰、可执行、尽量科学合理。
3. 故事风格必须贴合角色设定，带一点魔幻、冒险、成长感。
4. openingStory 需要自然承接本次视觉素材，不要写成图片说明。
5. 不要输出解释文字，只输出 JSON。`;

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

    if (!result || !Array.isArray(result.tasks) || result.tasks.length === 0) {
      return fallback;
    }

    return {
      chapterTitle: String(result.chapterTitle || currentChapter || role.chapter).trim(),
      mainlineSummary: String(result.mainlineSummary || fallback.mainlineSummary).trim(),
      openingStory: String(result.openingStory || fallback.openingStory).trim(),
      tasks: result.tasks.slice(0, 3).map(normalizeTask),
      source: "deepseek",
    };
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  generateGoalBlueprint,
};
