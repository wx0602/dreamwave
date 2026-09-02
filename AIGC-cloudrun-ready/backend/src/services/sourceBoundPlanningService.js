const { jsonCompletion, getResolvedApiKey } = require("./deepseekService");

function text(value, fallback = "") {
  const result = String(value || "").replace(/\s+/g, " ").trim();
  return result || fallback;
}

function clamp(value, minimum, maximum, fallback = minimum) {
  const parsed = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(parsed) ? parsed : fallback));
}

function sourceMap(sources) {
  return new Map((Array.isArray(sources) ? sources : []).map((source) => [source.sourceId, source]));
}

function sourceRefFor(source, raw = {}) {
  if (!source) return null;
  const structure = Array.isArray(source.structure) ? source.structure : [];
  const requestedType = ["CHAPTER", "LESSON", "SECTION", "EXERCISE_SET"].includes(raw.locatorType)
    ? raw.locatorType : null;
  const requestedLabel = text(raw.locatorLabel);
  const exact = requestedLabel
    ? structure.find((entry) => entry && text(entry.locatorLabel) === requestedLabel && (!requestedType || entry.locatorType === requestedType))
    : null;
  if (exact) {
    return {
      sourceId: source.sourceId,
      sourceTitle: source.title,
      locatorType: exact.locatorType,
      locatorLabel: text(exact.locatorLabel),
      locatorUrl: text(exact.locatorUrl, source.url),
      verified: source.outlineStatus === "VERIFIED" || source.outlineStatus === "USER_PROVIDED",
    };
  }
  return {
    sourceId: source.sourceId,
    sourceTitle: source.title,
    locatorType: "URL",
    locatorLabel: source.title,
    locatorUrl: source.url,
    verified: false,
  };
}

function normalizeTask(raw, sources, selectedSourceIds, fallbackTitle, fallbackMinutes, optional = false) {
  const sourceById = sourceMap(sources);
  const sourceId = text(raw && raw.sourceRef && raw.sourceRef.sourceId);
  const source = sourceById.get(sourceId) || sourceById.get(selectedSourceIds[0]);
  const sourceRef = source ? sourceRefFor(source, raw && raw.sourceRef || {}) : null;
  const title = text(raw && raw.title, fallbackTitle);
  const detail = text(raw && (raw.detail || raw.description), "按来源位置完成这项具体行动，并记录一个结果或问题。");
  return {
    title,
    detail,
    estimatedMinutes: clamp(raw && raw.estimatedMinutes, 5, optional ? 45 : 90, fallbackMinutes),
    sourceRef,
    selectionReason: text(raw && raw.selectionReason, optional ? "用较轻的动作巩固今天的范围。" : "这是今天围绕已确认来源推进的下一步。"),
  };
}

function buildFallbackPlan(context = {}) {
  const profile = context.goalProfile || {};
  const sources = Array.isArray(context.sources) ? context.sources : [];
  const selectedSourceIds = Array.isArray(context.selectedSourceIds) ? context.selectedSourceIds : sources.map((source) => source.sourceId);
  const primary = sources.find((source) => selectedSourceIds.includes(source.sourceId)) || sources[0];
  const structure = primary && Array.isArray(primary.structure) ? primary.structure : [];
  const days = Math.min(7, Math.max(1, Number(profile.durationDays) || 30));
  const budget = clamp(context.dailyBudgetMinutes || profile.dailyBudgetMinutes, 25, 480, 120);
  const firstWeek = Array.from({ length: days }, (_, index) => {
    const locator = structure[index % Math.max(1, structure.length)];
    const sourceRef = primary ? sourceRefFor(primary, locator || {}) : null;
    const range = sourceRef && sourceRef.locatorType !== "URL" ? `“${sourceRef.locatorLabel}”` : `“${primary ? primary.title : "已确认来源"}”`;
    const coreMinutes = Math.max(5, Math.min(90, Math.round(budget * 0.6)));
    const core = {
      title: `完成${range}的第 ${index + 1} 个具体学习动作`,
      detail: "只处理这个来源位置，记下一个结果、例子或未解决问题。",
      estimatedMinutes: coreMinutes,
      sourceRef,
      selectionReason: "按来源顺序推进，控制每天只处理一个核心范围。",
    };
    const optional = index % 2 === 0 && primary ? [{
      title: `整理${range}中的 1 个重点或疑问`,
      detail: "用剩余时间写下简短笔记，不要求额外扩展材料。",
      estimatedMinutes: Math.max(5, Math.min(25, Math.round(budget * 0.2))),
      sourceRef,
      selectionReason: "用低负担整理帮助下一次打开时快速衔接。",
    }] : [];
    return { day: index + 1, coreTask: core, optionalTasks: optional };
  });
  return {
    version: 1,
    goalTitle: text(profile.title, "未命名目标"),
    stageGoals: [
      { stageId: "stage-1", title: "建立基础", description: "按来源目录建立连续推进的起点。", startDay: 1, endDay: Math.max(1, Math.ceil(days / 2)), sourceIds: selectedSourceIds },
      { stageId: "stage-2", title: "形成应用", description: "把来源中的内容转成练习、作品或可复述结果。", startDay: Math.max(2, Math.ceil(days / 2) + 1), endDay: Number(profile.durationDays) || 30, sourceIds: selectedSourceIds },
    ],
    firstWeek,
    weeklyMilestones: [{ week: 1, title: "完成第一周核心范围", outcome: "留下连续的学习记录和下周起点。" }],
    totalEstimatedMinutesFirstWeek: firstWeek.reduce((sum, day) => sum + day.coreTask.estimatedMinutes + day.optionalTasks.reduce((inner, task) => inner + task.estimatedMinutes, 0), 0),
    generatedAt: new Date().toISOString(),
    source: "fallback",
  };
}

