const fs = require("fs");
const path = require("path");
const env = require("../../config/env");
const { normalizeUrl } = require("../sourceUrlSafetyService");

const catalogPath = path.join(env.backendRoot, "config", "learning-sources", "catalog.json");

function loadCatalog() {
  if (!fs.existsSync(catalogPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    return Array.isArray(parsed.sources) ? parsed.sources.map((source) => ({
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

function search(query, preferences = {}) {
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  return loadCatalog()
    .map((source) => {
      const haystack = `${source.title} ${source.provider} ${(source.topics || []).join(" ")}`.toLowerCase();
      const topicHits = terms.filter((term) => haystack.includes(term)).length;
      const preferenceHit = preferences.sourcePreference && (source.formats || []).includes(preferences.sourcePreference) ? 2 : 0;
      const accessHit = preferences.accessPreference === "FREE_ONLY" && source.accessType === "FREE" ? 2 : 0;
      return { source, score: topicHits * 3 + preferenceHit + accessHit };
    })
    .filter((entry) => entry.score > 0 || !terms.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry) => entry.source);
}

module.exports = {
  catalogPath,
  loadCatalog,
  search,
};
