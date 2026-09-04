const fs = require("fs");
const path = require("path");
const env = require("../../config/env");
const { normalizeUrl } = require("../sourceUrlSafetyService");

const catalogPath = path.join(env.backendRoot, "config", "learning-sources", "catalog.json");
const GENERIC_TOPICS = new Set(["学习", "练习", "课程", "教程", "教材", "官方", "资料", "项目"]);

function loadCatalog() {
  if (!fs.existsSync(catalogPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    return Array.isArray(parsed.sources) ? parsed.sources.filter((source) => (
      source && source.sourceId && source.title && normalizeUrl(source.url)
      && source.accessType && source.verifiedAt && source.caution
      && Array.isArray(source.topics) && source.topics.length > 0
    )).map((source) => ({
      ...source,
      origin: "CURATED",
      url: normalizeUrl(source.url),
      structure: Array.isArray(source.structure) ? source.structure : [],
      outlineStatus: "VERIFIED",
      verificationStatus: "VERIFIED",
    })) : [];
  } catch (error) {
    return [];
  }
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function domainHits(source, goalTitle) {
  const goal = normalize(goalTitle);
  if (!goal) return 0;
  return (source.topics || []).filter((topic) => {
    const keyword = normalize(topic);
    return keyword.length >= 2 && !GENERIC_TOPICS.has(keyword) && goal.includes(keyword);
  }).length;
}

function search(query, preferences = {}, context = {}) {
  const goalTitle = context.goalTitle || query;
  return loadCatalog()
    .map((source) => {
      const topicHits = domainHits(source, goalTitle);
      const preferenceHit = preferences.sourcePreference && (source.formats || []).includes(preferences.sourcePreference) ? 2 : 0;
      const accessHit = preferences.accessPreference === "FREE_ONLY" && source.accessType === "FREE" ? 2 : 0;
      return { source, score: topicHits * 3 + preferenceHit + accessHit };
    })
    .filter((entry) => entry.score > 0 && domainHits(entry.source, goalTitle) > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry) => entry.source);
}

module.exports = {
  catalogPath,
  loadCatalog,
  domainHits,
  search,
};
