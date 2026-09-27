const api = require("../../../services/api");
const { showError, eventToStory } = require("../../../utils/ui");

function isDone(item) {
  return String(item && item.status || "").toLowerCase() === "completed"
    || String(item && item.status || "").toUpperCase() === "DONE";
}

function pad(value) { return String(value).padStart(2, "0"); }

function addDays(dateText, offset) {
  const parts = String(dateText || "").split("-").map(Number);
  const date = parts.length === 3
    ? new Date(parts[0], parts[1] - 1, parts[2] + offset)
    : new Date(Date.now() + offset * 86400000);
  return {
    key: date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()),
    dayText: date.getMonth() + 1 + "/" + date.getDate(),
    weekday: ["日", "一", "二", "三", "四", "五", "六"][date.getDay()],
  };
}

Page({
  data: {
    loading: true, state: null, goals: [], selectedGoalId: "", activeGoal: null, todayTasks: [],
    todayMainDone: 0, todaySideDone: 0, rhythmDays: [],
    currentMapName: "尚未开始", currentMapProgress: 0, currentMapOrder: 0, mapCount: 0,
    currentPhase: null, currentMilestone: null, confirmedSources: [],
    editModal: false, editTask: null, editTitle: "", editDetail: "", editMinutes: "25",
    previewModal: false, previewItems: [], story: null,
  },

  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },

  async load(selectedGoalId) {
    this.setData({ loading: true });
    try {
      const state = await api.getCurrentSession();
      getApp().globalData.state = state;
      this.render(state, selectedGoalId || this.data.selectedGoalId);
    } catch (error) { showError(error, "目标工作台加载失败"); }
    finally { this.setData({ loading: false }); }
  },

  render(state, selectedGoalId) {
    const rawGoals = (state.goalPortfolio && state.goalPortfolio.goals) || [];
    const priorityOrder = { PRIMARY: 0, SECONDARY: 1, INACTIVE: 2 };
    const goals = rawGoals.map((goal) => {
      const total = Math.max(1, Number(goal.totalStarCount) || 0);
      const completed = Number(goal.completedStars) || 0;
      const maps = goal.constellations || [];
      return {
        ...goal,
        progress: Math.min(100, Math.round(completed * 100 / total)),
        statusLabel: goal.status === "COMPLETED" ? "已完成" : goal.status === "ACTIVE" ? "进行中" : "已暂停",
        priorityLabel: goal.priority === "PRIMARY" ? "主目标" : goal.priority === "SECONDARY" ? "次目标" : "暂停发布",
        mapDone: maps.filter((map) => map.status === "COMPLETED").length,
        mapTotal: maps.length,
      };
    }).sort((left, right) => (priorityOrder[left.priority] || 2) - (priorityOrder[right.priority] || 2));
    const activeGoal = goals.find((goal) => goal.goalId === selectedGoalId)
      || goals.find((goal) => goal.priority === "PRIMARY" && goal.status === "ACTIVE")
      || goals.find((goal) => goal.status === "ACTIVE")
      || goals[0]
      || null;
    const planDate = state.dailyPlan && state.dailyPlan.planDate;
    const todayTasks = activeGoal
      ? (state.tasks || []).filter((task) => task.portfolioGoalId === activeGoal.goalId
          && (task.priorityTier === "CORE" || task.priorityTier === "OPTIONAL")
          && (!planDate || task.portfolioReleaseDate === planDate || task.scheduledDate === planDate))
        .sort((a, b) => {
          const priority = (a.priorityTier === "CORE" ? 0 : 1) - (b.priorityTier === "CORE" ? 0 : 1);
          return priority || Number(isDone(a)) - Number(isDone(b));
        })
        .map((task, index) => ({
          ...task, done: isDone(task), index,
          typeLabel: task.priorityTier === "OPTIONAL" ? "可选" : "核心",
          typeClass: task.priorityTier === "OPTIONAL" ? "side" : "main",
          sourceTitle: task.sourceRef && task.sourceRef.sourceTitle || "",
        }))
      : [];
    const mainTasks = todayTasks.filter((task) => task.priorityTier === "CORE");
    const sideTasks = todayTasks.filter((task) => task.priorityTier === "OPTIONAL");
    const todayMainDone = mainTasks.filter((task) => task.done).length;
    const todaySideDone = sideTasks.filter((task) => task.done).length;
    const maps = activeGoal ? activeGoal.constellations || [] : [];
    const currentMap = maps.find((map) => map.status === "ACTIVE") || maps.find((map) => map.status === "LOCKED") || maps[maps.length - 1] || null;
    const currentDay = Number(todayTasks[0] && todayTasks[0].portfolioDay)
      || Math.min(Number(activeGoal && activeGoal.durationDays || 1), Number(activeGoal && activeGoal.completedDays || 0) + 1);
    const currentPhase = activeGoal ? (activeGoal.phases || []).find((phase) => currentDay >= phase.startDay && currentDay <= phase.endDay) || null : null;
    const currentMilestone = activeGoal ? (activeGoal.weeklyMilestones || []).find((milestone) => currentDay >= milestone.startDay && currentDay <= milestone.endDay) || null : null;
    this.setData({
      state, goals, selectedGoalId: activeGoal ? activeGoal.goalId : "", activeGoal, todayTasks,
      todayMainDone, todaySideDone, rhythmDays: this.buildRhythm(activeGoal, todayTasks),
      currentMapName: currentMap ? currentMap.constellationName : "尚未开始", currentMapOrder: currentMap ? currentMap.order : 0,
      currentMapProgress: currentMap && currentMap.starCount ? Math.round(Number(currentMap.completedStars || 0) * 100 / Number(currentMap.starCount)) : 0,
      mapCount: maps.length,
      currentPhase, currentMilestone, confirmedSources: activeGoal ? (activeGoal.learningSources || []).slice(0, 2) : [],
    });
  },

  buildRhythm(goal, todayTasks) {
    if (!goal) return [];
    const nodes = goal.nodes || [];
    const todayTask = todayTasks[0];
    const currentDay = Number(todayTask && todayTask.portfolioDay) || Math.min(Number(goal.durationDays) || 1, Number(goal.completedDays || 0) + 1);
    const duration = Math.max(1, Number(goal.durationDays) || 1);
    const start = Math.max(1, Math.min(Math.max(1, duration - 6), currentDay - 3));
    return Array.from({ length: Math.min(7, duration - start + 1) }, (_, offset) => {
      const goalDay = start + offset;
      const dayNodes = nodes.filter((node) => Number(node.day) === goalDay);
      const completed = dayNodes.filter((node) => isDone(node)).length;
      const date = addDays(goal.startDate, goalDay - 1);
      const core = dayNodes.find((node) => node.priorityTier === "CORE") || dayNodes[0] || {};
      return { ...date, goalDay, completed, total: Math.max(1, dayNodes.length), current: goalDay === currentDay, future: goalDay > currentDay, complete: completed >= 1, title: core.title || "等待计划生成", sourceTitle: core.sourceRef && (core.sourceRef.locatorLabel || core.sourceRef.sourceTitle) || "" };
    });
  },

  selectGoal(event) { this.render(this.data.state, event.currentTarget.dataset.id); },
  openStarMap() { wx.navigateTo({ url: "/pages/dungeon/index" }); },
  goToday() { wx.switchTab({ url: "/pages/home/index" }); },

  setGoalPriority(event) {
    const goal = this.data.goals.find((item) => item.goalId === event.currentTarget.dataset.id);
    if (!goal) return;
    wx.showActionSheet({
      itemList: ["设为主目标", "设为次目标", "暂停自动发布"],
      success: async ({ tapIndex }) => {
        const priority = ["PRIMARY", "SECONDARY", "INACTIVE"][tapIndex];
        try {
          this.setData({ loading: true });
          const result = await api.updateGoalPriority(goal.goalId, priority);
          this.handleResult(result);
        } catch (error) { showError(error, "目标优先级更新失败"); }
        finally { this.setData({ loading: false }); }
      },
    });
  },

  startTask(event) {
    const task = this.data.todayTasks[Number(event.currentTarget.dataset.index)];
    if (!task || task.done) return;
    getApp().globalData.focusTask = task;
    wx.navigateTo({ url: "/features/adventure/focus/index" });
  },

  openTaskActions(event) {
    const task = this.data.todayTasks[Number(event.currentTarget.dataset.index)];
    if (!task || task.done) return;
    wx.showActionSheet({ itemList: ["编辑任务内容", "缩短为 15 分钟"], success: ({ tapIndex }) => {
      if (tapIndex === 0) this.openEdit(task);
      if (tapIndex === 1) this.previewTaskChanges([task]);
    } });
  },

  openEdit(task) { this.setData({ editModal: true, editTask: task, editTitle: task.title || "", editDetail: task.detail || "", editMinutes: String(task.estimatedMinutes || 25) }); },
  closeEdit() { this.setData({ editModal: false, editTask: null }); },
  editInput(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  async saveEdit() {
    const task = this.data.editTask;
    const title = this.data.editTitle.trim();
    const minutes = Number(this.data.editMinutes);
    if (!task || !title || !Number.isFinite(minutes) || minutes < 5 || minutes > 180) { wx.showToast({ title: "请填写标题和 5—180 分钟", icon: "none" }); return; }
    this.setData({ editModal: false, loading: true });
    try {
      const result = await api.updateTask(task.taskId, { title, detail: this.data.editDetail.trim(), estimatedMinutes: Math.round(minutes), deadlineAt: task.deadlineAt });
      this.handleResult(result);
    } catch (error) { showError(error, "任务更新失败"); }
    finally { this.setData({ loading: false }); }
  },

  previewLighten() {
    const tasks = this.data.todayTasks.filter((task) => !task.done && Number(task.estimatedMinutes || 25) > 15);
    if (!tasks.length) { wx.showToast({ title: "未完成任务已经足够轻量", icon: "none" }); return; }
    this.previewTaskChanges(tasks);
  },
  previewTaskChanges(tasks) { this.setData({ previewModal: true, previewItems: tasks.map((task) => ({ taskId: task.taskId, title: task.title, before: Number(task.estimatedMinutes) || 25, after: Math.min(15, Number(task.estimatedMinutes) || 15) })) }); },
  closePreview() { this.setData({ previewModal: false, previewItems: [] }); },
  async confirmLighten() {
    const changes = this.data.previewItems.slice();
    this.setData({ previewModal: false, loading: true });
    try {
      let latest = null;
      for (const change of changes) {
        const task = this.data.todayTasks.find((item) => item.taskId === change.taskId);
        if (task) latest = await api.updateTask(task.taskId, { title: task.title, detail: task.detail || "", estimatedMinutes: change.after, deadlineAt: task.deadlineAt });
      }
      if (latest) this.handleResult(latest);
      wx.showToast({ title: "今日节奏已调轻", icon: "success" });
    } catch (error) { showError(error, "调整今日节奏失败"); await this.load(); }
    finally { this.setData({ loading: false, previewItems: [] }); }
  },

  openGoal() { wx.navigateTo({ url: "/features/account/goal-setup/index" }); },
  handleResult(result) {
    if (result && result.state) { getApp().globalData.state = result.state; this.render(result.state, this.data.selectedGoalId); }
    const story = eventToStory(result && result.event);
    if (story) this.setData({ story });
  },
  closeStory() { this.setData({ story: null }); },
  noop() {},
});
