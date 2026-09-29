const api = require("../../services/api");
const storage = require("../../utils/storage");
const { value, showError, eventToStory } = require("../../utils/ui");
const { CONSTELLATIONS, getConstellation } = require("../../utils/constellations");
const MAIN_TASKS_PER_DAY = 3;

const TOOL_META = [
  { toolId: "focus-cloak", name: "专注披风", icon: "◒", theme: "focus", action: "FOCUS", detail: "为未完成任务开启 25 分钟专注模式" },
  { toolId: "insight-scroll", name: "洞察卷轴", icon: "≡", theme: "insight", action: "SPLIT", detail: "把困难任务拆成三个可执行步骤" },
  { toolId: "memory-sigil", name: "记忆符印", icon: "忆", theme: "memory", action: "REVIEW", detail: "安排第 1、3、7 天间隔复习" },
  { toolId: "review-mirror", name: "回溯之镜", icon: "◉", theme: "mirror", action: "REFLECT", detail: "从完成记录生成复盘任务" },
  { toolId: "guardian-contract", name: "守护契约", icon: "契", theme: "guardian", action: "FALLBACK", detail: "生成不替代原任务的 5 分钟保底版本" },
];

function lineBetween(left, right, id) {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  return { id, x: left.x, y: left.y, length: Math.round(Math.sqrt(dx * dx + dy * dy)), angle: Math.round(Math.atan2(dy, dx) * 180 / Math.PI) };
}

function buildSky(goal) {
  const shape = getConstellation(goal && goal.constellationId);
  const majorStars = shape.points.map((point, index) => ({ id: `major-${index}`, x: 28 + point[0] * 5.75, y: 12 + point[1] * 3.75 }));
  const lines = shape.edges.map((edge, index) => lineBetween(majorStars[edge[0]], majorStars[edge[1]], `edge-${index}`));
  const segments = lines.map((line, index) => ({
    ...line,
    start: majorStars[shape.edges[index][0]],
    end: majorStars[shape.edges[index][1]],
  }));
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0) || 1;
  const nodes = goal && Array.isArray(goal.nodes) ? goal.nodes : [];
  const dailyStars = nodes.map((node, index) => {
    const target = nodes.length <= 1 ? 0 : totalLength * index / (nodes.length - 1);
    let walked = 0;
    let segment = segments[segments.length - 1];
    for (const candidate of segments) {
      if (walked + candidate.length >= target) { segment = candidate; break; }
      walked += candidate.length;
    }
    const ratio = segment && segment.length ? Math.max(0, Math.min(1, (target - walked) / segment.length)) : 0;
    const x = segment ? segment.start.x + (segment.end.x - segment.start.x) * ratio : 320;
    const y = segment ? segment.start.y + (segment.end.y - segment.start.y) * ratio : 190;
    const compactSize = node.status === "AVAILABLE" ? 34 : nodes.length > 60 ? 14 : 22;
    return {
      ...node,
      x: Math.round(x),
      y: Math.round(y),
      done: node.status === "DONE",
      available: node.status === "AVAILABLE",
      showTodayLabel: node.status === "AVAILABLE" && Number(node.slot || 1) === 1,
      compactSize,
      compactOffset: -Math.round(compactSize / 2),
      statusLabel: node.status === "DONE" ? "已点亮" : node.status === "AVAILABLE" ? "今日可点亮" : node.status === "MISSED" ? "本日未完成" : "等待解锁",
    };
  });
  return { shape, majorStars, lines, dailyStars };
}

