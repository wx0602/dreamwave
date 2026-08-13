const { jsonCompletion, getResolvedApiKey } = require("./deepseekService");

const GOAL_LEVELS = Object.freeze({
  LONG_TERM: "LONG_TERM",
  STAGE_GOAL: "STAGE_GOAL",
  DAILY_TASK: "DAILY_TASK",
  AMBIGUOUS: "AMBIGUOUS",
});

const REPLAN_REASONS = Object.freeze({
  TOO_HARD: "TOO_HARD",
  TOO_EASY: "TOO_EASY",
  NO_TIME: "NO_TIME",
  INTERRUPTED: "INTERRUPTED",
  IRRELEVANT: "IRRELEVANT",
  CHANGE_DIRECTION: "CHANGE_DIRECTION",
});

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function classifyGoalFallback(inputText) {
  const text = cleanText(inputText).toLowerCase();
  if (!text) {
    return GOAL_LEVELS.AMBIGUOUS;
  }

  if (/今天|今日|今晚|上午|下午|复习|整理|完成|做完|背诵/.test(text) && text.length <= 28) {
    return GOAL_LEVELS.DAILY_TASK;
  }
  if (/自律|变好|提升自己|成长|努力|坚持|不拖延/.test(text)) {
    return GOAL_LEVELS.AMBIGUOUS;
  }
  if (/\d+\s*(天|周|个月)|阶段|学完|刷完|掌握/.test(text)) {
    return GOAL_LEVELS.STAGE_GOAL;
  }
  if (/考研|考试|备考|转行|求职|毕业|长期|一年|半年|雅思|托福|考公/.test(text)) {
    return GOAL_LEVELS.LONG_TERM;
  }
  return text.length <= 12 ? GOAL_LEVELS.AMBIGUOUS : GOAL_LEVELS.STAGE_GOAL;
}

function generateClarifyingQuestionsFallback(goalText) {
  const goal = cleanText(goalText, "这个目标");
  return [
    `你希望“${goal}”最终达成到什么可验证程度？`,
    "距离关键节点或截止日期还有多久？",
    "你每天大约能稳定投入几小时？",
    "当前最薄弱、最容易卡住的部分是什么？",
    "你想要稳健计划，还是更偏冲刺的计划？",
  ].map((question, index) => ({
    id: `question-${index + 1}`,
    question,
    answer: "",
  }));
}

function buildTask(title, description, difficulty, estimatedMinutes, rewardGrowth, rewardResource, narrativeHook) {
  return {
    title,
    description,
    detail: description,
    difficulty,
    estimatedMinutes,
    estimate: `${estimatedMinutes} 分钟`,
    rewardGrowth,
    rewardResource,
    narrativeHook,
  };
}

function buildComputerOrganizationStages() {
  return [
    {
      title: "数据表示与运算器基础",
      description: "理解原码、反码、补码、定点数、浮点数与基础运算规则。",
      tasks: [
        buildTask(
          "整理原码、反码、补码概念",
          "用自己的话总结三种编码方式，并各举一个正数和负数例子。",
          2,
          25,
          16,
          18,
          "你将在浮空荒野中修复第一段数据碑文。"
        ),
        buildTask(
          "画出补码加减法流程",
          "手写 2 道补码加法和 2 道补码减法，标出符号位与溢出判断。",
          3,
          30,
          18,
          20,
          "运算器核心的蓝色齿轮开始重新咬合。"
        ),
        buildTask(
          "复盘浮点数规格化规则",
          "整理阶码、尾数、规格化和舍入的 4 个关键点。",
          3,
          25,
          16,
          18,
          "你点亮了空港上方的浮点星图。"
        ),
      ],
    },
    {
      title: "存储系统与指令系统",
      description: "掌握 Cache、主存、总线、指令格式与寻址方式。",
      tasks: [
        buildTask(
          "梳理 Cache 命中流程",
          "画出一次访存从地址拆分到命中判断的流程图。",
          3,
          30,
          18,
          20,
          "补给线的缓存水晶开始稳定供能。"
        ),
      ],
    },
    {
      title: "CPU 控制与综合刷题",
      description: "建立数据通路、控制器与综合题解题框架。",
      tasks: [
        buildTask(
          "拆解一道 CPU 数据通路题",
          "标出指令周期、关键寄存器变化和控制信号。",
          4,
          35,
          20,
          22,
          "你进入了浮空荒野的中央控制塔。"
        ),
      ],
    },
  ];
}

