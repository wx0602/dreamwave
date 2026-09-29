const { chatCompletion, jsonCompletion } = require("./deepseekService");
const { buildStoryAssetPrompt } = require("../constants/storyAssets");

function sanitizeText(value) {
  return String(value || "").trim();
}

function buildRecentMemoryContext(memories = []) {
  return memories
    .slice(0, 8)
    .map((memory, index) => {
      const summary = sanitizeText(memory.memorySummary || memory.summary);
      return `${index + 1}. ${sanitizeText(memory.title || "记忆")}：${summary}`;
    })
    .join("\n");
}

function buildTitleContext(permanentTitles = []) {
  return permanentTitles.length > 0
    ? permanentTitles
        .map((title) => `${title.name}${title.description ? `（${title.description}）` : ""}`)
        .join("、")
    : "无";
}

function buildWorldEntityContext(worldEntities = []) {
  return worldEntities.length > 0
    ? worldEntities
        .map((entity) => `${entity.name}[${entity.type}/${entity.status || "active"}]${entity.summary ? `：${entity.summary}` : ""}`)
        .join("、")
    : "无";
}

function buildSeasonDigestContext(seasonDigests = []) {
  return seasonDigests.length > 0
    ? seasonDigests
        .map((season, index) => `${index + 1}. ${season.goal}：${season.seasonDigest || "暂无纪要"}`)
        .join("\n")
    : "无";
}

function buildNarrativeSystemPrompt(baseInstruction, role, options = {}) {
  const parts = [
    baseInstruction,
    "以下是角色 Front-matter 中定义的系统 Prompt，请严格遵守：",
    role.systemPrompt,
  ];

  if (options.characterArc && options.characterArc.prompt) {
    parts.push("以下是当前角色弧光状态：", options.characterArc.prompt);
  }

  parts.push(`用户历史称号：${buildTitleContext(options.permanentTitles || [])}`);
  parts.push(`世界线历史实体：${buildWorldEntityContext(options.worldEntities || [])}`);
  parts.push(`最近赛季纪要：\n${buildSeasonDigestContext(options.seasonDigests || [])}`);

  if (options.skillPromptText) {
    parts.push(
      "以下是本次技能触发后追加的加戏指令，只在当前输出中生效：",
      options.skillPromptText
    );
  }

  return parts.join("\n\n");
}

function buildTriggeredSkillText(triggeredSkills = []) {
  return triggeredSkills.length > 0 ? triggeredSkills.map((skill) => skill.name).join("、") : "无";
}

function normalizeWorldEntities(worldEntities = []) {
  if (!Array.isArray(worldEntities)) {
    return [];
  }

  return worldEntities
    .map((entity) => ({
      type: sanitizeText(entity.type || "other") || "other",
      name: sanitizeText(entity.name),
      status: sanitizeText(entity.status || "active") || "active",
      summary: sanitizeText(entity.summary || entity.description),
    }))
    .filter((entity) => entity.name);
}

function fallbackTaskNarrative({ task, agent, profile, allMainDone, triggeredSkills, storyAsset }) {
  const ending = allMainDone
    ? "此役之后，本章节的主线任务已全部凑齐，真正的终章即将展开。"
    : "新的推进已经被记录进冒险日志。";
  const skillText =
    triggeredSkills.length > 0
      ? ` 技能“${buildTriggeredSkillText(triggeredSkills)}”在这一刻被同时激活。`
      : "";
  const assetText = storyAsset && storyAsset.name ? `${storyAsset.name} 的意象随之浮现，` : "";

  return {
    storyText: `${profile.name} 完成“${task.title}”。${assetText}${agent.chapter} 的道路被短暂照亮，${ending}${skillText}`,
    memorySummary: `${task.title} 完成，${agent.chapter} 推进一格`,
    worldEntities: [],
    source: "fallback",
  };
}

