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

  if (/考研|考试|备考|转行|求职|毕业|长期|一年|半年|雅思|托福|考公/.test(text)) {
    return GOAL_LEVELS.LONG_TERM;
  }
  const durationMatch = text.match(/(\d+)\s*(天|周|个月|月)/);
  if (durationMatch) {
    const amount = Number(durationMatch[1]);
    const unit = durationMatch[2];
    if (unit !== "天" || amount >= 14) {
      return GOAL_LEVELS.LONG_TERM;
    }
  }
  if (/今天|今日|今晚|上午|下午|整理|完成|做完|背诵/.test(text) && text.length <= 28) {
    return GOAL_LEVELS.DAILY_TASK;
  }
  if (/自律|变好|提升自己|成长|努力|坚持|不拖延/.test(text)) {
    return GOAL_LEVELS.AMBIGUOUS;
  }
  if (/\d+\s*(天|周|个月)|阶段|学完|刷完|掌握/.test(text)) {
    return GOAL_LEVELS.STAGE_GOAL;
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
        buildTask(
          "完成一次稳定行动块",
          "按预定时间完成一个 25 分钟行动块，并记录实际开始时间。",
          2,
          25,
          14,
          16,
          "第二段稳定航线开始持续发光。"
        ),
        buildTask(
          "记录一次阻力并调整计划",
          "写下本轮最明显的阻力，并把下一项任务调整得更容易开始。",
          2,
          15,
          12,
          14,
          "你重新校准了偏移的行动罗盘。"
        ),
      ],
    },
    {
      title: "核心能力巩固",
      description: `围绕“${goal}”完成练习、输出与薄弱点修补。`,
      tasks: [
        buildTask(
          "完成一个代表性练习",
          "选择最能代表当前目标的一项练习或实际操作并完成。",
          3,
          30,
          18,
          20,
          "核心星轨在一次真实演练中稳定下来。"
        ),
        buildTask(
          "修补一个薄弱环节",
          "找出当前最容易出错或中断的部分，进行一次针对性练习。",
          3,
          25,
          18,
          18,
          "星图上最暗的一处缺口被重新点亮。"
        ),
        buildTask(
          "输出阶段成果",
          "用笔记、讲解、作品或测试结果呈现这一阶段的真实成果。",
          3,
          30,
          20,
          20,
          "阶段成果凝结成了可被保存的星宿。"
        ),
      ],
    },
    {
      title: "综合验证与收束",
      description: `回到“${goal}”的完成标准，验证结果并整理后续行动。`,
      tasks: [
        buildTask(
          "对照目标完成标准",
          "逐项检查最初写下的完成标准，标出已达到和仍未达到的部分。",
          2,
          20,
          16,
          18,
          "最初的坐标与当前星图重新重合。"
        ),
        buildTask(
          "完成一次综合验证",
          "通过综合练习、模拟测试或实际输出验证整体完成情况。",
          4,
          35,
          22,
          22,
          "整片星域接受了最后一次航行校验。"
        ),
        buildTask(
          "整理最终总结与保持计划",
          "总结有效方法、遗留问题，并写下之后如何保持成果。",
          2,
          20,
          18,
          18,
          "星域完成收束，同时留下下一次启程的航标。"
        ),
      ],
    },
  ];
}

