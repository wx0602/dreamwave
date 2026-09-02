const crypto = require("crypto");
const { AppError } = require("../lib/errors");
const { createLearningSourceTool } = require("./learningSourceTool");
const { normalizeUrl, verifyUrl } = require("./sourceUrlSafetyService");
const { rankSourceBundles } = require("./learningSourceRankingService");
const { getResolvedApiKey } = require("./deepseekService");

function text(value, fallback = "") {
  const result = String(value || "").replace(/\s+/g, " ").trim();
  return result || fallback;
}

function durationDays(value) {
  const match = String(value || "").match(/\d+/);
  return Math.max(1, Math.min(365, Number(match && match[0]) || 30));
}

function normalizePreferences(profile = {}) {
  return {
    currentLevel: ["BEGINNER", "UNSYSTEMATIC", "SPRINT"].includes(profile.currentLevel) ? profile.currentLevel : "UNSYSTEMATIC",
    sourcePreference: ["VIDEO", "TEXT", "PRACTICE", "ANY"].includes(profile.sourcePreference) ? profile.sourcePreference : "ANY",
    accessPreference: ["FREE_ONLY", "PAID_OK", "OWNED"].includes(profile.accessPreference) ? profile.accessPreference : "FREE_ONLY",
  };
}

function buildQueries(profile, userSources = []) {
  const title = text(profile.title, "学习目标");
  const suffix = profile.sourcePreference === "VIDEO" ? "视频课程"
    : profile.sourcePreference === "TEXT" ? "教材 文档"
      : profile.sourcePreference === "PRACTICE" ? "练习 题库 项目" : "课程 教材 官方资料";
  const queries = [`${title} ${suffix}`, `${title} 官方 大纲 教程`, `${title} 练习 真题 题库`];
  if (userSources.length) queries.unshift(`${title} ${userSources.map((source) => text(source.title)).join(" ")}`);
  return [...new Set(queries)].slice(0, 4);
}

function userSourceId(source) {
  const basis = `${source.title}|${source.url}|${source.editionOrVersion}`;
  return `src-user-${crypto.createHash("sha256").update(basis).digest("hex").slice(0, 16)}`;
}

function normalizeUserSource(source) {
  const title = text(source && source.title);
  if (!title) return null;
  return {
    sourceId: userSourceId(source),
    origin: "USER",
    title,
    provider: text(source.provider, "用户提供"),
    type: "OTHER",
    url: normalizeUrl(source.url),
    accessType: "OWNED",
    editionOrVersion: text(source.editionOrVersion),
    language: text(source.language),
    description: text(source.description, "用户已经拥有或指定的学习资料"),
    structure: Array.isArray(source.structure) ? source.structure : [],
    outlineStatus: Array.isArray(source.structure) && source.structure.length ? "USER_PROVIDED" : "UNVERIFIED",
    verificationStatus: source.url ? "PARTIAL" : "PARTIAL",
    verifiedAt: "",
    caution: source.url ? "链接访问条件尚未核实" : "未提供链接，章节位置需要用户确认",
  };
}

function dedupeSources(sources) {
  const byKey = new Map();
  sources.forEach((source) => {
    if (!source) return;
    const key = source.url || `${source.title}|${source.provider}`.toLowerCase();
    if (!key || byKey.has(key)) return;
    byKey.set(key, source);
  });
  return [...byKey.values()].slice(0, 12);
}

async function verifyCandidates(candidates) {
  const output = [];
  for (let index = 0; index < candidates.length; index += 3) {
    const chunk = candidates.slice(index, index + 3);
    const results = await Promise.all(chunk.map(async (source) => {
      if (source.origin === "CURATED" || source.origin === "USER" && !source.url) return source;
      try {
        const result = await verifyUrl(source.url, { timeoutMs: 2500 });
        return {
          ...source,
          url: result.url || source.url,
          accessType: result.requiresLogin ? "LOGIN_REQUIRED" : source.accessType,
          verificationStatus: result.verificationStatus,
          verifiedAt: result.verificationStatus === "VERIFIED" ? new Date().toISOString() : source.verifiedAt,
          caution: result.verificationStatus === "VERIFIED" ? source.caution : "链接当前无法完全核实访问条件",
        };
      } catch (error) {
        return { ...source, verificationStatus: "UNAVAILABLE", caution: "链接当前不可访问" };
      }
    }));
    output.push(...results);
  }
  return output.filter((source) => source.verificationStatus !== "UNAVAILABLE" || source.origin === "USER");
}

async function searchLearningSources(goalProfile, options = {}) {
  const profile = { ...(goalProfile || {}), durationDays: durationDays(goalProfile && goalProfile.durationDays || goalProfile && goalProfile.deadline) };
  const preferences = normalizePreferences(profile);
  const userSources = (Array.isArray(options.userSources) ? options.userSources : []).map(normalizeUserSource).filter(Boolean);
  const tool = options.tool || createLearningSourceTool();
  const raw = [];
  for (const query of buildQueries(profile, userSources)) {
    try {
      raw.push(...await tool.searchSources(query, preferences));
    } catch (error) {
      // Keep catalog/user fallback; provider errors are returned as warnings.
    }
  }
  raw.push(...userSources);
  const candidates = await verifyCandidates(dedupeSources(raw));
  if (!candidates.length) {
    throw new AppError("NO_RELIABLE_SOURCE", "暂时没有找到可核验的学习来源，请输入已有资料", 422);
  }
  const outlined = await Promise.all(candidates.map(async (source) => {
    const outline = await tool.extractPublicOutline(source);
    return { ...source, structure: outline.structure || source.structure || [], outlineStatus: outline.outlineStatus || source.outlineStatus };
  }));
  const ranked = await rankSourceBundles(outlined, { goalProfile: profile, preferences }, { apiKey: options.apiKey || getResolvedApiKey() });
  if (!ranked.bundles.length) {
    throw new AppError("NO_RELIABLE_SOURCE", "找到的来源不足以形成可靠路线，请输入已有资料", 422);
  }
  return {
    candidates: outlined,
    bundles: ranked.bundles,
    source: ranked.source,
    searchMode: raw.some((source) => source && source.origin === "BRAVE")
      ? userSources.length ? "BRAVE_CATALOG_USER" : "BRAVE_AND_CATALOG"
      : userSources.length ? "USER_AND_CATALOG" : "CATALOG_ONLY",
    warnings: ranked.source === "fallback" ? ["AI 排序不可用，已使用确定性来源组合。"] : [],
  };
}

module.exports = {
  normalizePreferences,
  buildQueries,
  normalizeUserSource,
  dedupeSources,
  searchLearningSources,
};
