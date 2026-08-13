const STORY_ASSETS = [
  {
    id: "watcher_shield",
    name: "守望者圣盾",
    category: "守望骑士",
    row: 1,
    roles: ["knight"],
    groups: ["knight", "defense", "oath"],
    tags: ["守望", "守护", "防线", "护盾", "结界", "稳定"],
    prompt: "守护、防线、结界被重新加固",
  },
  {
    id: "oath_sword",
    name: "誓约长剑",
    category: "守望骑士",
    row: 1,
    roles: ["knight"],
    groups: ["knight", "breakthrough", "oath"],
    tags: ["誓约", "长剑", "突破", "斩断", "决心", "试炼"],
    prompt: "誓约、决心与斩断阻碍的行动",
  },
  {
    id: "azure_helm",
    name: "苍穹头盔",
    category: "守望骑士",
    row: 1,
    roles: ["knight"],
    groups: ["knight", "focus", "defense"],
    tags: ["苍穹", "头盔", "专注", "守卫", "警戒", "秩序"],
    prompt: "专注警戒、抬头看见更高处的秩序",
  },
  {
    id: "glory_banner",
    name: "荣耀战旗",
    category: "守望骑士",
    row: 1,
    roles: ["knight"],
    groups: ["knight", "milestone", "finale"],
    tags: ["荣耀", "战旗", "旗帜", "集结", "主线", "终章"],
    prompt: "战旗被重新举起，阶段成果被看见",
  },
  {
    id: "guardian_armor",
    name: "守护者铠甲",
    category: "守望骑士",
    row: 1,
    roles: ["knight"],
    groups: ["knight", "defense", "growth"],
    tags: ["守护者", "铠甲", "抗压", "成长", "防御", "责任"],
    prompt: "角色获得更稳固的防护与承担",
  },
  {
    id: "arcane_tome",
    name: "奥术典籍",
    category: "奥术学者",
    row: 2,
    roles: ["scholar"],
    groups: ["scholar", "knowledge", "archive"],
    tags: ["奥术", "典籍", "阅读", "笔记", "知识", "档案", "卷轴"],
    prompt: "知识被翻开、记录、校正并写入档案",
  },
  {
    id: "astrolabe",
    name: "星象仪",
    category: "奥术学者",
    row: 2,
    roles: ["scholar"],
    groups: ["scholar", "insight", "planning"],
    tags: ["星象", "观察", "推理", "计划", "路径", "洞察"],
    prompt: "以观察和推理校准下一段路径",
  },
  {
    id: "mana_potion",
    name: "魔力药剂",
    category: "奥术学者",
    row: 2,
    roles: ["scholar"],
    groups: ["scholar", "recovery", "resource"],
    tags: ["魔力", "药剂", "补充", "恢复", "资源", "能量"],
    prompt: "短暂恢复能量，让下一次推进更稳定",
  },
  {
    id: "arcane_scepter",
    name: "秘法权杖",
    category: "奥术学者",
    row: 2,
    roles: ["scholar"],
    groups: ["scholar", "breakthrough", "focus"],
    tags: ["秘法", "权杖", "符印", "激活", "核心", "共鸣"],
    prompt: "符印被激活，知识核心出现回应",
  },
  {
    id: "exploration_map",
    name: "探索地图",
    category: "奥术学者",
    row: 2,
    roles: ["scholar", "traveler"],
    groups: ["scholar", "traveler", "planning", "side"],
    tags: ["探索", "地图", "路线", "阶段", "目标", "规划"],
    prompt: "地图展开，新的路线和目标被标注",
  },
  {
    id: "traveler_pack",
    name: "旅人背包",
    category: "荒野旅人",
    row: 3,
    roles: ["traveler"],
    groups: ["traveler", "supplies", "side"],
    tags: ["旅人", "背包", "补给", "准备", "支线", "携带"],
    prompt: "把零散准备装进背包，成为继续前进的补给",
  },
  {
    id: "wild_lantern",
    name: "荒野灯笼",
    category: "荒野旅人",
    row: 3,
    roles: ["traveler"],
    groups: ["traveler", "guide", "focus"],
    tags: ["荒野", "灯笼", "照亮", "夜路", "线索", "营地"],
    prompt: "灯笼照亮前路，隐藏线索逐渐显现",
  },
  {
    id: "wind_bow",
    name: "风语长弓",
    category: "荒野旅人",
    row: 3,
    roles: ["traveler"],
    groups: ["traveler", "breakthrough", "adventure"],
    tags: ["风语", "长弓", "远方", "突破", "命中", "风暴"],
    prompt: "顺风瞄准远处目标，完成一次干净的突破",
  },
  {
    id: "journey_boots",
    name: "远行之靴",
    category: "荒野旅人",
    row: 3,
    roles: ["traveler"],
    groups: ["traveler", "progress", "streak"],
    tags: ["远行", "靴", "步伐", "连续", "推进", "道路"],
    prompt: "每一步都把未知道路踩成可回望的路线",
  },
  {
    id: "spring_flask",
    name: "清泉水壶",
    category: "荒野旅人",
    row: 3,
    roles: ["traveler"],
    groups: ["traveler", "recovery", "supplies"],
    tags: ["清泉", "水壶", "休整", "恢复", "补给", "耐力"],
    prompt: "短暂休整并补足继续前行的耐力",
  },
  {
    id: "sky_crystal",
    name: "天空水晶",
    category: "Focus Artifacts",
    row: 4,
    roles: [],
    groups: ["focus", "artifact", "clarity"],
    tags: ["天空", "水晶", "清晰", "专注", "聚焦", "澄明"],
    prompt: "杂乱思绪沉淀为清晰可见的专注光点",
  },
  {
    id: "hourglass",
    name: "时之沙漏",
    category: "Focus Artifacts",
    row: 4,
    roles: [],
    groups: ["focus", "artifact", "time"],
    tags: ["时间", "沙漏", "番茄", "专注", "复盘", "阶段"],
    prompt: "时间被认真计量，短暂投入变成可靠刻度",
  },
  {
    id: "eternal_blossom",
    name: "永恒花朵",
    category: "Focus Artifacts",
    row: 4,
    roles: [],
    groups: ["focus", "artifact", "growth"],
    tags: ["永恒", "花", "成长", "沉淀", "坚持", "记忆"],
    prompt: "微小成果被保存下来，像花一样继续生长",
  },
  {
    id: "starlight_pendant",
    name: "星辉吊坠",
    category: "Focus Artifacts",
    row: 4,
    roles: [],
    groups: ["focus", "artifact", "bond"],
    tags: ["星辉", "吊坠", "称号", "羁绊", "奖励", "信念"],
    prompt: "奖励化作贴身信物，提醒角色继续守住信念",
  },
  {
    id: "treasure_chest",
    name: "秘宝匣",
    category: "Focus Artifacts",
    row: 4,
    roles: [],
    groups: ["focus", "artifact", "reward", "side"],
    tags: ["秘宝", "宝匣", "奖励", "支线", "收获", "解锁"],
    prompt: "一次推进打开新的收获，也留下后续伏笔",
  },
  {
    id: "sky_tower",
    name: "苍穹之塔",
    category: "World Anchors",
    row: 5,
    roles: ["knight", "scholar"],
    groups: ["location", "finale", "opening"],
    tags: ["苍穹", "塔", "章节", "主线", "世界", "终章"],
    prompt: "章节地点被点亮，主线轮廓变得更加清楚",
  },
  {
    id: "wisdom_society",
    name: "智慧学会",
    category: "World Anchors",
    row: 5,
    roles: ["scholar"],
    groups: ["location", "archive", "opening"],
    tags: ["智慧", "学会", "档案", "知识", "学者", "组织"],
    prompt: "知识共同体重新开启记录，旧档案被接续",
  },
  {
    id: "traveler_guild",
    name: "旅人协会",
    category: "World Anchors",
    row: 5,
    roles: ["traveler"],
    groups: ["location", "adventure", "opening"],
    tags: ["旅人", "协会", "路线", "委托", "支线", "远行"],
    prompt: "旅途组织发出新的委托，路线开始延展",
  },
  {
    id: "nature_pact",
    name: "自然之盟",
    category: "World Anchors",
    row: 5,
    roles: ["traveler"],
    groups: ["location", "bond", "finale"],
    tags: ["自然", "盟约", "荒野", "羁绊", "营地", "恢复"],
    prompt: "自然与旅途重新结盟，疲惫被温和接住",
  },
  {
    id: "radiant_oath",
    name: "光辉誓约",
    category: "World Anchors",
    row: 5,
    roles: ["knight"],
    groups: ["location", "oath", "finale"],
    tags: ["光辉", "誓约", "终章", "称号", "守望", "完成"],
    prompt: "誓约被光辉重新确认，阶段完成获得仪式感",
  },
];

