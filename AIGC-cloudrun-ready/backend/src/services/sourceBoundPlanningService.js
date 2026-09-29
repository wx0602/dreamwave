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
  const detail = text(
    raw && (raw.detail || raw.description),
    source ? "按来源位置完成这项具体行动，并记录一个结果或问题。" : "完成这项具体行动，并记录一个结果或问题。"
  );
  return {
    title,
    detail,
    estimatedMinutes: clamp(raw && raw.estimatedMinutes, 5, optional ? 45 : 90, fallbackMinutes),
    sourceRef,
    selectionReason: text(raw && raw.selectionReason, optional
      ? "用较轻的动作巩固今天的范围。"
      : source ? "这是今天围绕已确认来源推进的一步。" : "这是今天推进目标所需的一步。"),
  };
}

function allocateDailyMinutes(value) {
  const budget = clamp(value, 25, 480, 120);
  const sideEach = Math.max(5, Math.floor(budget * 0.15));
  const mainBudget = Math.max(15, budget - sideEach * 2);
  const base = Math.max(5, Math.floor(mainBudget / 3));
  return { budget, main: [base, base, Math.max(5, mainBudget - base * 2)], sideEach };
}

function buildFallbackPlan(context = {}) {
  const profile = context.goalProfile || {};
  const sources = Array.isArray(context.sources) ? context.sources : [];
  const selectedSourceIds = Array.isArray(context.selectedSourceIds) ? context.selectedSourceIds : sources.map((source) => source.sourceId);
  const primary = sources.find((source) => selectedSourceIds.includes(source.sourceId)) || sources[0];
  const structure = primary && Array.isArray(primary.structure) ? primary.structure : [];
  const days = Math.min(7, Math.max(1, Number(profile.durationDays) || 30));
  const minutes = allocateDailyMinutes(context.dailyBudgetMinutes || profile.dailyBudgetMinutes);
  const firstWeek = Array.from({ length: days }, (_, index) => {
    const locator = structure[index % Math.max(1, structure.length)];
    const sourceRef = primary ? sourceRefFor(primary, locator || {}) : null;
    const target = sourceRef && sourceRef.locatorType !== "URL"
      ? `“${sourceRef.locatorLabel}”`
      : primary
        ? `“${primary.title}”的第 ${index + 1} 个范围`
        : `“${text(profile.title, "当前目标")}”的第 ${index + 1} 个范围`;
    const mainTasks = [
      {
        title: `列出第 ${index + 1} 天${target}的 3 个关键要点`,
        detail: primary ? "阅读或观看对应范围，记录三个最重要的信息。" : "先界定今天要处理的范围，记录三个最重要的信息。",
        estimatedMinutes: minutes.main[0],
        sourceRef,
        selectionReason: "先建立今天继续练习所需的输入。",
      },
      {
        title: `完成第 ${index + 1} 天与${target}有关的 1 项练习或操作`,
        detail: "把刚才的内容用于一道题、一个示例或一个实际操作，并保存结果。",
        estimatedMinutes: minutes.main[1],
        sourceRef,
        selectionReason: "把输入转化为一次实际执行。",
      },
      {
        title: `检查第 ${index + 1} 天${target}的结果并记录 1 个问题`,
        detail: "对照目标检查刚才的结果，写下一处需要继续处理的问题。",
        estimatedMinutes: minutes.main[2],
        sourceRef,
        selectionReason: "用输出检查收束今天的主线。",
      },
    ];
    const sideTasks = [
      {
        title: `整理${target}的完成记录`,
        detail: "归档今天的笔记、答案或作品，方便下次直接继续。",
        estimatedMinutes: minutes.sideEach,
        sourceRef,
        selectionReason: "用轻量整理保持连续性。",
      },
      {
        title: "写下明天开始后的第一个动作",
        detail: "记录一个未解决问题，以及明天打开任务后立刻要做的动作。",
        estimatedMinutes: minutes.sideEach,
        sourceRef,
        selectionReason: "减少明天重新开始时的决策成本。",
      },
    ];
    return { day: index + 1, mainTasks, sideTasks };
  });
  const sourceDescription = primary ? "按来源目录建立连续推进的起点。" : "从目标范围和当前基础建立连续推进的起点。";
  return {
    version: 2,
    goalTitle: text(profile.title, "未命名目标"),
    stageGoals: [
      { stageId: "stage-1", title: "建立基础", description: sourceDescription, startDay: 1, endDay: Math.max(1, Math.ceil(days / 2)), sourceIds: selectedSourceIds },
      { stageId: "stage-2", title: "形成应用", description: primary ? "把来源中的内容转成练习、作品或可复述结果。" : "把已整理的内容转成练习、作品或可复述结果。", startDay: Math.max(2, Math.ceil(days / 2) + 1), endDay: Number(profile.durationDays) || 30, sourceIds: selectedSourceIds },
    ],
    firstWeek,
    weeklyMilestones: [{ week: 1, title: "完成第一周核心范围", outcome: "留下连续的学习记录和下周起点。" }],
    totalEstimatedMinutesFirstWeek: firstWeek.reduce((sum, day) => sum
      + day.mainTasks.reduce((inner, task) => inner + task.estimatedMinutes, 0)
      + day.sideTasks.reduce((inner, task) => inner + task.estimatedMinutes, 0), 0),
    generatedAt: new Date().toISOString(),
    source: "fallback",
    sourceMode: primary ? "SELECTED" : "SKIPPED",
  };
}

