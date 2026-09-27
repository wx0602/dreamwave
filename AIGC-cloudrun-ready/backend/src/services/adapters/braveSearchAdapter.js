const crypto = require("crypto");
const env = require("../../config/env");
const { AppError } = require("../../lib/errors");
const { normalizeUrl } = require("../sourceUrlSafetyService");

function sourceIdForUrl(url) {
  return `src-brave-${crypto.createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

function cleanText(value, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function search(query, options = {}) {
  if (!env.search.enabled || !env.search.apiKey) {
    throw new AppError("SOURCE_PROVIDER_UNAVAILABLE", "未配置搜索服务", 503);
  }
  const endpoint = new URL(env.search.baseUrl);
  endpoint.searchParams.set("q", cleanText(query, 200));
  endpoint.searchParams.set("count", String(Math.max(3, Math.min(20, Number(options.count) || env.search.resultCount))));
  endpoint.searchParams.set("safesearch", "strict");
  endpoint.searchParams.set("extra_snippets", "true");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs) || env.search.timeoutMs);
  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": env.search.apiKey,
        "User-Agent": "DreamwaveSourceSearch/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AppError("SOURCE_PROVIDER_ERROR", `搜索服务返回 HTTP ${response.status}`, response.status === 429 ? 503 : 502);
    }
    const data = await response.json();
    const results = data && data.web && Array.isArray(data.web.results) ? data.web.results : [];
    return results.map((item) => {
      const url = normalizeUrl(item && item.url);
      if (!url) return null;
      const snippets = Array.isArray(item && item.extra_snippets) ? item.extra_snippets : [];
      return {
        sourceId: sourceIdForUrl(url),
        origin: "BRAVE",
        title: cleanText(item && item.title, 180),
        provider: cleanText(item && item.profile && item.profile.long_name, 120),
        type: "OTHER",
        url,
        accessType: "UNKNOWN",
        editionOrVersion: "",
        language: "",
        description: cleanText([item && item.description, ...snippets].filter(Boolean).join(" "), 700),
        structure: [],
        outlineStatus: "UNVERIFIED",
        verificationStatus: "PARTIAL",
        verifiedAt: "",
        caution: "目录、版本和价格尚未核实",
      };
    }).filter((item) => item && item.title);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      error && error.name === "AbortError" ? "SOURCE_PROVIDER_TIMEOUT" : "SOURCE_PROVIDER_ERROR",
      error && error.name === "AbortError" ? "搜索服务超时" : "搜索服务暂时不可用",
      503
    );
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  search,
};