function buildPostgraduateMathStages() {
  const stage = (title, description, taskTitles) => ({
    title,
    description,
    tasks: taskTitles.map((taskTitle, index) =>
      buildTask(
        taskTitle,
        "按顺序完成「" + taskTitle + "」的知识梳理、例题和基础练习。",
        Math.min(4, 2 + Math.floor(index / 2)),
        index === taskTitles.length - 1 ? 30 : 25,
        14 + index * 2,
        16 + index * 2,
        "高数路线的「" + taskTitle + "」节点被点亮。"
      )
    ),
  });

  return [
    stage("函数、极限与连续", "完成高等数学的极限与连续基础模块。", [
      "梳理函数与数列极限",
      "完成等价无穷小专项",
      "完成洛必达法则专项",
      "完成连续与间断点整理",
    ]),
    stage("导数、微分与中值定理", "按知识依赖顺序推进一元微分学。", [
      "学习导数定义与基本公式",
      "完成微分与高阶导数练习",
      "梳理微分中值定理",
      "完成导数应用题",
    ]),
    stage("一元函数积分", "从不定积分进入定积分及其应用。", [
      "完成不定积分基本方法",
      "完成换元与分部积分专项",
      "学习定积分性质与计算",
      "完成定积分应用题",
    ]),
    stage("多元微积分、微分方程与级数", "完成高数后续模块并进入综合整理。", [
      "完成多元函数微分学",
      "完成重积分专项",
      "完成微分方程专项",
      "完成无穷级数专项",
      "完成高数综合复盘",
    ]),
  ];
}

function generateGoalPlanFallback(goalText, answers = []) {
  const goalLevel = classifyGoalFallback(goalText);
  const longTermGoal = cleanText(goalText, "备考计算机组成原理");
  let stages;
  if (/(?:考研.*(?:数学|高数)|(?:数学|高数).*考研|高等数学|高数)/i.test(longTermGoal)) {
    stages = buildPostgraduateMathStages();
  } else if (/计算机组成|组成原理|补码|运算器|cache/i.test(longTermGoal)) {
    stages = buildComputerOrganizationStages();
  } else {
    stages = buildDefaultStages(longTermGoal);
  }

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
  const nextTask = stage && Array.isArray(stage.tasks)
    ? stage.tasks.find((task) => String(task && task.status || "TODO").toUpperCase() !== "DONE")
    : null;
  if (nextTask) {
    return "「" + stageTitle + "」的下一步：" + cleanText(nextTask.title, "继续推进当前阶段") + "。";
  }
  return "「" + stageTitle + "」已完成，接下来将进入下一阶段。";
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
    .slice(0, 8)
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
    .slice(0, 6)
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
    .filter((stage) => stage && stage.tasks.length > 0);

  const taskCount = stageGoals.reduce((sum, stage) => sum + stage.tasks.length, 0);
  if (stageGoals.length < 3 || taskCount < 6) {
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
            "你是织梦学旅的目标粒度识别器。只返回 JSON：{\"goalLevel\":\"LONG_TERM|STAGE_GOAL|DAILY_TASK|AMBIGUOUS\"}。",
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
            "你是织梦学旅的目标澄清助手。针对过大或模糊目标生成 3 到 5 个必要澄清问题。只返回 JSON：{\"questions\":[{\"id\":\"q1\",\"question\":\"...\",\"answer\":\"\"}]}。",
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
          content: `你是织梦学旅的 AI 动态目标编排系统。必须输出稳定 JSON，不要解释。
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

约束：
1. 阶段目标 2 到 6 个，必须按时间或知识依赖排序；学习和备考目标要把不同时期的不同知识模块分开，例如高数依次为极限、导数、积分、多元微积分。
2. 每个阶段提供 3 到 8 个按顺序执行的核心能力或成果节点，供系统继续拆成周里程碑和七日滚动任务；不得循环复制同一模板。
3. 用户标记阶段内所有任务完成后即进入下一阶段；禁止设置正确率、考试分数、掌握度或 AI 评估门槛。
4. 任务必须挂载到阶段目标下，内容要具体、可执行且不重复；标题包含明确对象，说明包含可验收成果。
5. 此处只生成阶段骨架，不预生成整个长期目标的每日任务，也不要把所有任务都写成“今日任务”。`,
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
        maxTokens: 2200,
      }
    );
    return normalizeGoalPlan(result, fallback);
  } catch (error) {
    return fallback;
  }
}