function normalizePlan(raw, context, source = "llm") {
  const profile = context.goalProfile || {};
  const sources = context.sources || [];
  const selectedSourceIds = context.selectedSourceIds || sources.map((entry) => entry.sourceId);
  const days = Math.min(7, Math.max(1, Number(profile.durationDays) || 30));
  const rawDays = Array.isArray(raw && raw.firstWeek) ? raw.firstWeek : [];
  const dailyMinutes = allocateDailyMinutes(profile.dailyBudgetMinutes);
  const firstWeek = Array.from({ length: days }, (_, index) => {
    const entry = rawDays.find((candidate) => Number(candidate && candidate.day) === index + 1) || rawDays[index] || {};
    const rawMain = Array.isArray(entry.mainTasks) ? entry.mainTasks : entry.coreTask ? [entry.coreTask] : [];
    const mainFallbacks = [
      `列出「${text(profile.title, "当前目标")}」今天范围的 3 个要点`,
      `完成 1 项「${text(profile.title, "当前目标")}」练习或操作`,
      `检查「${text(profile.title, "当前目标")}」的结果并记录 1 个问题`,
    ];
    const mainTasks = Array.from({ length: 3 }, (_, taskIndex) => normalizeTask(
      rawMain[taskIndex],
      sources,
      selectedSourceIds,
      mainFallbacks[taskIndex],
      dailyMinutes.main[taskIndex],
      false
    ));
    const rawSide = Array.isArray(entry.sideTasks)
      ? entry.sideTasks : Array.isArray(entry.optionalTasks) ? entry.optionalTasks : [];
    const sideFallbacks = ["整理今天的完成记录", "写下明天开始后的第一个动作"];
    const sideTasks = Array.from({ length: 2 }, (_, taskIndex) => normalizeTask(
      rawSide[taskIndex],
      sources,
      selectedSourceIds,
      sideFallbacks[taskIndex],
      dailyMinutes.sideEach,
      true
    ));
    return { day: index + 1, mainTasks, sideTasks };
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
    version: 2,
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
    totalEstimatedMinutesFirstWeek: firstWeek.reduce((sum, day) => sum
      + day.mainTasks.reduce((inner, task) => inner + task.estimatedMinutes, 0)
      + day.sideTasks.reduce((inner, task) => inner + task.estimatedMinutes, 0), 0),
    generatedAt: new Date().toISOString(),
    source,
    sourceMode: selectedSourceIds.length ? "SELECTED" : "SKIPPED",
  };
}

function validateSourceBoundPlan(plan, context = {}) {
  const issues = [];
  const normalized = normalizePlan(plan, context, plan && plan.source || "llm");
  const profile = context.goalProfile || {};
  const selectedIds = new Set(context.selectedSourceIds || []);
  const sourceById = sourceMap(context.sources || []);
  const budget = clamp(profile.dailyBudgetMinutes, 25, 480, 120);
  const rawDays = Array.isArray(plan && plan.firstWeek) ? plan.firstWeek : [];
  if (!Array.isArray(normalized.stageGoals) || normalized.stageGoals.length < 2 || normalized.stageGoals.length > 6) issues.push("STAGE_COUNT");
  if (!Array.isArray(normalized.firstWeek) || normalized.firstWeek.length < 1 || normalized.firstWeek.length > 7) issues.push("FIRST_WEEK_COUNT");
  normalized.firstWeek.forEach((day, dayIndex) => {
    const rawDay = rawDays.find((entry) => Number(entry && entry.day) === Number(day.day)) || rawDays[dayIndex] || {};
    const rawMain = Array.isArray(rawDay.mainTasks) ? rawDay.mainTasks : rawDay.coreTask ? [rawDay.coreTask] : [];
    const rawSide = Array.isArray(rawDay.sideTasks) ? rawDay.sideTasks : Array.isArray(rawDay.optionalTasks) ? rawDay.optionalTasks : [];
    if (rawMain.length !== 3) issues.push(`MAIN_COUNT_DAY_${day.day}`);
    if (rawSide.length !== 2) issues.push(`SIDE_COUNT_DAY_${day.day}`);
    if (day.mainTasks.length !== 3) issues.push(`NORMALIZED_MAIN_COUNT_DAY_${day.day}`);
    if (day.sideTasks.length !== 2) issues.push(`NORMALIZED_SIDE_COUNT_DAY_${day.day}`);
    const total = [...day.mainTasks, ...day.sideTasks].reduce((sum, task) => sum + task.estimatedMinutes, 0);
    if (total > budget) issues.push(`OVER_BUDGET_DAY_${day.day}`);
    day.mainTasks.forEach((task, taskIndex) => {
      const rawTask = rawMain[taskIndex] || {};
      const rawSourceId = text(rawTask.sourceRef && rawTask.sourceRef.sourceId);
      const rawTitle = text(rawTask.title);
      const rawDetail = text(rawTask.detail || rawTask.description);
      if (selectedIds.size && (!rawSourceId || !selectedIds.has(rawSourceId) || !sourceById.has(rawSourceId))) {
        issues.push(`RAW_MAIN_SOURCE_DAY_${day.day}_${taskIndex + 1}`);
      }
      if (/^(学习一下|继续学习|完成任务|看一看|练习一下|复习)$/i.test(rawTitle)) issues.push(`VAGUE_MAIN_DAY_${day.day}_${taskIndex + 1}`);
      const source = sourceById.get(rawSourceId);
      const verifiedLocator = rawTask.sourceRef && rawTask.sourceRef.locatorType !== "URL"
        && source && (source.structure || []).some((entry) => entry.locatorLabel === text(rawTask.sourceRef.locatorLabel));
      const hasScope = verifiedLocator || /\d+|章|节|课|页|题|段|模块|单元|章节|要点|结果|问题|练习|操作|lesson|chapter|section|module/i.test(`${rawTitle} ${rawDetail}`);
      const hasAction = /完成|列出|检查|阅读|观看|练习|编写|实现|整理|总结|分析|复述|记录|解决|制作|搭建|测试|read|watch|write|build|practice|summarize|implement|review/i.test(`${rawTitle} ${rawDetail}`);
      if (!hasScope || !hasAction) issues.push(`MAIN_NOT_SPECIFIC_DAY_${day.day}_${taskIndex + 1}`);
      if (selectedIds.size && (!task.sourceRef || !task.sourceRef.sourceId)) issues.push(`MAIN_SOURCE_DAY_${day.day}_${taskIndex + 1}`);
    });
    [...day.mainTasks, ...day.sideTasks].forEach((task) => {
      if (!task.title || !/[\u4e00-\u9fffA-Za-z]/.test(task.title)) issues.push(`EMPTY_TASK_DAY_${day.day}`);
      if (task.sourceRef && (!selectedIds.has(task.sourceRef.sourceId) || !sourceById.has(task.sourceRef.sourceId))) issues.push(`UNKNOWN_SOURCE_DAY_${day.day}`);
      if (task.sourceRef && task.sourceRef.locatorType !== "URL") {
        const source = sourceById.get(task.sourceRef.sourceId);
        const exists = source && (source.structure || []).some((entry) => entry.locatorLabel === task.sourceRef.locatorLabel);
        if (!exists) issues.push(`UNKNOWN_LOCATOR_DAY_${day.day}`);
      }
    });
  });
  const fingerprints = normalized.firstWeek.flatMap((day) => day.mainTasks)
    .map((task) => task.title.replace(/[\s「」“”"'，。:：]/g, "").toLowerCase());
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
  const hasSelectedSources = Array.isArray(context.selectedSourceIds) && context.selectedSourceIds.length > 0;
  try {
    const result = await jsonCompletion([
      {
        role: "system",
        content: hasSelectedSources
          ? `你是学习计划教练。只能使用用户已经确认的 sourceId 和其提供的可验证结构，不得新增来源或猜章节。只生成第一周，每天恰好 3 个 mainTasks 和 2 个 sideTasks；三条主线依次承担学习输入、练习执行、输出验证，但标题不得出现这些系统术语。每项任务必须具体、有动作、范围和来源位置。没有可验证目录时 sourceRef.locatorType 必须为 URL，不能猜页码、课时或题号。五项任务总时长不得超过每日预算。不得输出分数、正确率、掌握度或必然效果。只返回 JSON：{"goalTitle":"","stageGoals":[{"stageId":"stage-1","title":"","description":"","startDay":1,"endDay":7,"sourceIds":[]}],"firstWeek":[{"day":1,"mainTasks":[{"title":"","detail":"","estimatedMinutes":25,"sourceRef":{"sourceId":"","locatorType":"CHAPTER|LESSON|SECTION|EXERCISE_SET|URL","locatorLabel":"","locatorUrl":""},"selectionReason":""}],"sideTasks":[{"title":"","detail":"","estimatedMinutes":10,"sourceRef":{"sourceId":"","locatorType":"URL","locatorLabel":"","locatorUrl":""},"selectionReason":""}]}],"weeklyMilestones":[{"week":1,"title":"","outcome":""}]}`
          : `你是学习计划教练。用户选择暂不绑定学习资料。只根据目标、当前基础、期限和每日时间生成第一周计划，每天恰好 3 个 mainTasks 和 2 个 sideTasks；三条主线依次承担学习输入、练习执行、输出验证，但标题不得出现这些系统术语。任务必须具体、有动作、数量或范围；不得虚构教材、课程、章节、页码、题号、链接或用户已有成果，所有 sourceRef 必须为 null。五项任务总时长不得超过每日预算。不得输出分数、正确率、掌握度或必然效果。只返回 JSON：{"goalTitle":"","stageGoals":[{"stageId":"stage-1","title":"","description":"","startDay":1,"endDay":7,"sourceIds":[]}],"firstWeek":[{"day":1,"mainTasks":[{"title":"","detail":"","estimatedMinutes":25,"sourceRef":null,"selectionReason":""}],"sideTasks":[{"title":"","detail":"","estimatedMinutes":10,"sourceRef":null,"selectionReason":""}]}],"weeklyMilestones":[{"week":1,"title":"","outcome":""}]}`,
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