function normalizePlan(raw, context, source = "llm") {
  const profile = context.goalProfile || {};
  const sources = context.sources || [];
  const selectedSourceIds = context.selectedSourceIds || sources.map((entry) => entry.sourceId);
  const days = Math.min(7, Math.max(1, Number(profile.durationDays) || 30));
  const rawDays = Array.isArray(raw && raw.firstWeek) ? raw.firstWeek : [];
  const firstWeek = Array.from({ length: days }, (_, index) => {
    const entry = rawDays.find((candidate) => Number(candidate && candidate.day) === index + 1) || rawDays[index] || {};
    const core = normalizeTask(
      entry.coreTask,
      sources,
      selectedSourceIds,
      `推进「${text(profile.title, "当前目标")}」的第 ${index + 1} 个具体范围`,
      Math.max(5, Math.round((Number(profile.dailyBudgetMinutes) || 120) * 0.6)),
      false
    );
    const optionalTasks = (Array.isArray(entry.optionalTasks) ? entry.optionalTasks : [])
      .slice(0, 2)
      .map((task, taskIndex) => normalizeTask(task, sources, selectedSourceIds, `整理今天范围的第 ${taskIndex + 1} 个轻量结果`, 15, true));
    return { day: index + 1, coreTask: core, optionalTasks };
  });
  const rawStages = Array.isArray(raw && raw.stageGoals) ? raw.stageGoals : [];
  const stageGoals = rawStages.slice(0, 6).map((stage, index) => ({
    stageId: text(stage && (stage.stageId || stage.id), `stage-${index + 1}`),
    title: text(stage && stage.title, `阶段 ${index + 1}`),
    description: text(stage && stage.description, "围绕已确认来源持续推进。"),
    startDay: clamp(stage && stage.startDay, 1, Number(profile.durationDays) || 30, index + 1),
    endDay: clamp(stage && stage.endDay, 1, Number(profile.durationDays) || 30, Number(profile.durationDays) || 30),
    sourceIds: (Array.isArray(stage && stage.sourceIds) ? stage.sourceIds : selectedSourceIds).filter((id) => selectedSourceIds.includes(id)),
  }));
  const fallback = buildFallbackPlan(context);
  return {
    version: 1,
    goalTitle: text(raw && raw.goalTitle, fallback.goalTitle),
    stageGoals: stageGoals.length >= 2 ? stageGoals : fallback.stageGoals,
    firstWeek,
    weeklyMilestones: Array.isArray(raw && raw.weeklyMilestones) && raw.weeklyMilestones.length
      ? raw.weeklyMilestones.slice(0, 8).map((milestone, index) => ({
          week: Number(milestone.week) || index + 1,
          title: text(milestone.title, `第 ${index + 1} 周推进`),
          outcome: text(milestone.outcome, "完成本周已确认范围。"),
        }))
      : fallback.weeklyMilestones,
    totalEstimatedMinutesFirstWeek: firstWeek.reduce((sum, day) => sum + day.coreTask.estimatedMinutes + day.optionalTasks.reduce((inner, task) => inner + task.estimatedMinutes, 0), 0),
    generatedAt: new Date().toISOString(),
    source,
  };
}