function fallbackSideQuestNarrative({ title, storyAsset }) {
  const assetText = storyAsset && storyAsset.name ? `，并以「${storyAsset.name}」作为本次支线的冒险意象` : "";
  return `“${title}”已成为一段支线冒险${assetText}，完成后会单独写入角色记忆。`;
}

function fallbackChapterFinale({ role, profile, chapterTitle, taskSummaries, worldEntities }) {
  const joinedSummaries = taskSummaries
    .slice(0, 6)
    .map((entry) => sanitizeText(entry.memorySummary || entry.summary))
    .filter(Boolean)
    .join("，");
  const entityText =
    worldEntities.length > 0
      ? `旧日实体 ${worldEntities.slice(0, 3).map((entity) => entity.name).join("、")} 也在终章中回响。`
      : "";

  return {
    chapterFinale: `${role.agentName} 在 ${chapterTitle} 的终章中为 ${profile.name} 立下新注脚。此前的推进包括 ${joinedSummaries || "多次关键推进"}，如今它们终于汇成一场完整的爆发。${entityText} 这一章以更高的视角回望每一次看似细小的努力，并将其写成真正能承接下一阶段的史诗段落。`,
    chapterDigest: `${chapterTitle} 终章落幕，当前阶段完成收束`,
    source: "fallback",
  };
}

function fallbackSeasonArchive({ goal, role, chapterFinale, seasonIndex }) {
  const titleName =
    /英语|单词|CET|六级|四级/i.test(goal)
      ? "语境征服者"
      : /代码|编程|算法|开发/i.test(goal)
        ? "逻辑开拓者"
        : `${role.name}勋章持有者`;

  return {
    seasonEpic: `第 ${seasonIndex} 季围绕“${goal}”展开，${role.agentName} 将这一阶段中分散的推进与终章回响重新编织成一部完整纪传。${chapterFinale ? `其中最关键的一幕是：${chapterFinale}` : "这一季的每一次推进都成为后续篇章的踏脚石。"} 它既是对本季目标的盖章，也是新旅程的起点。`,
    seasonDigest: `围绕“${goal}”的本季故事已完成归档。`,
    earnedTitles: [
      {
        name: titleName,
        description: `在“${goal}”阶段中完成关键推进后获得`,
      },
    ],
    source: "fallback",
  };
}

async function tryStructuredJson(messages, fallback, options = {}) {
  try {
    const result = await jsonCompletion(messages, {
      apiKey: options.apiKey,
      temperature: options.temperature ?? 0.75,
      maxTokens: options.maxTokens ?? 900,
    });
    return result || fallback;
  } catch (error) {
    return fallback;
  }
}

async function tryText(messages, fallback, options = {}) {
  try {
    const content = await chatCompletion(messages, {
      apiKey: options.apiKey,
      temperature: options.temperature ?? 0.8,
      maxTokens: options.maxTokens ?? 260,
    });
    return content || fallback;
  } catch (error) {
    return fallback;
  }
}