function buildDefaultStages(goalText) {
  const goal = cleanText(goalText, "当前目标");
  return [
    {
      title: "目标澄清与最小行动",
      description: `把“${goal}”拆成今天能开始的稳定行动。`,
      tasks: [
        buildTask(
          "写下目标完成标准",
          "用 3 句话说明完成这个目标时你能做到什么。",
          1,
          15,
          12,
          14,
          "你在冒险地图边缘写下第一枚坐标。"
        ),
        buildTask(
          "完成一次高专注行动块",
          "选择一个最小任务，连续投入 25 分钟。",
          2,
          25,
          16,
          18,
          "第一段补给线被点亮。"
        ),
        buildTask(
          "输出今日复盘摘要",
          "记录完成了什么、卡在哪里、下一步是什么。",
          1,
          15,
          12,
          12,
          "你的行动被写入旅途日志。"
        ),
      ],
    },
    {
      title: "稳定节奏建立",
      description: "把行动节奏固定下来，减少每天重新决策的成本。",
      tasks: [
        buildTask(
          "安排明日行动块",
          "提前选定明天的 1 个核心任务和开始时间。",
          1,
          10,
          10,
          12,
          "补给队获得了下一段路线。"
        ),
      ],
    },
  ];
}

function generateGoalPlanFallback(goalText, answers = []) {
  const goalLevel = classifyGoalFallback(goalText);
  const longTermGoal = cleanText(goalText, "备考计算机组成原理");
  const stages = /计算机组成|组成原理|补码|运算器|cache/i.test(longTermGoal)
    ? buildComputerOrganizationStages()
    : buildDefaultStages(longTermGoal);

  return {
    id: "",
    longTermGoal,
    goalLevel,
    currentStageId: "",
    clarifyingQuestions: Array.isArray(answers) ? answers : [],
    stageGoals: stages.map((stage) => ({
      id: "",
      title: stage.title,
      description: stage.description,
      progress: 0,
      status: "NOT_STARTED",
      tasks: stage.tasks,
    })),
    createdAt: "",
    updatedAt: "",
  };
}

function splitTask(task) {
  const title = cleanText(task && task.title, "当前任务");
  const baseMinutes = Math.max(10, Number(task && task.estimatedMinutes ? task.estimatedMinutes : 25));
  const smallMinutes = Math.max(10, Math.min(20, Math.round(baseMinutes / 2)));
  return [
    buildTask(
      `${title}：先读懂要求`,
      "只处理材料、题干或知识点定义，圈出 2 个关键词。",
      1,
      smallMinutes,
      8,
      10,
      "你先清理道路入口的薄雾。"
    ),
    buildTask(
      `${title}：完成一个最小例子`,
      "做 1 个代表性例子，记录关键步骤。",
      2,
      smallMinutes,
      10,
      12,
      "第一块符文石被重新点亮。"
    ),
    buildTask(
      `${title}：用一句话复盘`,
      "写下这一步最重要的结论和仍然不确定的问题。",
      1,
      10,
      8,
      8,
      "你的复盘被写入随身卷轴。"
    ),
  ];
}

