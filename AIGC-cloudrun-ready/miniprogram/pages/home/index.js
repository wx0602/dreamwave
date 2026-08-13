const api = require("../../services/api");
const storage = require("../../utils/storage");
const { ROLE_META, normalizeRoleId, getRoleImage } = require("../../utils/roles");
const { value, showError, eventToStory } = require("../../utils/ui");

Page({
  data: {
    loading: true, chapter: "", goal: "", tasks: [], state: null,
    companionExpanded: false, companionName: "伴学", companionTag: "陪跑", companionImage: "", companionMessage: "正在读取今天的计划...", companionPrompts: [], companionIndex: 0,
    inputModal: false, inputMode: "create", inputTitle: "", inputValue: "", inputTaskId: "",
    editModal: false, editTask: null, editTitle: "", editDetail: "", editMinutes: "25", editDeadline: "",
    actionModal: false, story: null, nextGoalModal: false, nextGoal: "",
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
    const tasks = (state.tasks || []).map((task) => ({
      ...task,
      done: String(task.status).toLowerCase() === "completed",
      typeLabel: task.taskType === "side" ? "支线" : "主线",
      deadlineText: value(task.deadlineLabel, value(task.deadlineAt).slice(0, 10)),
      rewardText: `成长 +${Number(task.rewardGrowth) || 0} · 资源 +${Number(task.rewardResource) || 0}`,
    }));
    const companionName = value(companion.name, meta.companionName);
    const prompts = this.buildCompanionPrompts(state, roleId, companionName, tasks);
    this.setData({
      state, tasks,
      chapter: value(user.currentChapter, "新的冒险线"),
      goal: value(state.goalPlan && state.goalPlan.longTermGoal, value(user.currentGoal, "未设定")),
      companionName, companionTag: meta.companionTag, companionImage: getRoleImage(roleId),
      companionPrompts: prompts, companionIndex: 0, companionMessage: prompts[0],
    });
    if (state.transition && state.transition.needsNextGoalPrompt) this.setData({ nextGoalModal: true });
  },
  buildCompanionPrompts(state, roleId, name, tasks) {
    const completed = tasks.filter((task) => task.done).length;
    const next = tasks.find((task) => !task.done);
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
    const companionIndex = (this.data.companionIndex + 1) % prompts.length;
    this.setData({ companionExpanded: true, companionIndex, companionMessage: prompts[companionIndex] });
  },
  showActions() {
    this.setData({ actionModal: true });
  },
  closeActions() { this.setData({ actionModal: false }); },
  runAction(event) {
    const action = event.currentTarget.dataset.action;
    this.setData({ actionModal: false });
    if (action === "create") this.setData({ inputModal: true, inputMode: "create", inputTitle: "新建支线任务", inputValue: "", inputTaskId: "" });
    if (action === "map") wx.navigateTo({ url: "/features/adventure/goal-map/index" });
    if (action === "replan") this.replan("INTERRUPTED");
  },
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
  completeTask(event) {
    const task = this.data.tasks[Number(event.currentTarget.dataset.index)];
    if (!task || task.done) return;
    getApp().globalData.completionTask = task;
    wx.navigateTo({ url: "/features/adventure/completion/index" });
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
  nextGoalInput(event) { this.setData({ nextGoal: event.detail.value }); },
  async submitNextGoal() {
    const goal = this.data.nextGoal.trim();
    if (!goal) { wx.showToast({ title: "下一阶段目标不能为空", icon: "none" }); return; }
    this.setData({ nextGoalModal: false, loading: true });
    try { this.handleResult(await api.advanceGoal(goal)); this.setData({ nextGoal: "" }); }
    catch (error) { showError(error, "新主线生成失败"); this.setData({ nextGoalModal: true }); }
    finally { this.setData({ loading: false }); }
  },
});