async function generateTaskNarrative({
  role,
  agent,
  profile,
  task,
  stats,
  recentSummaries,
  allMainDone,
  apiKey,
  triggeredSkills = [],
  skillPromptText = "",
  skillEffectSummary = "",
  characterArc,
  permanentTitles = [],
  worldEntities = [],
  seasonDigests = [],
  storyAsset,
}) {
  const fallback = fallbackTaskNarrative({
    task,
    agent,
    profile,
    allMainDone,
    triggeredSkills,
    storyAsset,
  });

  const result = await tryStructuredJson(
    [
      {
        role: "system",
        content: buildNarrativeSystemPrompt(
          `你是一个轻量级学习冒险叙事 Agent。你必须返回 JSON，格式如下：
{
  "story_text": "约 60-100 字的短剧情文本，用户可见",
  "memory_summary": "约 20-40 字的极简剧情摘要，用户不可见，只给后端记忆树使用",
  "world_entities": [
    {
      "type": "item|npc|location|artifact|other",
      "name": "实体名",
      "status": "equipped|active|met|sealed|damaged|rumored",
      "summary": "20字以内"
    }
  ]
}

约束：
1. 只输出 JSON，不要输出解释。
2. story_text 需要有画面感，但必须克制，不要分点，不要长段抒情。
3. memory_summary 只保留推进主线所必需的剧情骨架。
4. 若本次没有新增值得跨季保留的道具/NPC/地点，则 world_entities 返回 []。
5. 若这是本阶段最后一个主线任务，不要直接写完整章大结局，章节终章会由另一条链路单独生成。`,
          role,
          {
            skillPromptText,
            characterArc,
            permanentTitles,
            worldEntities,
            seasonDigests,
          }
        ) +
          (buildStoryAssetPrompt(storyAsset) ? `\n\n${buildStoryAssetPrompt(storyAsset)}` : ""),
      },
      {
        role: "user",
        content: `角色：${role.name}
风格：${role.tone}
表达：${role.speechStyle}
用户：${profile.name}
当前目标：${profile.goal}
当前章节：${agent.chapter}
当前情绪：${agent.emotion}
完成任务：${task.title}
奖励：成长值 +${task.rewardGrowth} / 资源点 +${task.rewardResource}
当前成长值：${stats.growth}
当前资源点：${stats.resources}
触发技能：${buildTriggeredSkillText(triggeredSkills)}
技能结算：${skillEffectSummary || "无"}
L1 短期记忆：
${buildRecentMemoryContext(recentSummaries)}
额外要求：${allMainDone ? "本次是本阶段最后一个主线任务，只写当前推进和高潮前夜感。" : "只描述当前推进，不要结束整个故事。"}`,
      },
    ],
    fallback,
    {
      apiKey,
      temperature: 0.85,
      maxTokens: 700,
    }
  );

  return {
    storyText: sanitizeText(result.story_text || result.storyText || fallback.storyText) || fallback.storyText,
    memorySummary:
      sanitizeText(result.memory_summary || result.memorySummary || fallback.memorySummary) ||
      fallback.memorySummary,
    worldEntities: normalizeWorldEntities(result.world_entities || result.worldEntities || fallback.worldEntities),
    source: result.source || (result.story_text ? "deepseek" : fallback.source),
  };
}

async function generateSideQuestNarrative({
  role,
  profile,
  title,
  apiKey,
  characterArc,
  permanentTitles = [],
  worldEntities = [],
  seasonDigests = [],
  storyAsset,
}) {
  const fallback = fallbackSideQuestNarrative({ title, storyAsset });
  return tryText(
    [
      {
        role: "system",
        content: buildNarrativeSystemPrompt(
          "请把一个学习中的临时任务包装成一句轻量支线剧情提示，中文，不超过 70 字。",
          role,
          {
            characterArc,
            permanentTitles,
            worldEntities,
            seasonDigests,
          }
        ) +
          (buildStoryAssetPrompt(storyAsset) ? `\n\n${buildStoryAssetPrompt(storyAsset)}` : ""),
      },
      {
        role: "user",
        content: `角色：${role.name}
风格：${role.tone}
用户：${profile.name}
当前目标：${profile.goal}
新增支线：${title}`,
      },
    ],
    fallback,
    { apiKey, maxTokens: 120 }
  );
}

