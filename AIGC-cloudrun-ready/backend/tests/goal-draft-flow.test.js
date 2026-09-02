const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aigc-goal-draft-"));
process.env.NODE_ENV = "test";
process.env.RUNTIME_DIR = runtimeDir;
delete process.env.DEEPSEEK_API_KEY;

const {
  getGoalDraft,
  updateGoalDraft,
  resetDraftStore,
} = require("../src/store/goalDraftStore");
const {
  createDraftCommand,
  searchSourcesCommand,
  selectSourcesCommand,
  generatePlanCommand,
  getDraftForConfirmation,
} = require("../src/services/goalDraftService");
const {
  createSession,
  confirmGoalDraft,
  getCurrentSessionState,
} = require("../src/services/sessionService");
const { AppError } = require("../src/lib/errors");

const source = {
  sourceId: "draft-source",
  origin: "CURATED",
  title: "公开 JavaScript 指南",
  provider: "Example Docs",
  type: "TEXT",
  url: "https://docs.example.test/javascript",
  accessType: "FREE",
  verificationStatus: "VERIFIED",
  structure: [{ locatorType: "CHAPTER", locatorLabel: "语法基础", locatorUrl: "https://docs.example.test/javascript/syntax", order: 1 }],
};

function tool() {
  return {
    async searchSources() { return [source]; },
    async extractPublicOutline() { return { structure: source.structure, outlineStatus: "VERIFIED" }; },
  };
}

async function expectCode(action, code) {
  await assert.rejects(async () => action(), (error) => error instanceof AppError && error.code === code);
}

async function prepareParallelDraft(title) {
  let draft = createDraftCommand({
    mode: "PARALLEL",
    goalProfile: { title, durationDays: 7, dailyTime: "1 小时", sourcePreference: "TEXT" },
  });
  draft = await searchSourcesCommand(draft.draftId, { expectedRevision: draft.revision }, { tool: tool() });
  draft = selectSourcesCommand(draft.draftId, {
    expectedRevision: draft.revision,
    bundleId: draft.sourceBundles[0].bundleId,
  });
  draft = await generatePlanCommand(draft.draftId, { expectedRevision: draft.revision });
  return draft;
}

async function run() {
  try {
    resetDraftStore();
    let draft = createDraftCommand({
      mode: "PARALLEL",
      goalProfile: {
        title: "学习 JavaScript",
        durationDays: 7,
        dailyTime: "1 小时",
        account: "should-not-be-stored",
        password: "secret-password",
        apiKey: "secret-api-key",
      },
    });
    assert.strictEqual(draft.status, "CREATED");
    assert(!JSON.stringify(draft).includes("secret-password"));
    assert(!JSON.stringify(draft).includes("secret-api-key"));
    assert(!JSON.stringify(getGoalDraft(draft.draftId)).includes("should-not-be-stored"));

    await expectCode(
      () => selectSourcesCommand(draft.draftId, { expectedRevision: draft.revision, bundleId: "missing" }),
      "INVALID_DRAFT_STATE"
    );
    draft = await searchSourcesCommand(draft.draftId, { expectedRevision: draft.revision }, { tool: tool() });
    assert.strictEqual(draft.status, "SOURCES_READY");
    assert(draft.sourceCandidates.length > 0 && draft.sourceBundles.length > 0);
    await expectCode(
      () => searchSourcesCommand(draft.draftId, { expectedRevision: 1 }, { tool: tool() }),
      "DRAFT_REVISION_CONFLICT"
    );

    draft = selectSourcesCommand(draft.draftId, {
      expectedRevision: draft.revision,
      bundleId: draft.sourceBundles[0].bundleId,
    });
    assert.strictEqual(draft.status, "SOURCE_SELECTED");
    draft = await generatePlanCommand(draft.draftId, { expectedRevision: draft.revision });
    assert.strictEqual(draft.status, "PLAN_READY");
    assert(draft.planDraft && draft.planDraft.firstWeek.length > 0);

    // Re-selecting a bundle intentionally invalidates the old plan.
    draft = selectSourcesCommand(draft.draftId, {
      expectedRevision: draft.revision,
      bundleId: draft.sourceBundles[0].bundleId,
    });
    assert.strictEqual(draft.status, "SOURCE_SELECTED");
    assert.strictEqual(draft.planDraft, null);
    await expectCode(
      () => getDraftForConfirmation(draft.draftId, draft.revision),
      "INVALID_DRAFT_STATE"
    );
    draft = await generatePlanCommand(draft.draftId, { expectedRevision: draft.revision });
    assert.strictEqual(draft.status, "PLAN_READY");

    await createSession({
      account: `draft-flow-${Date.now()}`,
      password: "draft-flow-password",
      name: "草稿流程用户",
      goal: "完成一个基础目标",
      deadline: "7 天后",
      dailyTime: "1 小时",
      roleId: "scholar",
    });
    const prepared = getDraftForConfirmation(draft.draftId, draft.revision);
    const firstEvent = await confirmGoalDraft(prepared, { confirmationKey: "parallel-confirm-key" });
    let state = await getCurrentSessionState();
    assert.strictEqual(state.goalPortfolio.goals.length, 2);
    const secondEvent = await confirmGoalDraft(prepared, { confirmationKey: "parallel-confirm-key" });
    state = await getCurrentSessionState();
    assert.strictEqual(state.goalPortfolio.goals.length, 2, "重复确认不得重复创建目标");
    assert.deepStrictEqual(secondEvent, firstEvent);

    const confirmed = getGoalDraft(draft.draftId);
    assert.strictEqual(confirmed.status, "CONFIRMED");
    await expectCode(
      () => updateGoalDraft(draft.draftId, confirmed.revision, (value) => value),
      "INVALID_DRAFT_STATE"
    );
    const rawDraftFile = fs.readFileSync(path.join(runtimeDir, "goal-drafts.json"), "utf8");
    assert(!rawDraftFile.includes("draft-flow-password"));
    assert(!rawDraftFile.includes("secret-api-key"));

    console.log("Goal draft state machine tests passed.");
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
