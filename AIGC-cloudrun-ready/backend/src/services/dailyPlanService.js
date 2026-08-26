const { jsonCompletion, getResolvedApiKey } = require("./deepseekService");

const DEFAULT_TIME_ZONE = "Asia/Shanghai";
const MAX_DAILY_TASKS = 3;

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function parseDailyMinutes(value, fallback = 120) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  const text = cleanText(value).toLowerCase();
  if (!text) {
    return fallback;
  }

  const hourMatch = text.match(/([\d.]+)\s*(?:小时|hour|hours|h)/i);
  const minuteMatch = text.match(/([\d.]+)\s*(?:分钟|minute|minutes|min)/i);
  let minutes = 0;
  if (hourMatch) {
    minutes += Number(hourMatch[1]) * 60;
  }
  if (minuteMatch) {
    minutes += Number(minuteMatch[1]);
  }
  if (!hourMatch && !minuteMatch) {
    const numeric = Number(text.match(/[\d.]+/)?.[0]);
    if (Number.isFinite(numeric) && numeric > 0) {
      minutes = /hour|h|小时/i.test(text) ? numeric * 60 : numeric;
    }
  }

  return minutes > 0 ? Math.max(5, Math.round(minutes)) : fallback;
}

function getPlanDate(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function selectSequentialTasks(candidates, capacityMinutes, maxTasks = MAX_DAILY_TASKS) {
  const source = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const capacity = Math.max(5, Number(capacityMinutes) || 120);
  const selected = [];
  let usedMinutes = 0;

  for (const task of source) {
    if (selected.length >= Math.max(1, maxTasks)) {
      break;
    }
    const taskMinutes = Math.max(5, Number(task.estimatedMinutes || task.minutes || 20));
    if (selected.length > 0 && usedMinutes + taskMinutes > capacity) {
      break;
    }
    selected.push({ ...task, estimatedMinutes: taskMinutes });
    usedMinutes += taskMinutes;
  }

  return selected;
}

function normalizeGeneratedTasks(rawTasks, selectedTasks, capacityMinutes) {
  const rawById = new Map(
    (Array.isArray(rawTasks) ? rawTasks : [])
      .filter((task) => task && task.stageTaskId)
      .map((task) => [String(task.stageTaskId), task])
  );
  let remainingMinutes = Math.max(5, Number(capacityMinutes) || 120);

  return selectedTasks.map((task) => {
    const generated = rawById.get(String(task.id)) || {};
    const requestedMinutes = Math.max(
      5,
      Number(generated.estimatedMinutes || task.estimatedMinutes || 20)
    );
    const estimatedMinutes = Math.min(
      requestedMinutes,
      Math.max(5, Number(task.estimatedMinutes || 20)),
      Math.max(5, remainingMinutes)
    );
    remainingMinutes = Math.max(0, remainingMinutes - estimatedMinutes);
    return {
      ...task,
      title: cleanText(generated.title, task.title),
      description: cleanText(generated.description || generated.detail, task.description || task.detail),
      detail: cleanText(generated.description || generated.detail, task.description || task.detail),
      estimatedMinutes,
      difficulty: Math.max(1, Math.min(5, Number(generated.difficulty || task.difficulty || 2))),
      narrativeHook: cleanText(generated.narrativeHook, task.narrativeHook),
    };
  });
}

async function generateDailyPlan({
  goalPlan,
  currentStage,
  remainingTasks,
  capacityMinutes,
  planDate,
  apiKey,
}) {
  const selectedTasks = selectSequentialTasks(remainingTasks, capacityMinutes);
  const fallback = {
    message: selectedTasks.length > 0
      ? `已按「${cleanText(currentStage && currentStage.title, "当前阶段")}」的顺序安排今日任务。`
      : "当前阶段的必做任务已全部完成。",
    tasks: selectedTasks,
    source: "RULE",
  };

  if (selectedTasks.length === 0 || !getResolvedApiKey(apiKey)) {
    return fallback;
  }

  try {
    const result = await jsonCompletion(
      [
        {
          role: "system",
          content: `你是长期学习计划的每日任务编排器。只返回 JSON，不要解释。
用户只要标记任务完成即可推进，禁止评估正确率、掌握度或学习质量。
必须保留输入任务的 stageTaskId、数量和顺序，不得跳过前置任务，不得新增任务。
可以把标题和描述改写得更具体、更适合今天执行。所有任务总时长不得超过 capacityMinutes。
格式：{"message":"...","tasks":[{"stageTaskId":"...","title":"...","description":"...","estimatedMinutes":25,"difficulty":2,"narrativeHook":"..."}]}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            planDate,
            longTermGoal: goalPlan && goalPlan.longTermGoal,
            currentStage: currentStage && {
              id: currentStage.id,
              title: currentStage.title,
              description: currentStage.description,
            },
            capacityMinutes,
            tasks: selectedTasks.map((task) => ({
              stageTaskId: task.id,
              title: task.title,
              description: task.description || task.detail,
              estimatedMinutes: task.estimatedMinutes,
              difficulty: task.difficulty,
              narrativeHook: task.narrativeHook,
            })),
          }),
        },
      ],
      {
        apiKey,
        temperature: 0.25,
        maxTokens: 800,
      }
    );

    return {
      message: cleanText(result && result.message, fallback.message),
      tasks: normalizeGeneratedTasks(result && result.tasks, selectedTasks, capacityMinutes),
      source: "AI",
    };
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  DEFAULT_TIME_ZONE,
  MAX_DAILY_TASKS,
  parseDailyMinutes,
  getPlanDate,
  selectSequentialTasks,
  generateDailyPlan,
};