const FALLBACK_ASSET_ID = "sky_crystal";

function cleanText(value) {
  return String(value || "").trim();
}

function lowerText(value) {
  return cleanText(value).toLowerCase();
}

function hashText(value) {
  const text = cleanText(value);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function includesAny(values = [], target) {
  if (!Array.isArray(values)) {
    return false;
  }
  return values.includes(target);
}

function textMatchesTag(text, tag) {
  const normalizedText = lowerText(text);
  const normalizedTag = lowerText(tag);
  return Boolean(normalizedTag) && normalizedText.includes(normalizedTag);
}

function normalizeAsset(asset) {
  if (!asset) {
    return null;
  }

  return {
    id: asset.id,
    name: asset.name,
    category: asset.category,
    row: asset.row,
    prompt: asset.prompt,
  };
}

function getStoryAsset(assetId) {
  const asset = STORY_ASSETS.find((entry) => entry.id === assetId);
  return normalizeAsset(asset || STORY_ASSETS.find((entry) => entry.id === FALLBACK_ASSET_ID));
}

function scoreAsset(asset, context) {
  const roleId = cleanText(context.roleId);
  const eventTag = cleanText(context.eventTag);
  const taskType = cleanText(context.taskType);
  const phase = cleanText(context.phase);
  const text = [
    context.text,
    context.taskTitle,
    context.goal,
    context.chapterTitle,
    Array.isArray(context.triggeredSkills)
      ? context.triggeredSkills.map((skill) => skill && (skill.name || skill.id)).join(" ")
      : "",
  ].join(" ");

  let score = 0;

  if (roleId && includesAny(asset.roles, roleId)) {
    score += 42;
  } else if (asset.row >= 4) {
    score += 16;
  } else if (asset.roles.length > 0) {
    score -= 8;
  }

  if (context.allMainDone && includesAny(asset.groups, "finale")) {
    score += 38;
  }
  if (phase === "opening" && includesAny(asset.groups, "opening")) {
    score += 32;
  }
  if (phase === "focus" && includesAny(asset.groups, "focus")) {
    score += 30;
  }
  if (taskType === "side" && includesAny(asset.groups, "side")) {
    score += 26;
  }
  if (eventTag.includes("dungeon") && (includesAny(asset.groups, "adventure") || includesAny(asset.groups, "location"))) {
    score += 18;
  }
  if (eventTag.includes("purchase") && (includesAny(asset.groups, "reward") || includesAny(asset.groups, "supplies"))) {
    score += 18;
  }

  for (const tag of asset.tags || []) {
    if (textMatchesTag(text, tag)) {
      score += 14;
    }
  }

  if (/时间|分钟|番茄|专注|focus/i.test(text) && asset.id === "hourglass") {
    score += 28;
  }
  if (/阅读|笔记|单词|词汇|整理|复盘|档案|卷轴/i.test(text) && asset.id === "arcane_tome") {
    score += 28;
  }
  if (/地图|路线|计划|阶段|目标|规划/i.test(text) && asset.id === "exploration_map") {
    score += 24;
  }
  if (/连续|坚持|打卡|streak/i.test(text) && asset.id === "journey_boots") {
    score += 24;
  }
  if (/奖励|资源|收获|解锁/i.test(text) && asset.id === "treasure_chest") {
    score += 20;
  }

  return score;
}

function selectStoryAsset(context = {}) {
  const scoredAssets = STORY_ASSETS.map((asset) => ({
    asset,
    score: scoreAsset(asset, context),
  })).sort((left, right) => right.score - left.score);

  const topScore = scoredAssets.length > 0 ? scoredAssets[0].score : 0;
  const candidates = scoredAssets
    .filter((entry) => entry.score >= topScore - 4)
    .map((entry) => entry.asset);
  const seed = [
    context.roleId,
    context.eventTag,
    context.taskType,
    context.phase,
    context.taskTitle,
    context.goal,
    context.text,
  ].join("|");
  const selected = candidates[hashText(seed) % Math.max(candidates.length, 1)];

  return normalizeAsset(selected || STORY_ASSETS.find((entry) => entry.id === FALLBACK_ASSET_ID));
}

function buildStoryAssetPrompt(storyAsset) {
  if (!storyAsset || !storyAsset.name) {
    return "";
  }
  return `本次剧情的视觉素材是「${storyAsset.name}」（${storyAsset.category}）。请让剧情自然围绕“${storyAsset.prompt || storyAsset.name}”展开，可以直接写出素材名，也可以用等价意象承接；不要把它写成 UI 图片说明。`;
}

module.exports = {
  STORY_ASSETS,
  buildStoryAssetPrompt,
  getStoryAsset,
  selectStoryAsset,
};
