const crypto = require('crypto');
const { getGoalDraft, updateGoalDraft } = require('../store/goalDraftStore');
const { executeRequest } = require('../store/requestPersistence');
const { generateSourceBoundPlan } = require('./sourceBoundPlanningService');
const { AppError } = require('../lib/errors');

function preparePlanGenerationJob(req, draftId, payload = {}) {
  const current = getGoalDraft(draftId);
  const active = current.planGeneration;
  if (active && active.status === 'RUNNING' && Date.parse(active.expiresAt) > Date.now()) {
    return { draft: current, run: null };
  }
  if (!['SOURCE_SELECTED', 'SOURCE_SKIPPED', 'PLAN_READY'].includes(current.status)) {
    throw new AppError('INVALID_DRAFT_STATE', '请先选择学习来源或跳过来源选择', 409);
  }
  const selectedSourceIds = current.selectedSourceIds || [];
  const sources = (current.sourceCandidates || []).filter(source => selectedSourceIds.includes(source.sourceId));
  if (current.selectedBundleId !== 'SKIPPED' && !sources.length) {
    throw new AppError('SOURCE_BUNDLE_INVALID', '所选路线没有可用来源', 400);
  }
  const jobId = crypto.randomUUID();
  const adjustment = String(payload.adjustment || '').trim();
  const draft = updateGoalDraft(draftId, payload.expectedRevision, previous => ({
    ...previous,
    status: previous.selectedBundleId === 'SKIPPED' ? 'SOURCE_SKIPPED' : 'SOURCE_SELECTED',
    planDraft: null,
    planGeneration: { jobId, status:'RUNNING', startedAt:new Date().toISOString(), expiresAt:new Date(Date.now()+300000).toISOString(), message:'' },
  }));
  // Re-enter persistence only when saving the result. AI calls must not hold the global request queue.
  const identity = { headers:{...req.headers}, socket:{} };
  async function settle(plan, error) {
    await executeRequest(identity, {draftId, authRequired:false}, () => {
      const latest = getGoalDraft(draftId);
      if (latest.revision !== draft.revision || latest.planGeneration?.jobId !== jobId) return;
      updateGoalDraft(draftId, latest.revision, value => ({
        ...value,
        status: error ? value.status : 'PLAN_READY',
        planDraft: error ? null : plan,
        planWarnings: plan?.planWarnings || [],
        lastAdjustment: adjustment,
        planGeneration: {...value.planGeneration, status:error ? 'FAILED' : 'SUCCEEDED', message:error ? '任务生成暂时失败，请重试；目标和资料已保留' : ''},
      }));
    });
  }
  return { draft, run: async () => {
    let plan;
    try { plan = await generateSourceBoundPlan({goalProfile:current.goalProfile,selectedSourceIds,sources,adjustment}); }
    catch (error) { await settle(null,error); return; }
    await settle(plan,null);
  }};
}

module.exports = { preparePlanGenerationJob };