async function generateChapterFinale({
  role,
  agent,
  profile,
  chapterTitle,
  taskSummaries,
  apiKey,
  characterArc,
  permanentTitles = [],
  worldEntities = [],
  seasonDigests = [],
}) {
  const fallback = fallbackChapterFinale({
    role,
    profile,
    chapterTitle,
    taskSummaries,
    worldEntities,
  });

  const result = await tryStructuredJson(
    [
      {
        role: "system",
        content: buildNarrativeSystemPrompt(
          `你是自律冒险产品中的高潮回溯引擎。请根据本阶段积累的短记忆，生成一篇完整章节大结局，并返回 JSON：
{
  "chapter_finale": "约 900-1200 字的壮阔章节终章",
  "chapter_digest": "50 字以内的终章摘要"
}

约束：
1. 只输出 JSON。
2. 终章必须有明显的回望、收束和升格感。
3. 若提供了旧道具/NPC/地点，必须让其中至少一个返场。
4. 文风必须严格贴合角色设定与当前角色弧光。`,
          role,
          {
            characterArc,
            permanentTitles,
            worldEntities,
            seasonDigests,
          }
        ),
      },
      {
        role: "user",
        content: `角色：${role.name}
用户：${profile.name}
当前阶段目标：${profile.goal}
章节标题：${chapterTitle || agent.chapter}
阶段记忆摘要：
${buildRecentMemoryContext(taskSummaries)}
可返场实体：${buildWorldEntityContext(worldEntities)}
历史称号：${buildTitleContext(permanentTitles)}`,
      },
    ],
    fallback,
    {
      apiKey,
      temperature: 0.9,
      maxTokens: 1800,
    }
  );

  return {
    chapterFinale:
      sanitizeText(result.chapter_finale || result.chapterFinale || fallback.chapterFinale) ||
      fallback.chapterFinale,
    chapterDigest:
      sanitizeText(result.chapter_digest || result.chapterDigest || fallback.chapterDigest) ||
      fallback.chapterDigest,
    source: result.source || (result.chapter_finale ? "deepseek" : fallback.source),
  };
}

async function generateSeasonArchive({
  role,
  profile,
  seasonIndex,
  seasonGoal,
  seasonTaskSummaries,
  chapterFinale,
  apiKey,
  characterArc,
  permanentTitles = [],
  worldEntities = [],
  seasonDigests = [],
}) {
  const fallback = fallbackSeasonArchive({
    goal: seasonGoal,
    role,
    chapterFinale,
    seasonIndex,
  });

  const result = await tryStructuredJson(
    [
      {
        role: "system",
        content: buildNarrativeSystemPrompt(
          `你是多级树状记忆系统中的赛季归档引擎。请把一个阶段目标压缩成中期记忆档案，并返回 JSON：
{
  "season_epic": "约 400-600 字的《本季史诗纪传》",
  "season_digest": "60 字以内的赛季纪要",
  "earned_titles": [
    {
      "name": "称号名称",
      "description": "20-40字，说明称号来源"
    }
  ]
}

约束：
1. 只输出 JSON。
2. 称号要具体、可复用、能跨季继承，不要泛泛而谈。
3. 若用户尚未达到很高成就，也至少给出 1 个有成长含义的称号。`,
          role,
          {
            characterArc,
            permanentTitles,
            worldEntities,
            seasonDigests,
          }
        ),
      },
      {
        role: "user",
        content: `角色：${role.name}
用户：${profile.name}
赛季编号：第 ${seasonIndex} 季
本季目标：${seasonGoal}
本季任务摘要：
${buildRecentMemoryContext(seasonTaskSummaries)}
章节终章：
${chapterFinale || "无"}
历史称号：${buildTitleContext(permanentTitles)}
世界线实体：${buildWorldEntityContext(worldEntities)}`,
      },
    ],
    fallback,
    {
      apiKey,
      temperature: 0.8,
      maxTokens: 1200,
    }
  );

  return {
    seasonEpic:
      sanitizeText(result.season_epic || result.seasonEpic || fallback.seasonEpic) ||
      fallback.seasonEpic,
    seasonDigest:
      sanitizeText(result.season_digest || result.seasonDigest || fallback.seasonDigest) ||
      fallback.seasonDigest,
    earnedTitles: Array.isArray(result.earned_titles || result.earnedTitles)
      ? (result.earned_titles || result.earnedTitles)
      : fallback.earnedTitles,
    source: result.source || (result.season_epic ? "deepseek" : fallback.source),
  };
}

module.exports = {
  generateTaskNarrative,
  generateSideQuestNarrative,
  generateChapterFinale,
  generateSeasonArchive,
};
