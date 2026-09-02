const api = require("../../services/api");
const storage = require("../../utils/storage");
const { ROLE_META, normalizeRoleId, getRoleImage } = require("../../utils/roles");
const { value, showError, eventToStory } = require("../../utils/ui");

Page({
  data: {
    loading: true, chapter: "", goal: "", tasks: [], state: null, activeGoals: [],
    companionExpanded: false, companionName: "伴学", companionTag: "陪跑", companionImage: "", companionMessage: "正在读取今天的计划...", companionPrompts: [], companionIndex: 0,
    companionX: 0, companionY: 300, companionDockLeft: false, companionPanelBelow: false,
    inputModal: false, inputMode: "create", inputTitle: "", inputValue: "", inputTaskId: "",
    editModal: false, editTask: null, editTitle: "", editDetail: "", editMinutes: "25", editDeadline: "",
    actionModal: false, story: null,
  },
  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const ballSize = Math.max(52, Math.round(Number(windowInfo.windowWidth || 375) * 0.14));
    const maxX = Math.max(12, Number(windowInfo.windowWidth || 375) - ballSize - 12);
    const maxY = Math.max(100, Number(windowInfo.windowHeight || 667) - ballSize - 92);
    const saved = storage.get(storage.KEYS.companionPosition, null);
    const savedY = saved && Number(saved.y);
    const dockLeft = Boolean(saved && saved.dockLeft);
    this._companionBounds = { maxX, maxY };
    this._companionPosition = {
      x: dockLeft ? 12 : maxX,
      y: Number.isFinite(savedY) ? Math.max(88, Math.min(maxY, savedY)) : maxY,
    };
    this.setData({
      companionX: this._companionPosition.x,
      companionY: this._companionPosition.y,
      companionDockLeft: dockLeft,
      companionPanelBelow: this._companionPosition.y < 220,
    });
  },
  onShow() {
    if (!storage.get(storage.KEYS.userId, "")) { wx.reLaunch({ url: "/pages/welcome/index" }); return; }
    this.loadState();
  },
  onPullDownRefresh() { this.loadState().finally(() => wx.stopPullDownRefresh()); },
  async loadState() {
    this.setData({ loading: true });
    try {
      const state = await api.getCurrentSession();
      getApp().globalData.state = state;
      this.renderState(state);
    } catch (error) { showError(error, "任务同步失败"); }
    finally { this.setData({ loading: false }); }
  },
  renderState(state) {
    const user = state.user || {};
    const roleId = normalizeRoleId((state.agent && state.agent.roleId) || user.selectedRoleId || storage.get(storage.KEYS.selectedRole, "traveler"));
    const meta = ROLE_META[roleId];
    const companion = storage.get(storage.KEYS.companion, {});
    const activeGoals = ((state.goalPortfolio && state.goalPortfolio.goals) || [])
      .filter((goal) => goal.status === "ACTIVE")
      .sort((left, right) => ({ PRIMARY: 0, SECONDARY: 1, INACTIVE: 2 }[left.priority] || 2) - ({ PRIMARY: 0, SECONDARY: 1, INACTIVE: 2 }[right.priority] || 2));
    const rawTasks = (state.tasks || []).filter((task) => task.priorityTier === "CORE" || task.priorityTier === "OPTIONAL");
    const tasks = rawTasks
      .sort((left, right) => {
        const priority = (left.priorityTier === "CORE" ? 0 : 1) - (right.priorityTier === "CORE" ? 0 : 1);
        return priority || Number(left.done) - Number(right.done);
      })
      .map((task, index, list) => ({
      ...task,
      done: String(task.status).toLowerCase() === "completed",
      typeLabel: task.priorityTier === "OPTIONAL" ? "可选" : "核心",
      sectionStart: index === 0 || list[index - 1].priorityTier !== task.priorityTier,
      sourceTitle: task.sourceRef && task.sourceRef.sourceTitle || "",
      deadlineText: value(task.deadlineLabel, value(task.deadlineAt).slice(0, 10)),
    }));
    const companionName = value(companion.name, meta.companionName);
    const prompts = this.buildCompanionPrompts(state, roleId, companionName, tasks);
    this.setData({
      state, tasks, activeGoals,
      chapter: value(user.currentChapter, "新的冒险线"),
      goal: activeGoals.length > 1 ? "主目标：" + value(activeGoals[0] && activeGoals[0].title, "未设定") + " · 另有 " + (activeGoals.length - 1) + " 项并行目标" : value(activeGoals[0] && activeGoals[0].title, value(user.currentGoal, "未设定")),
      companionName, companionTag: meta.companionTag, companionImage: getRoleImage(roleId),
      companionPrompts: prompts, companionIndex: 0, companionMessage: prompts[0],
    });
  },
  buildCompanionPrompts(state, roleId, name, tasks) {
    const completed = tasks.filter((task) => task.done).length;
    const next = tasks.find((task) => !task.done && task.priorityTier === "CORE") || tasks.find((task) => !task.done);
    let greeting;
    if (completed && state.nextSuggestion) greeting = `${name}：你已经完成 ${completed} 项任务。下一步我建议：${state.nextSuggestion}`;
    else if (roleId === "knight") greeting = `${name}：先回报状态吧，我来陪你把今天的战线稳住。`;
    else if (roleId === "scholar") greeting = `${name}：先校准注意力，再按优先级清掉最关键的节点。`;
    else greeting = `${name}：别急，我们先走完眼前这一小段，节奏会自己回来。`;
    const plan = next ? `今天先推进「${next.title}」吧，预计 ${next.estimatedMinutes || 25} 分钟。` : "今日任务已经收束，可以去日志页完成复盘。";
    const persona = roleId === "knight" ? "沉稳守护型搭档，把任务讲成并肩推进的主线战役。" : roleId === "scholar" ? "冷静洞察型搭档，帮你把任务拆成明确的知识节点。" : "轻快陪跑型搭档，把任务变成能完成的小远征。";
    return [greeting, plan, `伴学设定：${persona}`];
  },
  toggleCompanion() { this.setData({ companionExpanded: !this.data.companionExpanded }); },
  cycleCompanion() {
    const prompts = this.data.companionPrompts;
    if (!prompts.length) return;
    const companionIndex = this.data.companionExpanded
      ? (this.data.companionIndex + 1) % prompts.length
      : this.data.companionIndex;
    this.setData({ companionExpanded: true, companionIndex, companionMessage: prompts[companionIndex] });
  },
  companionMove(event) {
    if (!event.detail) return;
    this._companionPosition = { x: Number(event.detail.x) || 0, y: Number(event.detail.y) || 0 };
    if (this.data.companionExpanded && event.detail.source === "touch") {
      this.setData({ companionExpanded: false });
    }
  },
  companionMoveEnd() {
    const bounds = this._companionBounds || { maxX: 300, maxY: 500 };
    const current = this._companionPosition || { x: bounds.maxX, y: bounds.maxY };
    const dockLeft = current.x < bounds.maxX / 2;
    const position = {
      x: dockLeft ? 12 : bounds.maxX,
      y: Math.max(88, Math.min(bounds.maxY, current.y)),
    };
    this._companionPosition = position;
    this.setData({
      companionX: position.x,
      companionY: position.y,
      companionDockLeft: dockLeft,
      companionPanelBelow: position.y < 220,
    });
    storage.set(storage.KEYS.companionPosition, { y: position.y, dockLeft });
  },
  showActions() {
    this.setData({ actionModal: true });
  },
  closeActions() { this.setData({ actionModal: false }); },
  runAction(event) {
    const action = event.currentTarget.dataset.action;
    this.setData({ actionModal: false });
    if (action === "create") this.setData({ inputModal: true, inputMode: "create", inputTitle: "新建支线任务", inputValue: "", inputTaskId: "" });
    if (action === "goal") wx.navigateTo({ url: "/features/account/goal-setup/index" });
  },
  openGoalWorkbench() { wx.navigateTo({ url: "/features/adventure/goal-map/index" }); },
  openTodayAdjust() { wx.navigateTo({ url: "/features/adventure/goal-map/index" }); },
  closeInput() { this.setData({ inputModal: false }); },
  noop() {},
  inputChange(event) { this.setData({ inputValue: event.detail.value }); },
  async submitInput() {
    const title = this.data.inputValue.trim();
    if (!title) { wx.showToast({ title: "任务标题不能为空", icon: "none" }); return; }
    this.setData({ inputModal: false, loading: true });
    try { this.handleResult(await api.createTask(title)); }
    catch (error) { showError(error, "任务创建失败"); }
    finally { this.setData({ loading: false }); }
  },
  startTask(event) {
    const task = this.data.tasks[Number(event.currentTarget.dataset.index)];
    if (!task || task.done) return;
    getApp().globalData.focusTask = task;
    wx.navigateTo({ url: "/features/adventure/focus/index" });
  },
  editTask(event) {
    const task = this.data.tasks[Number(event.currentTarget.dataset.index)];
    if (!task || task.done) return;
    wx.showActionSheet({ itemList: ["修改任务内容", "继续拆小", "换一个任务", "降低今日强度", "移到明天"], success: ({ tapIndex }) => {
      if (tapIndex === 0) this.openEdit(task);
      if (tapIndex === 1) this.replan("TOO_HARD", task.taskId);
      if (tapIndex === 2) this.replan("IRRELEVANT", task.taskId);
      if (tapIndex === 3) this.replan("NO_TIME", task.taskId);
      if (tapIndex === 4) this.moveTomorrow(task);
    } });
  },
  openEdit(task) {
    this.setData({ editModal: true, editTask: task, editTitle: task.title || "", editDetail: task.detail || "", editMinutes: String(task.estimatedMinutes || 25), editDeadline: value(task.deadlineAt).slice(0, 10) || this.tomorrow() });
  },
  editInput(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  deadlineChange(event) { this.setData({ editDeadline: event.detail.value }); },
  closeEdit() { this.setData({ editModal: false }); },
  async saveEdit() {
    const minutes = Number(this.data.editMinutes);
    if (!this.data.editTitle.trim() || !Number.isFinite(minutes) || minutes <= 0) { wx.showToast({ title: "请填写标题和有效分钟数", icon: "none" }); return; }
    const task = this.data.editTask;
    this.setData({ editModal: false, loading: true });
    try {
      const result = await api.updateTask(task.taskId, { title: this.data.editTitle.trim(), detail: this.data.editDetail.trim(), estimatedMinutes: Math.round(minutes), deadlineAt: this.data.editDeadline });
      this.handleResult(result);
    } catch (error) { showError(error, "任务更新失败"); }
    finally { this.setData({ loading: false }); }
  },
  tomorrow() { const date = new Date(Date.now() + 86400000); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; },
  async moveTomorrow(task) {
    try { this.handleResult(await api.updateTask(task.taskId, { title: task.title, detail: task.detail || "", estimatedMinutes: task.estimatedMinutes || 25, deadlineAt: this.tomorrow() })); }
    catch (error) { showError(error, "任务移动失败"); }
  },
  async replan(reason, taskId) {
    this.setData({ loading: true });
    try { this.handleResult(await api.replanGoal(reason, taskId)); }
    catch (error) { showError(error, "目标重规划失败"); }
    finally { this.setData({ loading: false }); }
  },
  handleResult(result) {
    if (result && result.state) this.renderState(result.state);
    const story = eventToStory(result && result.event);
    if (story) this.setData({ story });
  },
  closeStory() { this.setData({ story: null }); },
});