function formatDate(input) {
  if (!input) return "--";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return String(input).slice(0, 10);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function parseDurationDays(value, fallback = 30) {
  const match = String(value || "").match(/(\d+)\s*(天|周|个月|月)?/);
  if (!match) return fallback;
  const amount = Math.max(1, Number(match[1]) || fallback);
  const unit = match[2] || "天";
  return Math.min(365, unit === "周" ? amount * 7 : unit === "个月" || unit === "月" ? amount * 30 : amount);
}

function buildInitialGoalFallback(state) {
  const plan = state.goalPlan;
  const user = state.user || {};
  const title = (plan && plan.longTermGoal) || user.currentGoal;
  if (!title) return null;
  const durationDays = parseDurationDays(user.deadline, 30);
  const templates = ((plan && plan.stageGoals) || []).reduce((all, stage) => all.concat(stage.tasks || []), []);
  const completed = templates.filter((task) => String(task.status || "").toUpperCase() === "DONE");
  const pendingTasks = (state.tasks || []).filter((task) => String(task.status).toLowerCase() !== "completed" && task.priorityTier === "CORE").slice(0, MAIN_TASKS_PER_DAY);
  const totalStarCount = durationDays * MAIN_TASKS_PER_DAY;
  const completedStars = Math.min(completed.length, totalStarCount);
  const completedDays = Math.floor(completedStars / MAIN_TASKS_PER_DAY);
  const goal = {
    goalId: "initial-goal-fallback",
    title,
    description: `每天完成 ${MAIN_TASKS_PER_DAY} 个主线任务，${durationDays} 天共点亮 ${totalStarCount} 颗星。`,
    durationDays,
    completedDays,
    completedStars,
    totalStarCount,
    starsPerDay: MAIN_TASKS_PER_DAY,
    status: completedStars >= totalStarCount ? "COMPLETED" : "ACTIVE",
    constellationId: "ursa-major",
    constellationName: "大熊座",
    synthetic: true,
    nodes: Array.from({ length: Math.min(durationDays, 7) * MAIN_TASKS_PER_DAY }, (_, index) => {
      const day = Math.floor(index / MAIN_TASKS_PER_DAY) + 1;
      const slot = index % MAIN_TASKS_PER_DAY + 1;
      const templateIndex = Math.min(
        Math.max(0, templates.length - 1),
        Math.floor((day - 1) * Math.max(templates.length, 1) / Math.min(durationDays, 7))
      );
      const template = templates[templateIndex] || {};
      const isDone = index < completedStars;
      const pendingTask = pendingTasks[slot - 1];
      const isToday = !isDone && day === Math.floor(completedStars / MAIN_TASKS_PER_DAY) + 1 && Boolean(pendingTask);
      const cet6Titles = [`列出第 ${day} 天的 3 个学习要点`, `完成第 ${day} 天的 1 组练习`, `检查第 ${day} 天的结果并记录问题`];
      const generatedTitle = /六级|cet[-\s]?6/i.test(title)
        ? cet6Titles[slot - 1]
        : (isToday ? pendingTask.title : template.title || "完成一项具体任务");
      return {
        nodeId: `initial-goal-fallback-core-${day}-${slot}`,
        day,
        slot,
        title: `第 ${day} 天：${generatedTitle}`,
        detail: isToday ? pendingTask.detail : template.description || "按要求完成并保存结果。",
        estimatedMinutes: Number(isToday ? pendingTask.estimatedMinutes : template.estimatedMinutes) || 25,
        status: isDone ? "DONE" : isToday ? "AVAILABLE" : "LOCKED",
        completedAt: isDone ? completed[index] && completed[index].completedAt : null,
      };
    }),
  };
  const constellationIds = Object.keys(CONSTELLATIONS);
  goal.constellations = [];
  let start = 0;
  let mapIndex = 0;
  while (start < totalStarCount) {
    const index = mapIndex;
    const constellationId = constellationIds[index % constellationIds.length];
    const shape = getConstellation(constellationId);
    const starCount = Math.min(shape.points.length, totalStarCount - start);
    const nodeIds = Array.from({ length: starCount }, (_, nodeIndex) => {
      const globalIndex = start + nodeIndex;
      return `initial-goal-fallback-core-${Math.floor(globalIndex / MAIN_TASKS_PER_DAY) + 1}-${globalIndex % MAIN_TASKS_PER_DAY + 1}`;
    });
    const nodes = nodeIds.map((nodeId) => goal.nodes.find((node) => node.nodeId === nodeId)).filter(Boolean);
    const completedMapStars = nodes.filter((node) => node.status === "DONE").length;
    goal.constellations.push({
      mapId: `initial-map-${index + 1}`,
      order: index + 1,
      constellationId,
      constellationName: shape.name,
      nodeIds,
      starCount,
      completedStars: completedMapStars,
      status: completedMapStars === starCount ? "COMPLETED" : index === 0 || completedMapStars > 0 ? "ACTIVE" : "LOCKED",
    });
    start += starCount;
    mapIndex += 1;
  }
  return goal;
}

Page({
  data: {
    loading: true, mode: "current", state: null,
    goals: [], selectedGoalId: "", activeGoal: null, seriesMaps: [], selectedMapId: "", activeMap: null,
    constellationName: "", constellationLatin: "", majorStars: [], lines: [], dailyStars: [],
    todayTasks: [], companionStars: [], atlas: [], tools: [],
    starDetail: null, atlasDetail: null, toolModal: false, selectedTool: null, toolTargets: [], story: null,
  },

  onShow() {
    if (!storage.get(storage.KEYS.userId, "")) { wx.reLaunch({ url: "/pages/welcome/index" }); return; }
    this.load();
  },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  noop() {},

  async load() {
    this.setData({ loading: true });
    try {
      const state = await api.getCurrentSession();
      getApp().globalData.state = state;
      this.render(state, this.data.selectedGoalId, this.data.selectedMapId);
    } catch (error) { showError(error, "星图加载失败"); }
    finally { this.setData({ loading: false }); }
  },

  render(state, selectedGoalId, selectedMapId) {
    let portfolioGoals = (state.goalPortfolio && state.goalPortfolio.goals) || [];
    if (!portfolioGoals.length) {
      const initialGoal = buildInitialGoalFallback(state);
      if (initialGoal) portfolioGoals = [initialGoal];
    }
    const goals = portfolioGoals.map((goal) => ({
      ...goal,
      completedStars: Number(goal.completedStars) || (goal.nodes || []).filter((node) => node.status === "DONE").length,
      totalStarCount: Number(goal.totalStarCount) || (goal.nodes || []).length,
      progress: (Number(goal.totalStarCount) || (goal.nodes || []).length)
        ? Math.round((Number(goal.completedStars) || (goal.nodes || []).filter((node) => node.status === "DONE").length) * 100 / (Number(goal.totalStarCount) || (goal.nodes || []).length))
        : 0,
      active: goal.status === "ACTIVE",
    }));
    const activeGoal = goals.find((goal) => goal.goalId === selectedGoalId)
      || goals.find((goal) => goal.status === "ACTIVE")
      || goals[0]
      || null;
    const nodeById = new Map(((activeGoal && activeGoal.nodes) || []).map((node) => [node.nodeId, node]));
    let seriesOffset = 0;
    const seriesMaps = ((activeGoal && activeGoal.constellations) || []).map((map) => {
      const mapOffset = seriesOffset;
      seriesOffset += Number(map.starCount) || (map.nodeIds || []).length;
      return {
      ...map,
      nodes: (map.nodeIds || []).map((nodeId, mapIndex) => {
        const existing = nodeById.get(nodeId);
        if (existing) return existing;
        const globalIndex = mapOffset + mapIndex;
        return {
          nodeId,
          day: Math.floor(globalIndex / MAIN_TASKS_PER_DAY) + 1,
          slot: globalIndex % MAIN_TASKS_PER_DAY + 1,
          title: "尚未进入七日规划",
          detail: "这是一颗已预留的星位。接近执行日期后，系统才会生成对应任务。",
          estimatedMinutes: 0,
          status: "LOCKED",
          planningStatus: "UNPLANNED",
        };
      }),
      progress: map.starCount ? Math.round(Number(map.completedStars || 0) * 100 / map.starCount) : 0,
    };
    });
    const activeMap = seriesMaps.find((map) => map.mapId === selectedMapId)
      || seriesMaps.find((map) => map.status === "ACTIVE")
      || seriesMaps.find((map) => map.status === "LOCKED")
      || seriesMaps[seriesMaps.length - 1]
      || null;
    const sky = buildSky(activeMap);
    const todayTasks = activeGoal
      ? (state.tasks || []).filter((task) => (
          (activeGoal.synthetic ? task.priorityTier === "CORE" : task.portfolioGoalId === activeGoal.goalId && task.priorityTier === "CORE")
          && String(task.status).toLowerCase() !== "completed"
        )).slice(0, MAIN_TASKS_PER_DAY)
      : [];
    const companionStars = (state.tasks || []).filter((task) => !task.portfolioGoalId).map((task) => ({
      taskId: task.taskId, title: task.title, done: String(task.status).toLowerCase() === "completed",
    }));
    const starMap = state.starMap || {};
    const owned = {};
    (starMap.tools || []).forEach((tool) => { owned[tool.toolId] = tool; });
    const tools = TOOL_META.map((meta) => ({ ...(owned[meta.toolId] || {}), ...meta, owned: Boolean(owned[meta.toolId]), charges: Number(owned[meta.toolId] && owned[meta.toolId].charges) || 0 }));
    this.setData({
      state, goals, selectedGoalId: activeGoal ? activeGoal.goalId : "", activeGoal,
      seriesMaps, selectedMapId: activeMap ? activeMap.mapId : "", activeMap,
      constellationName: sky.shape.name, constellationLatin: sky.shape.subtitle,
      majorStars: sky.majorStars, lines: sky.lines, dailyStars: sky.dailyStars,
      todayTasks, companionStars,
      atlas: goals.reduce((all, goal) => all.concat(((goal.constellations || [])
        .filter((map) => map.status === "COMPLETED")
        .map((map) => ({
          ...map,
          goalId: goal.goalId,
          title: goal.title,
          durationDays: goal.durationDays,
          totalStarCount: map.starCount,
          displayDate: formatDate(map.completedAt),
        })))), []),
      tools,
    });
  },

  selectGoal(event) { this.render(this.data.state, event.currentTarget.dataset.id, ""); },
  selectMap(event) { this.render(this.data.state, this.data.selectedGoalId, event.currentTarget.dataset.id); },
  switchMode(event) { this.setData({ mode: event.currentTarget.dataset.mode }); },
  showStar(event) { const star = this.data.dailyStars[Number(event.currentTarget.dataset.index)]; if (star) this.setData({ starDetail: star }); },
  closeStar() { this.setData({ starDetail: null }); },
  showAtlas(event) { const entry = this.data.atlas[Number(event.currentTarget.dataset.index)]; if (entry) this.setData({ atlasDetail: entry }); },
  closeAtlas() { this.setData({ atlasDetail: null }); },

  openGoal() { wx.navigateTo({ url: "/features/account/goal-setup/index" }); },

  openTool(event) {
    const tool = this.data.tools[Number(event.currentTarget.dataset.index)];
    if (!tool || !tool.owned || tool.charges <= 0) { wx.showToast({ title: tool && tool.owned ? "完成星图可补充次数" : "完成一张星图后解锁", icon: "none" }); return; }
    const needsCompleted = tool.action === "REVIEW" || tool.action === "REFLECT";
    const source = needsCompleted
      ? this.data.goals.reduce((all, goal) => all.concat((goal.nodes || []).filter((node) => node.status === "DONE")), [])
      : (this.data.state.tasks || []).filter((task) => String(task.status).toLowerCase() !== "completed");
    const toolTargets = source.map((task) => ({
      taskId: task.taskId || task.nodeId, title: task.title, estimatedMinutes: Number(task.estimatedMinutes) || 25, detail: task.detail || "",
    }));
    this.setData({ selectedTool: tool, toolTargets, toolModal: true });
  },
  closeTool() { this.setData({ toolModal: false, selectedTool: null, toolTargets: [] }); },
  async useTool(event) {
    const target = this.data.toolTargets[Number(event.currentTarget.dataset.index)];
    const tool = this.data.selectedTool;
    if (!target || !tool || this.data.loading) return;
    this.setData({ loading: true, toolModal: false });
    try {
      const result = await api.useStarMapTool(tool.toolId, target.taskId);
      if (result.state) { getApp().globalData.state = result.state; this.render(result.state, this.data.selectedGoalId, this.data.selectedMapId); }
      if (result.event && result.event.action === "FOCUS") { getApp().globalData.focusTask = { ...target, estimatedMinutes: 25 }; wx.navigateTo({ url: "/features/adventure/focus/index" }); return; }
      const story = eventToStory(result.event, `${tool.name}已生效`); if (story) this.setData({ story });
    } catch (error) { showError(error, "道具使用失败"); }
    finally { this.setData({ loading: false, selectedTool: null, toolTargets: [] }); }
  },
  closeStory() { this.setData({ story: null }); },
});