function validateSourceBoundPlan(plan, context = {}) {
  const issues = [];
  const normalized = normalizePlan(plan, context, plan && plan.source || "llm");
  const profile = context.goalProfile || {};
  const selectedIds = new Set(context.selectedSourceIds || []);
  const sourceById = sourceMap(context.sources || []);
  const budget = clamp(profile.dailyBudgetMinutes, 25, 480, 120);
  if (!Array.isArray(normalized.stageGoals) || normalized.stageGoals.length < 2 || normalized.stageGoals.length > 6) issues.push("STAGE_COUNT");
  if (!Array.isArray(normalized.firstWeek) || normalized.firstWeek.length < 1 || normalized.firstWeek.length > 7) issues.push("FIRST_WEEK_COUNT");
  normalized.firstWeek.forEach((day) => {
    if (!day.coreTask || !day.coreTask.sourceRef) issues.push(`CORE_SOURCE_DAY_${day.day}`);
    if (day.optionalTasks.length > 2) issues.push(`OPTIONAL_COUNT_DAY_${day.day}`);
    const total = day.coreTask.estimatedMinutes + day.optionalTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
    if (total > budget) issues.push(`OVER_BUDGET_DAY_${day.day}`);
    if (day.coreTask.estimatedMinutes > budget * 0.7) issues.push(`CORE_TOO_LONG_DAY_${day.day}`);
    [day.coreTask, ...day.optionalTasks].forEach((task) => {
      if (!task.title || !/[\u4e00-\u9fffA-Za-z]/.test(task.title)) issues.push(`EMPTY_TASK_DAY_${day.day}`);
      if (task.sourceRef && (!selectedIds.has(task.sourceRef.sourceId) || !sourceById.has(task.sourceRef.sourceId))) issues.push(`UNKNOWN_SOURCE_DAY_${day.day}`);
      if (task.sourceRef && task.sourceRef.locatorType !== "URL") {
        const source = sourceById.get(task.sourceRef.sourceId);
        const exists = source && (source.structure || []).some((entry) => entry.locatorLabel === task.sourceRef.locatorLabel);
        if (!exists) issues.push(`UNKNOWN_LOCATOR_DAY_${day.day}`);
      }
    });
  });
  const fingerprints = normalized.firstWeek.map((day) => day.coreTask.title.replace(/[\s「」“”"'，。:：]/g, "").toLowerCase());
  if (new Set(fingerprints).size !== fingerprints.length) issues.push("DUPLICATE_CORE");
  return { valid: issues.length === 0, issues, plan: normalized };
}

function repairSourceBoundPlan(plan, context = {}) {
  const first = validateSourceBoundPlan(plan, context);
  if (first.valid) return { ...first, repairAttempts: 0 };
  const fallback = buildFallbackPlan(context);
  const second = validateSourceBoundPlan(fallback, context);
  return { ...second, repairAttempts: 1, originalIssues: first.issues };
}

async function generateSourceBoundPlan(context = {}, options = {}) {
  const fallback = buildFallbackPlan(context);
  const apiKey = getResolvedApiKey(options.apiKey);
  if (!apiKey) return fallback;
  try {
    const result = await jsonCompletion([
      {
        role: "system",
        content: `你是来源绑定的学习计划教练。只能使用用户已经确认的 sourceId 和其提供的可验证结构，不得新增来源或猜章节。只生成第一周，每天恰好 1 个 coreTask，optionalTasks 最多 2 个；核心任务必须具体、有动作、范围和来源位置。没有可验证目录时 sourceRef.locatorType 必须为 URL，不能猜页码、课时或题号。不得输出分数、正确率、掌握度或必然效果。只返回 JSON：{"goalTitle":"","stageGoals":[{"stageId":"stage-1","title":"","description":"","startDay":1,"endDay":7,"sourceIds":[]}],"firstWeek":[{"day":1,"coreTask":{"title":"","detail":"","estimatedMinutes":25,"sourceRef":{"sourceId":"","locatorType":"CHAPTER|LESSON|SECTION|EXERCISE_SET|URL","locatorLabel":"","locatorUrl":""},"selectionReason":""},"optionalTasks":[]}],"weeklyMilestones":[{"week":1,"title":"","outcome":""}]}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          goalProfile: context.goalProfile,
          selectedSourceIds: context.selectedSourceIds,
          sources: (context.sources || []).map((source) => ({
            sourceId: source.sourceId,
            title: source.title,
            provider: source.provider,
            type: source.type,
            url: source.url,
            structure: source.structure,
            outlineStatus: source.outlineStatus,
          })),
          adjustment: context.adjustment || "",
        }),
      },
    ], { apiKey, temperature: 0.45, maxTokens: 3200, timeoutMs: 20000 });
    const repaired = repairSourceBoundPlan(result, context);
    if (!repaired.valid) return fallback;
    return { ...repaired.plan, source: repaired.repairAttempts ? "fallback" : "llm", planWarnings: repaired.repairAttempts ? ["计划未通过全部检查，已使用规则模板修复。"] : [] };
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  buildFallbackPlan,
  normalizePlan,
  validateSourceBoundPlan,
  repairSourceBoundPlan,
  generateSourceBoundPlan,
};
