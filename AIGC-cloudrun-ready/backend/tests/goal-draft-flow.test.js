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
  createParallelGoal,
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
    assert(draft.planDraft.firstWeek.every((day) => day.mainTasks.length === 3 && day.sideTasks.length === 2));

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

    let skippedDraft = createDraftCommand({
      mode: "PARALLEL",
      goalProfile: { title: "学习一个冷门主题", durationDays: 7, dailyTime: "1 小时" },
    });
    skippedDraft = await searchSourcesCommand(skippedDraft.draftId, { expectedRevision: skippedDraft.revision }, {
      tool: { async searchSources() { return []; }, async extractPublicOutline() { return null; } },
    });
    assert.strictEqual(skippedDraft.status, "SOURCES_READY");
    assert.strictEqual(skippedDraft.sourceBundles.length, 0);
    skippedDraft = selectSourcesCommand(skippedDraft.draftId, { expectedRevision: skippedDraft.revision, skip: true });
    assert.strictEqual(skippedDraft.status, "SOURCE_SKIPPED");
    skippedDraft = await generatePlanCommand(skippedDraft.draftId, { expectedRevision: skippedDraft.revision });
    assert.strictEqual(skippedDraft.status, "PLAN_READY");
    assert(skippedDraft.planDraft.firstWeek.every((day) => day.mainTasks.length === 3 && day.sideTasks.length === 2));
    assert(skippedDraft.planDraft.firstWeek.every((day) => [...day.mainTasks, ...day.sideTasks].every((task) => task.sourceRef === null)));
    assert.doesNotThrow(() => getDraftForConfirmation(skippedDraft.draftId, skippedDraft.revision));

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

    const concurrentDraft = await prepareParallelDraft("并发确认测试目标");
    const concurrentPrepared = getDraftForConfirmation(concurrentDraft.draftId, concurrentDraft.revision);
    const concurrentEvents = await Promise.all([
      confirmGoalDraft(concurrentPrepared, { confirmationKey: "concurrent-confirm-key" }),
      confirmGoalDraft(concurrentPrepared, { confirmationKey: "concurrent-confirm-key" }),
    ]);
    state = await getCurrentSessionState();
    assert.strictEqual(state.goalPortfolio.goals.filter((goal) => goal.originDraftId === concurrentDraft.draftId).length, 1);
    assert.deepStrictEqual(concurrentEvents[0], concurrentEvents[1]);
    await expectCode(
      () => confirmGoalDraft(concurrentPrepared, { confirmationKey: "different-confirm-key" }),
      "DRAFT_ALREADY_CONFIRMED"
    );

    const recoveryDraft = await prepareParallelDraft("确认回执恢复测试目标");
    const recoveryPrepared = getDraftForConfirmation(recoveryDraft.draftId, recoveryDraft.revision);
    await createParallelGoal({ confirmedDraft: recoveryPrepared });
    const recoveredEvent = await confirmGoalDraft(recoveryPrepared, { confirmationKey: "recovery-confirm-key" });
    assert(recoveredEvent && recoveredEvent.tag === "goal.created.parallel");
    state = await getCurrentSessionState();
    assert.strictEqual(state.goalPortfolio.goals.filter((goal) => goal.originDraftId === recoveryDraft.draftId).length, 1);

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
