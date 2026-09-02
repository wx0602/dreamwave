const crypto = require("crypto");
const env = require("../config/env");
const { jsonCompletion, getResolvedApiKey } = require("./deepseekService");

function text(value, fallback = "") {
  const result = String(value || "").replace(/\s+/g, " ").trim();
  return result || fallback;
}

function stableBundleId(sourceIds, index) {
  return `bundle-${crypto.createHash("sha256").update(`${index}:${sourceIds.join(",")}`).digest("hex").slice(0, 12)}`;
}

function deterministicBundles(candidates, preferences = {}) {
  const usable = candidates.filter((source) => source && source.verificationStatus !== "UNAVAILABLE");
  if (!usable.length) return [];
  const sorted = [...usable].sort((a, b) => {
    const curated = Number(b.origin === "CURATED") - Number(a.origin === "CURATED");
    const verified = Number(b.verificationStatus === "VERIFIED") - Number(a.verificationStatus === "VERIFIED");
    const free = preferences.accessPreference === "FREE_ONLY"
      ? Number(b.accessType === "FREE") - Number(a.accessType === "FREE") : 0;
    return free || verified || curated;
  });
  const primary = sorted[0];
  const practice = sorted.find((source) => source.sourceId !== primary.sourceId && ["QUESTION_BANK", "PROJECT", "PRACTICE"].includes(source.type));
  const bundles = [{
    bundleId: stableBundleId([primary.sourceId], 0),
    label: "推荐路线",
    sourceIds: [primary.sourceId],
    sourceRoles: [{ sourceId: primary.sourceId, role: "主要学习材料" }],
    fitReason: "来源结构相对稳定，适合围绕一个主材料连续推进。",
    caution: primary.caution || "具体目录和访问条件请以来源页面为准。",
    estimatedScope: "按来源目录逐步推进",
    recommended: true,
  }];
  if (practice) {
    bundles.push({
      bundleId: stableBundleId([primary.sourceId, practice.sourceId], 1),
      label: "实践路线",
      sourceIds: [primary.sourceId, practice.sourceId],
      sourceRoles: [
        { sourceId: primary.sourceId, role: "主要学习材料" },
        { sourceId: practice.sourceId, role: "练习或应用" },
      ],
      fitReason: "保留主要材料，同时加入一个练习或应用来源。",
      caution: "两个来源需要按计划顺序使用，避免来回切换。",
      estimatedScope: "主材料 + 轻量练习",
      recommended: false,
    });
  }
  const alternate = sorted.find((source) => ![primary.sourceId, practice && practice.sourceId].includes(source.sourceId));
  if (alternate) {
    bundles.push({
      bundleId: stableBundleId([alternate.sourceId], 2),
      label: "替代路线",
      sourceIds: [alternate.sourceId],
      sourceRoles: [{ sourceId: alternate.sourceId, role: "替代主要材料" }],
      fitReason: "使用另一条可核验来源，适合不接受推荐材料的情况。",
      caution: alternate.caution || "使用前请再次确认版本和访问条件。",
      estimatedScope: "按替代来源目录推进",
      recommended: false,
    });
  }
  return bundles.slice(0, 3);
}

function validateSourceBundles(raw, candidates, preferences = {}) {
  const validIds = new Set(candidates.map((source) => source.sourceId));
  const list = Array.isArray(raw && raw.bundles) ? raw.bundles : [];
  const bundles = list.map((bundle, index) => {
    const sourceIds = Array.isArray(bundle && bundle.sourceIds)
      ? [...new Set(bundle.sourceIds.map((id) => text(id)).filter((id) => validIds.has(id)))] : [];
    if (!sourceIds.length) return null;
    const roles = Array.isArray(bundle.sourceRoles) ? bundle.sourceRoles : [];
    return {
      bundleId: stableBundleId(sourceIds, index),
      label: text(bundle.label, index === 0 ? "推荐路线" : `路线 ${index + 1}`),
      sourceIds,
      sourceRoles: sourceIds.map((sourceId) => ({
        sourceId,
        role: text((roles.find((role) => role && role.sourceId === sourceId) || {}).role, "学习来源"),
      })),
      fitReason: text(bundle.fitReason, "这套来源与当前目标较匹配。"),
      caution: text(bundle.caution, "具体访问条件请以来源页面为准。"),
      estimatedScope: text(bundle.estimatedScope, "按来源结构逐步推进"),
      recommended: Boolean(bundle.recommended),
    };
  }).filter(Boolean).slice(0, 3);
  if (!bundles.length) return deterministicBundles(candidates, preferences);
  const recommendedIndex = bundles.findIndex((bundle) => bundle.recommended);
  bundles.forEach((bundle, index) => { bundle.recommended = recommendedIndex < 0 ? index === 0 : index === recommendedIndex; });
  return bundles;
}

async function rankSourceBundles(candidates, context = {}, options = {}) {
  const fallback = deterministicBundles(candidates, context.preferences || {});
  const apiKey = getResolvedApiKey(options.apiKey);
  if (!apiKey || !candidates.length) return { bundles: fallback, source: "fallback" };
  try {
    const result = await jsonCompletion([
      {
        role: "system",
        content: `你是学习资料策展助手。只能从候选列表中选择 sourceId，不能新增 URL、标题、提供方、价格、版本或目录。最多返回 3 套路线；来源数量和角色根据目标决定，不固定一主一辅。优先少而稳定，但如果考试、项目或练习目标确实需要可以组合多个来源。不要输出分数。只返回 JSON：{"bundles":[{"label":"","sourceIds":[],"sourceRoles":[{"sourceId":"","role":""}],"fitReason":"","caution":"","estimatedScope":"","recommended":true}]}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          goalProfile: context.goalProfile || {},
          candidates: candidates.map((source) => ({
            sourceId: source.sourceId,
            title: source.title,
            provider: source.provider,
            type: source.type,
            accessType: source.accessType,
            description: source.description,
            structureCount: Array.isArray(source.structure) ? source.structure.length : 0,
            verificationStatus: source.verificationStatus,
          })),
        }),
      },
    ], { apiKey, temperature: 0.3, maxTokens: 1200, timeoutMs: 10000 });
    const suppliedBundles = Array.isArray(result && result.bundles) ? result.bundles : [];
    const hasUsableLlmBundle = suppliedBundles.some((bundle) => (
      Array.isArray(bundle && bundle.sourceIds) && bundle.sourceIds.length > 0
    ));
    const bundles = validateSourceBundles(result, candidates, context.preferences || {});
    return { bundles, source: hasUsableLlmBundle ? "llm" : "fallback" };
  } catch (error) {
    return { bundles: fallback, source: "fallback" };
  }
}

module.exports = {
  deterministicBundles,
  validateSourceBundles,
  rankSourceBundles,
};