const ROLLING_TASK_PLAN_SYSTEM_PROMPT = `你是“织梦学旅”的任务规划师。你的工作不是写计划口号，而是根据用户的目标、当前阶段、可用时间和最近执行记录，生成用户当天打开应用后可以直接开始做的任务。

你会收到：
- goal：用户真正想完成的事；
- durationDays：整个目标预计持续的天数；
- startDay、dayCount：本次需要生成的日期范围；
- dailyMinutes：用户每天可投入的总时间；
- phases：可参考的阶段信息；
- recentExecution：最近已经安排或完成的内容，用来避免机械重复并衔接进度。

只返回 JSON，不要解释：
{
  "days": [
    {
      "day": 1,
      "mainTasks": [
        {"title":"字符串","detail":"字符串","estimatedMinutes":25},
        {"title":"字符串","detail":"字符串","estimatedMinutes":25},
        {"title":"字符串","detail":"字符串","estimatedMinutes":25}
      ],
      "sideTasks": [
        {"title":"字符串","detail":"字符串","estimatedMinutes":10},
        {"title":"字符串","detail":"字符串","estimatedMinutes":10}
      ]
    }
  ]
}

生成前请在内部完成以下判断，但不要输出判断过程：
1. 识别这个目标真正包含哪些能力、知识、流程或作品环节。
2. 判断用户目前处于什么阶段，今天最值得推进什么；若信息不足，安排一个小而具体的起步动作，不虚构用户的水平、教材、课程或已有成果。
3. 结合 recentExecution 避免连续重复，并让相邻日期存在自然衔接。

主任务规则：
1. 每天恰好生成 3 个 mainTasks，三项都必须直接推进 goal，并分别覆盖当天最有价值的不同能力、知识模块或执行步骤。
2. 不要把某个目标误解成固定三件事。以备考六级为例，需要根据阶段在词汇、听力、阅读、写作、翻译、真题训练和具体错题订正之间合理轮换；该例子只说明“先识别领域模块再组合”，不能套用到其他目标。
3. title 必须写成“明确动作＋明确数量或范围＋具体对象或材料”，让用户不看解释也知道现在要做什么。例如：“背诵 100 个六级核心词汇”“精听 1 篇六级长对话真题”“完成 1 组六级仔细阅读并核对定位句”。
4. 禁止只写“学习……”“了解……”“熟悉……”“梳理……”“巩固……”“推进……”“复盘今天内容”等空泛标题。确实需要整理或订正时，必须写清对象、数量和动作，例如“订正昨天阅读中的 5 道错题并重做”。
5. 不要把三项都写成看资料、列计划、整理笔记或回顾内容；至少要有能实际练习、制作、解决或应用目标内容的任务。

趣味任务规则：
1. 每天恰好生成 2 个 sideTasks。它们必须与 goal 有真实关联，但体验应当轻松、有趣、低压力，是换一种方式接触或应用目标内容，而不是把 mainTasks 缩短、改名后再写一遍。
2. 优先从真实场景、影视音乐、模仿挑战、小游戏、观察记录、创意尝试、轻量探索或社交互动中设计；根据目标选择合适形式，不要生搬硬套娱乐元素。
3. 例如备考六级可以“看 1 集美剧并记下 5 句喜欢的表达”；练习口语可以“给 30 秒电影片段配音”或“模仿一段角色台词并录音”。这些只是风格示例，实际任务必须贴合用户的目标并避免重复。
4. 趣味任务不能是高强度刷题、正式考试、长篇写作、整理错题本或另一项主要训练，也不要用“轻松完成”“随便看看”等敷衍描述。
5. estimatedMinutes 必须符合真实耗时：完整看一集剧应按实际片长估算；如果当天时间不够，就改成看一个片段，不能把一集剧虚标成 10 分钟。

文案与时间规则：
1. 严格生成 dayCount 天，day 从 startDay 开始连续递增；每天只能有 3 个 mainTasks 和 2 个 sideTasks。
2. 每个任务对象只能包含 title、detail、estimatedMinutes。detail 最多两句话，只补充开始执行所必需的方法、范围或材料，不重复标题，不写评价标准和口号。
3. 文案中禁止出现“长期目标”“里程碑”“完成标志”“学习输入”“练习执行”“输出验证”“主线”“支线”“围绕……”“第几轮”等系统术语或套话。
4. title 中不要写“第几天”，系统会自动添加；不要写奖励、剧情、星星、打卡口号或教学解释。
5. 同一天的五项任务不能同义重复；连续多天不能只替换数字或材料名称。任务应按知识依赖、训练顺序、项目流程或用户最近表现逐步推进。
6. 五项任务的 estimatedMinutes 总和不得超过 dailyMinutes。时间不足时缩小数量、篇幅或材料范围，仍要保持任务具体可做。
7. 不承诺分数、正确率、掌握程度或结果提升，只描述用户能亲自执行的行为。

输出前静默检查：天数是否正确；每天是否正好 3＋2；五项是否具体且不重复；三个 mainTasks 是否覆盖不同重点；两个 sideTasks 是否真的轻松有趣；总时长是否超限；是否出现系统套话。任何一项不满足都先重写，再输出 JSON。`;