function replanTasksFallback(goalPlan, reason, userContext = {}) {
  const task = userContext.task || {};
  const currentStageTitle = cleanText(userContext.currentStageTitle, "当前阶段");

  if (reason === REPLAN_REASONS.TOO_HARD) {
    return {
      mode: "replace_task",
      tasks: splitTask(task),
      message: "已把任务拆成 3 个更小的行动块。",
    };
  }

  if (reason === REPLAN_REASONS.NO_TIME) {
    return {
      mode: "replace_today",
      tasks: [
        buildTask(
          `${currentStageTitle}：15 分钟低压力推进`,
          "只做一个最小动作：读一页、写三行笔记，或完成一道例题的第一步。",
          1,
          15,
          8,
          8,
          "补给线改走轻装路线，今天只需守住火种。"
        ),
      ],
      message: "已降低今日强度，预计不超过 15 分钟。",
    };
  }

  if (reason === REPLAN_REASONS.TOO_EASY) {
    return {
      mode: "replace_task",
      tasks: [
        buildTask(
          `${cleanText(task.title, currentStageTitle)}：提高难度挑战`,
          "在完成原任务基础上，补充 1 个迁移例子或 1 道综合题。",
          3,
          Math.max(25, Number(task.estimatedMinutes || 20) + 10),
          18,
          20,
          "你选择绕行更高的浮空阶梯，获得更强回响。"
        ),
      ],
      message: "已提升任务挑战度。",
    };
  }

  if (reason === REPLAN_REASONS.INTERRUPTED) {
    return {
      mode: "replace_today",
      tasks: [
        buildTask(
          "温和重启：找回目标地图",
          "浏览当前阶段目标，只标记一个今天愿意继续的小点。",
          1,
          10,
          8,
          8,
          "远征队没有重置旅程，只是在营地重新点火。"
        ),
        buildTask(
          "温和重启：完成一个 15 分钟行动",
          "选择最容易开始的一步，计时 15 分钟即可结束。",
          1,
          15,
          10,
          10,
          "旧路线被保留，新的脚印从这里接上。"
        ),
      ],
      message: "已生成温和重启计划，保留原目标和成长记录。",
    };
  }

  if (reason === REPLAN_REASONS.IRRELEVANT) {
    return {
      mode: "replace_task",
      tasks: [
        buildTask(
          `${currentStageTitle}：换成贴合目标的小任务`,
          "回到当前阶段目标，完成 1 个直接相关的概念整理或例题。",
          2,
          20,
          12,
          14,
          "偏离的路标被移除，补给线重新指向主线。"
        ),
      ],
      message: "已替换为更贴合当前阶段的任务。",
    };
  }

  return {
    mode: "change_direction",
    plan: generateGoalPlanFallback(cleanText(userContext.newGoal, goalPlan && goalPlan.longTermGoal)),
    tasks: [],
    message: "已准备重新规划阶段目标。",
  };
}

function generateNextSuggestionFallback(goalPlan, completedTask, userStats) {
  const stage = goalPlan && Array.isArray(goalPlan.stageGoals)
    ? goalPlan.stageGoals.find((item) => item && item.id === goalPlan.currentStageId) || goalPlan.stageGoals[0]
    : null;
  const stageTitle = cleanText(stage && stage.title, "当前阶段");
  const growth = Number(userStats && userStats.growthValue ? userStats.growthValue : userStats && userStats.growth ? userStats.growth : 0);
  const completedTitle = cleanText(completedTask && completedTask.title, "刚完成的任务");
  if (growth >= 80) {
    return `围绕「${stageTitle}」做 1 道稍有综合度的练习，检验「${completedTitle}」是否真正掌握。`;
  }
  return `围绕「${stageTitle}」复盘 1 个关键概念，并把「${completedTitle}」延伸成一个 15 分钟小任务。`;
}

function hasApiKey(options = {}) {
  return Boolean(getResolvedApiKey(options.apiKey));
}

function isGoalLevel(value) {
  return Object.prototype.hasOwnProperty.call(GOAL_LEVELS, value);
}

function normalizeQuestionList(raw, fallback) {
  const source = Array.isArray(raw) ? raw : raw && Array.isArray(raw.questions) ? raw.questions : [];
  const questions = source
    .map((item, index) => {
      const question = typeof item === "string" ? item : item && item.question;
      const text = cleanText(question);
      if (!text) {
        return null;
      }
      return {
        id: cleanText(item && item.id, `question-${index + 1}`),
        question: text,
        answer: cleanText(item && item.answer),
      };
    })
    .filter(Boolean)
    .slice(0, 5);
  return questions.length > 0 ? questions : fallback;
}

