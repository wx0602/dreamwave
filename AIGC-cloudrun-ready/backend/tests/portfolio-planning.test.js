const assert = require("assert");
const {
  buildPlanningBlueprint,
  createDayTaskSet,
  validateDayTaskSet,
  repairDayTaskSet,
  initializeGoalPlanning,
  planRollingHorizon,
  buildSideTasks,
} = require("../src/services/portfolioPlanningService");
const { ROLLING_TASK_PLAN_SYSTEM_PROMPT } = require("../src/services/goalPlanningService");

function run() {
  const goal = {
    goalId: "quality-goal",
    title: "30 天完成数据分析作品集",
    durationDays: 30,
    completedDays: 0,
    nodes: [],
  };
  const plan = {
    stageGoals: [
      { title: "数据准备", tasks: [{ title: "清洗数据集", description: "整理缺失值和异常值" }] },
      { title: "分析建模", tasks: [{ title: "建立分析模型", description: "完成指标分析" }] },
      { title: "作品输出", tasks: [{ title: "制作作品报告", description: "输出可展示报告" }] },
    ],
  };

  const blueprint = buildPlanningBlueprint({ goalTitle: goal.title, durationDays: goal.durationDays, plan });
  assert.strictEqual(blueprint.phases.length, 3);
  assert.strictEqual(blueprint.weeklyMilestones.length, 5);

  initializeGoalPlanning(goal, plan, 60);
  assert.strictEqual(goal.nodes.length, 21, "初始化应生成 7 天、每天 3 个主线节点");
  assert.strictEqual(Math.max(...goal.nodes.map((node) => node.day)), 7);
  assert.strictEqual(goal.planningQuality.status, "PASSED");
  const dayOne = createDayTaskSet(goal, 1);
  assert.strictEqual(dayOne.length, 3, "每天必须生成三个主线任务");
  assert(dayOne.every((task) => task.sourceRef === null), "没有确认来源时不应伪造来源引用");
  assert.deepStrictEqual(dayOne.map((task) => task.role), ["LEARN", "PRACTICE", "VERIFY"]);
  assert.strictEqual(validateDayTaskSet(goal, dayOne).valid, true);

  const broken = [
    { role: "LEARN", title: "看看资料", detail: "随便看看", estimatedMinutes: 60 },
    { role: "LEARN", title: "看看资料", detail: "随便看看", estimatedMinutes: 60 },
  ];
  const brokenQuality = validateDayTaskSet(goal, broken);
  assert.strictEqual(brokenQuality.valid, false);
  assert(brokenQuality.issues.includes("CORE_TASK_COUNT"));
  assert(brokenQuality.issues.includes("MISSING_ACTION"));
  assert(brokenQuality.issues.includes("DUPLICATE_TASK"));

  const repaired = repairDayTaskSet(goal, 1, broken);
  assert.strictEqual(repaired.quality.valid, true, "不合格任务必须在发布前自动修复");
  assert(repaired.quality.repairAttempts > 0);

  planRollingHorizon(goal, 2);
  assert.strictEqual(Math.max(...goal.nodes.map((node) => node.day)), 8, "窗口向前移动时只新增一天");
  assert.strictEqual(goal.nodes.length, 24);

  const cetGoal = {
    goalId: "cet6-goal",
    title: "备考英语六级",
    durationDays: 30,
    completedDays: 0,
    nodes: [],
  };
  const aiPlan = {
    stageGoals: [
      { title: "六级基础训练", tasks: [{ title: "完成六级分项训练" }] },
      { title: "六级真题训练", tasks: [{ title: "完成六级真题" }] },
    ],
    rollingTaskPlan: {
      days: [
        { day: 1, mainTasks: [
          { title: "背诵 100 个六级核心词汇", detail: "完成认读、拼写和释义。", estimatedMinutes: 30 },
          { title: "精听 1 篇六级长对话真题", detail: "逐句听写并订正。", estimatedMinutes: 25 },
          { title: "完成 1 篇六级作文", detail: "限时写完并检查拼写。", estimatedMinutes: 35 },
        ], sideTasks: [
          { title: "看 1 集美剧并记下 5 句表达", detail: "选择带中英字幕的一集。", estimatedMinutes: 10 },
          { title: "给 30 秒电影片段配音", detail: "模仿语音和节奏录一遍。", estimatedMinutes: 10 },
        ] },
        { day: 2, mainTasks: [
          { title: "完成 1 组六级仔细阅读", detail: "核对答案并圈出定位句。", estimatedMinutes: 30 },
          { title: "完成 1 段六级汉译英", detail: "对照参考译文订正。", estimatedMinutes: 30 },
          { title: "复习 100 个六级核心词汇", detail: "完成拼写自测。", estimatedMinutes: 30 },
        ], sideTasks: [
          { title: "整理阅读错词", detail: "写入生词本。", estimatedMinutes: 10 },
          { title: "摘录 5 个翻译表达", detail: "写入表达清单。", estimatedMinutes: 10 },
        ] },
      ],
    },
  };
  initializeGoalPlanning(cetGoal, aiPlan, 120);
  const cetTitles = cetGoal.nodes.filter((node) => node.day === 1).map((node) => node.title);
  assert.strictEqual(cetTitles.length, 3, "每天应保留三个主线任务");
  assert(cetTitles.some((title) => /背诵\s*100\s*个六级核心词汇/.test(title)), "六级任务应包含明确词汇数量");
  assert(cetTitles.every((title) => !/主线|支线/.test(title)), "任务标题不得重复写主线或支线");
  assert(cetTitles.every((title) => /^第\s*1\s*天：/.test(title)), "任务标题可以保留第几天");
  assert(cetGoal.nodes.some((node) => node.day === 2 && /阅读/.test(node.title)), "AI 可以在后续日期安排阅读训练");
  const cetSideTitles = buildSideTasks(cetGoal, 1).map((task) => task.title);
  assert(cetSideTitles.some((title) => /美剧/.test(title)), "支线可以是轻松的真实内容接触");
  assert(cetSideTitles.some((title) => /配音/.test(title)), "支线可以是有趣的口语模仿");
  assert(/词汇、听力、阅读、写作、翻译/.test(ROLLING_TASK_PLAN_SYSTEM_PROMPT), "提示词必须要求覆盖领域内不同训练模块");
  assert(/禁止出现“长期目标”“里程碑”“完成标志”/.test(ROLLING_TASK_PLAN_SYSTEM_PROMPT), "提示词必须禁止系统套话");
  assert(/而不是把 mainTasks 缩短、改名后再写一遍/.test(ROLLING_TASK_PLAN_SYSTEM_PROMPT), "提示词必须区分支线任务与缩水版主线任务");
  assert(/完整看一集剧应按实际片长估算/.test(ROLLING_TASK_PLAN_SYSTEM_PROMPT), "趣味任务的时间估算必须真实");
  assert(!/deliverable/.test(ROLLING_TASK_PLAN_SYSTEM_PROMPT), "任务 JSON 不应包含 deliverable 字段");
  console.log("Portfolio rolling planning quality tests passed.");
}

run();