function normalizeRollingTask(rawTask) {
  const title = cleanText(rawTask && rawTask.title);
  const detail = cleanText(rawTask && rawTask.detail);
  const banned = /长期目标|里程碑|完成标志|学习输入|练习执行|输出验证|主线|支线|围绕.+目标|第\s*\d+\s*天/;
  if (!title || banned.test(`${title}${detail}`)) return null;
  return {
    title,
    detail,
    estimatedMinutes: Math.max(5, Math.min(90, Number(rawTask.estimatedMinutes) || 15)),
  };
}

function normalizeRollingTaskPlan(raw, startDay, dayCount, dailyMinutes) {
  const days = raw && Array.isArray(raw.days) ? raw.days : [];
  const normalized = days.slice(0, dayCount).map((entry, index) => {
    const mainTasks = (Array.isArray(entry && entry.mainTasks) ? entry.mainTasks : []).map(normalizeRollingTask).filter(Boolean);
    const sideTasks = (Array.isArray(entry && entry.sideTasks) ? entry.sideTasks : []).map(normalizeRollingTask).filter(Boolean);
    if (mainTasks.length !== 3 || sideTasks.length !== 2) return null;
    const totalMinutes = [...mainTasks, ...sideTasks].reduce((sum, task) => sum + task.estimatedMinutes, 0);
    if (totalMinutes > dailyMinutes) return null;
    return { day: startDay + index, mainTasks, sideTasks };
  }).filter(Boolean);
  return normalized.length === dayCount ? { days: normalized } : null;
}

async function generateRollingTaskPlan(input = {}, options = {}) {
  const startDay = Math.max(1, Number(input.startDay) || 1);
  const dayCount = Math.max(1, Math.min(7, Number(input.dayCount) || 7));
  const dailyMinutes = Math.max(25, Number(input.dailyMinutes) || 120);
  if (!hasApiKey(options)) return null;
  try {
    const result = await jsonCompletion(
      [
        { role: "system", content: ROLLING_TASK_PLAN_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            goal: cleanText(input.goalText),
            durationDays: Number(input.durationDays) || 30,
            startDay,
            dayCount,
            dailyMinutes,
            phases: input.phases || [],
            recentExecution: input.recentExecution || [],
          }),
        },
      ],
      { apiKey: options.apiKey, temperature: 0.55, maxTokens: 3600 }
    );
    return normalizeRollingTaskPlan(result, startDay, dayCount, dailyMinutes);
  } catch (error) {
    return null;
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
          content: `你是织梦学旅的动态重规划器。根据原因调整短期任务，不删除已完成任务和日志。只返回 JSON：
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
            "你是织梦学旅的下一步建议生成器。只根据长期目标中的当前阶段和任务完成状态，建议顺序中下一个未完成任务。用户标记完成即可，禁止评估正确率、掌握度或学习质量。只返回 JSON：{\"suggestion\":\"...\"}。",
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
  generateRollingTaskPlan,
  ROLLING_TASK_PLAN_SYSTEM_PROMPT,
  replanTasks,
  generateNextSuggestion,
};