function normalizeTaskList(rawTasks) {
  if (!Array.isArray(rawTasks)) {
    return [];
  }
  return rawTasks
    .map((task, index) => {
      const title = cleanText(task && task.title);
      if (!title) {
        return null;
      }
      const estimatedMinutes = Math.max(5, Number(task.estimatedMinutes || task.minutes || 20));
      return buildTask(
        title,
        cleanText(task.description || task.detail, "按当前阶段目标完成一个清晰的小步骤。"),
        Math.max(1, Math.min(5, Number(task.difficulty || 2))),
        estimatedMinutes,
        Math.max(1, Number(task.rewardGrowth || 12 + index * 2)),
        Math.max(1, Number(task.rewardResource || 14 + index * 2)),
        cleanText(task.narrativeHook, "新的路线在浮空荒野中亮起。")
      );
    })
    .filter(Boolean);
}

function normalizeGoalPlan(raw, fallback) {
  if (!raw || typeof raw !== "object") {
    return fallback;
  }
  const rawStages = Array.isArray(raw.stageGoals) ? raw.stageGoals : [];
  const stageGoals = rawStages
    .map((stage) => {
      const title = cleanText(stage && stage.title);
      if (!title) {
        return null;
      }
      const tasks = normalizeTaskList(stage.tasks);
      return {
        id: cleanText(stage.id),
        title,
        description: cleanText(stage.description, "围绕长期目标推进的阶段任务。"),
        progress: Math.max(0, Math.min(100, Number(stage.progress || 0))),
        status: cleanText(stage.status, "NOT_STARTED"),
        tasks,
      };
    })
    .filter(Boolean);

  if (stageGoals.length === 0 || stageGoals.every((stage) => stage.tasks.length === 0)) {
    return fallback;
  }

  const goalLevel = isGoalLevel(raw.goalLevel) ? raw.goalLevel : fallback.goalLevel;
  return {
    id: cleanText(raw.id),
    longTermGoal: cleanText(raw.longTermGoal, fallback.longTermGoal),
    goalLevel,
    currentStageId: cleanText(raw.currentStageId),
    clarifyingQuestions: normalizeQuestionList(raw.clarifyingQuestions, fallback.clarifyingQuestions || []),
    stageGoals,
    createdAt: cleanText(raw.createdAt),
    updatedAt: cleanText(raw.updatedAt),
  };
}

async function classifyGoal(inputText, options = {}) {
  const fallback = classifyGoalFallback(inputText);
  if (!hasApiKey(options)) {
    return fallback;
  }
  try {
    const result = await jsonCompletion(
      [
        {
          role: "system",
          content:
            "你是任务织梦师的目标粒度识别器。只返回 JSON：{\"goalLevel\":\"LONG_TERM|STAGE_GOAL|DAILY_TASK|AMBIGUOUS\"}。",
        },
        {
          role: "user",
          content: `用户目标：${cleanText(inputText)}`,
        },
      ],
      {
        apiKey: options.apiKey,
        temperature: 0.1,
        maxTokens: 120,
      }
    );
    return result && isGoalLevel(result.goalLevel) ? result.goalLevel : fallback;
  } catch (error) {
    return fallback;
  }
}

async function generateClarifyingQuestions(goalText, options = {}) {
  const fallback = generateClarifyingQuestionsFallback(goalText);
  if (!hasApiKey(options)) {
    return fallback;
  }
  try {
    const result = await jsonCompletion(
      [
        {
          role: "system",
          content:
            "你是任务织梦师的目标澄清助手。针对过大或模糊目标生成 3 到 5 个必要澄清问题。只返回 JSON：{\"questions\":[{\"id\":\"q1\",\"question\":\"...\",\"answer\":\"\"}]}。",
        },
        {
          role: "user",
          content: `用户目标：${cleanText(goalText)}`,
        },
      ],
      {
        apiKey: options.apiKey,
        temperature: 0.4,
        maxTokens: 420,
      }
    );
    return normalizeQuestionList(result, fallback);
  } catch (error) {
    return fallback;
  }
}

