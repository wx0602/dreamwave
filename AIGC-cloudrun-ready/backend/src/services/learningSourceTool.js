const braveSearchAdapter = require("./adapters/braveSearchAdapter");
const curatedCatalogAdapter = require("./adapters/curatedCatalogAdapter");
const { verifyUrl } = require("./sourceUrlSafetyService");

const DirectSearchAdapter = Object.freeze({
  async searchSources(query, preferences) {
    const results = [];
    try {
      results.push(...await braveSearchAdapter.search(query));
    } catch (error) {
      // The caller records the fallback mode; search must remain useful without a key.
    }
    results.push(...curatedCatalogAdapter.search(query, preferences));
    return results;
  },
  async fetchSourceMetadata(source) {
    if (!source || !source.url) return { ...source, verificationStatus: "PARTIAL" };
    try {
      const result = await verifyUrl(source.url);
      return {
        ...source,
        url: result.url || source.url,
        accessType: result.requiresLogin ? "LOGIN_REQUIRED" : source.accessType,
        verificationStatus: result.verificationStatus,
        verifiedAt: result.verificationStatus === "VERIFIED" ? new Date().toISOString() : source.verifiedAt || "",
      };
    } catch (error) {
      return { ...source, verificationStatus: "UNAVAILABLE" };
    }
  },
  async extractPublicOutline(source) {
    if (source && Array.isArray(source.structure) && source.structure.length > 0) {
      return { structure: source.structure, outlineStatus: "VERIFIED" };
    }
    return { structure: [], outlineStatus: "UNVERIFIED" };
  },
});

function createLearningSourceTool(adapter = DirectSearchAdapter) {
  return {
    searchSources: (...args) => adapter.searchSources(...args),
    fetchSourceMetadata: (...args) => adapter.fetchSourceMetadata(...args),
    extractPublicOutline: (...args) => adapter.extractPublicOutline(...args),
  };
}

module.exports = {
  DirectSearchAdapter,
  createLearningSourceTool,
};
