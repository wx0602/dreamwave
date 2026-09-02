const assert = require("assert");

process.env.NODE_ENV = "test";
process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
process.env.BRAVE_SEARCH_API_URL = "https://search.example.test/res/v1/web/search";

const braveSearchAdapter = require("../src/services/adapters/braveSearchAdapter");
const { AppError } = require("../src/lib/errors");
const {
  normalizeUrl,
  assertSafeUrl,
} = require("../src/services/sourceUrlSafetyService");
const {
  searchLearningSources,
} = require("../src/services/learningSourceSearchService");
const {
  deterministicBundles,
  validateSourceBundles,
} = require("../src/services/learningSourceRankingService");

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

async function expectAppError(action, code) {
  await assert.rejects(action, (error) => error instanceof AppError && error.code === code);
}

async function run() {
  const originalFetch = global.fetch;
  try {
    let observedRequest = null;
    global.fetch = async (url, options) => {
      observedRequest = { url: String(url), options };
      return response(200, {
        web: {
          results: [{
            url: "https://docs.example.test/guide?utm_source=test#part",
            title: "公开学习指南",
            description: "官方公开目录",
            profile: { long_name: "Example Docs" },
            extra_snippets: ["章节目录可公开访问"],
          }],
        },
      });
    };
    const normal = await braveSearchAdapter.search("JavaScript 基础", { count: 5 });
    assert.strictEqual(normal.length, 1);
    assert.strictEqual(normal[0].origin, "BRAVE");
    assert.strictEqual(normal[0].url, "https://docs.example.test/guide");
    assert.strictEqual(normal[0].verificationStatus, "PARTIAL");
    assert(observedRequest.url.includes("q=JavaScript"));
    assert.strictEqual(observedRequest.options.headers["X-Subscription-Token"], "test-brave-key");

    global.fetch = async () => { const error = new Error("timeout"); error.name = "AbortError"; throw error; };
    await expectAppError(() => braveSearchAdapter.search("timeout"), "SOURCE_PROVIDER_TIMEOUT");
    for (const [status, code] of [[401, "SOURCE_PROVIDER_ERROR"], [429, "SOURCE_PROVIDER_ERROR"], [500, "SOURCE_PROVIDER_ERROR"]]) {
      global.fetch = async () => response(status);
      await expectAppError(() => braveSearchAdapter.search("error"), code);
    }

    assert.strictEqual(normalizeUrl("https://example.test/a/?utm_source=x&ref=y#part"), "https://example.test/a");
    await expectAppError(() => assertSafeUrl("http://localhost:3000/x", { skipDns: true }), "SOURCE_URL_UNSAFE");
    await expectAppError(() => assertSafeUrl("http://127.0.0.1/x", { skipDns: true }), "SOURCE_URL_UNSAFE");
    await expectAppError(() => assertSafeUrl("http://192.168.1.10/x", { skipDns: true }), "SOURCE_URL_UNSAFE");
    await expectAppError(() => assertSafeUrl("ftp://example.test/file", { skipDns: true }), "SOURCE_URL_INVALID");

    const catalogSource = {
      sourceId: "catalog-js",
      origin: "CURATED",
      title: "JavaScript 官方指南",
      provider: "Example Docs",
      type: "TEXT",
      url: "https://developer.example.test/javascript",
      accessType: "FREE",
      verificationStatus: "VERIFIED",
      structure: [{ locatorType: "CHAPTER", locatorLabel: "语法基础", locatorUrl: "https://developer.example.test/javascript/syntax", order: 1 }],
    };
    const catalogResult = await searchLearningSources(
      { title: "学习 JavaScript", durationDays: 14, sourcePreference: "TEXT", accessPreference: "FREE_ONLY" },
      {
        tool: {
          async searchSources() { return [catalogSource, { ...catalogSource, title: "JavaScript 官方指南（重复）" }]; },
          async extractPublicOutline(source) { return { structure: source.structure, outlineStatus: "VERIFIED" }; },
        },
      }
    );
    assert.strictEqual(catalogResult.searchMode, "CATALOG_ONLY");
    assert.strictEqual(catalogResult.source, "fallback");
    assert.strictEqual(catalogResult.candidates.length, 1, "相同 URL 的候选应去重");
    assert.strictEqual(catalogResult.bundles.length, 1, "只有一条可靠来源时不应凑出三套路线");

    const oneSource = { ...catalogSource, sourceId: "only-source" };
    const oneBundle = deterministicBundles([oneSource], { accessPreference: "FREE_ONLY" });
    assert.strictEqual(oneBundle.length, 1);
    const validated = validateSourceBundles({ bundles: [{ sourceIds: ["only-source", "unknown-source"] }] }, [oneSource]);
    assert.deepStrictEqual(validated[0].sourceIds, ["only-source"]);

    await expectAppError(
      () => searchLearningSources({ title: "无来源目标", durationDays: 7 }, {
        tool: {
          async searchSources() { return []; },
          async extractPublicOutline() { return { structure: [], outlineStatus: "UNVERIFIED" }; },
        },
      }),
      "NO_RELIABLE_SOURCE"
    );

    console.log("Learning source search and safety tests passed.");
  } finally {
    global.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