async function generateGoalPlan(goalText, answers = [], options = {}) {
  const fallback = generateGoalPlanFallback(goalText, answers);
  if (!hasApiKey(options)) {
    return fallback;
  }
  try {
    const result = await jsonCompletion(
      [
        {
          role: "system",
          content: `你是任务织梦师的 AI 动态目标编排系统。必须输出稳定 JSON，不要解释。
格式：
{
  "goalLevel": "LONG_TERM|STAGE_GOAL|DAILY_TASK|AMBIGUOUS",
  "longTermGoal": "字符串",
  "currentStage": "字符串",
  "stageGoals": [
    {
      "title": "字符串",
      "description": "字符串",
      "progress": 0,
      "status": "NOT_STARTED|IN_PROGRESS|DONE",
      "tasks": [
        {
          "title": "字符串",
          "description": "字符串",
          "difficulty": 1,
          "estimatedMinutes": 25,
          "rewardGrowth": 16,
          "rewardResource": 18,
          "narrativeHook": "轻幻想剧情钩子"
        }
      ]
    }
  ]
}
约束：阶段目标 2 到 4 个；第一个阶段提供 2 到 3 个今日任务；任务必须挂载到阶段目标下；任务要具体、可执行、贴合目标。`,
        },
        {
          role: "user",
          content: `用户目标：${cleanText(goalText)}
澄清回答：${JSON.stringify(answers || [])}`,
        },
      ],
      {
        apiKey: options.apiKey,
        temperature: 0.5,
        maxTokens: 1100,
      }
    );
    return normalizeGoalPlan(result, fallback);
  } catch (error) {
    return fallback;
  }
}

async function replanTasks(goalPlan, reason, userContext = {}, options = {}) {
  const fallback = replanTasksFallback(goalPlan, reason, userContext);
  if (!hasApiKey(options)) {
    return fallback;
  }
  try {
    const result = await jsonCompletion(
      [
        {
          role: "system",
          content: `你是任务织梦师的动态重规划器。根据原因调整短期任务，不删除已完成任务和日志。只返回 JSON：
{
  "mode": "replace_task|replace_today|change_direction",
  "message": "字符串",
  "tasks": [
    {
      "title": "字符串",
      "description": "字符串",
      "difficulty": 1,
      "estimatedMinutes": 15,
      "rewardGrowth": 8,
      "rewardResource": 8,
      "narrativeHook": "字符串"
    }
  ],
  "plan": null
}
规则：TOO_HARD 拆成 2 到 3 个更小任务；NO_TIME 只生成 1 个不超过 15 分钟任务；INTERRUPTED 生成温和重启；IRRELEVANT 替换为更相关任务；TOO_EASY 提高难度或合并；CHANGE_DIRECTION 可返回新的 plan。`,
        },
        {
          role: "user",
          content: JSON.stringify({
            reason,
            goalPlan,
            userContext,
          }),
        },
      ],
      {
        apiKey: options.apiKey,
        temperature: 0.45,
        maxTokens: 900,
      }
    );
    const tasks = normalizeTaskList(result && result.tasks);
    if (!result || (tasks.length === 0 && reason !== REPLAN_REASONS.CHANGE_DIRECTION)) {
      return fallback;
    }
    return {
      mode: cleanText(result.mode, fallback.mode),
      message: cleanText(result.message, fallback.message),
      tasks,
      plan: result.plan ? normalizeGoalPlan(result.plan, fallback.plan || generateGoalPlanFallback(goalPlan && goalPlan.longTermGoal)) : null,
    };
  } catch (error) {
    return fallback;
  }
}

async function generateNextSuggestion(goalPlan, completedTask, userStats, options = {}) {
  const fallback = generateNextSuggestionFallback(goalPlan, completedTask, userStats);
  if (!hasApiKey(options)) {
    return fallback;
  }
  try {
    const result = await jsonCompletion(
      [
        {
          role: "system",
          content:
            "你是任务织梦师的下一步建议生成器。根据长期目标、当前阶段、已完成任务和用户成长值，生成一个可转成今日任务的建议。只返回 JSON：{\"suggestion\":\"...\"}。",
        },
        {
          role: "user",
          content: JSON.stringify({ goalPlan, completedTask, userStats }),
        },
      ],
      {
        apiKey: options.apiKey,
        temperature: 0.45,
        maxTokens: 260,
      }
    );
    return cleanText(result && result.suggestion, fallback);
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  GOAL_LEVELS,
  REPLAN_REASONS,
  classifyGoal,
  generateClarifyingQuestions,
  generateGoalPlan,
  replanTasks,
  generateNextSuggestion,
};
