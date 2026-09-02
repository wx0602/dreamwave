const api = require("../../../services/api");
const { value, showError } = require("../../../utils/ui");

Page({
  data: { loading: true, agentName: "", chapter: "", world: "", goal: "", narrative: "", sources: [], coreTask: null },
  async onLoad() {
    try {
      const state = await api.getCurrentSession();
      getApp().globalData.state = state;
      const coreTask = (state.tasks || []).find((task) => task.priorityTier === "CORE") || null;
      this.setData({
        agentName: value(state.agent && state.agent.agentName, "未命名 Agent"),
        chapter: value(state.user && state.user.currentChapter, "新篇章"),
        world: value(state.user && state.user.worldSetting, "未设定"),
        goal: value(state.user && state.user.currentGoal, "未设定"),
        narrative: value(state.openingNarrative, "主线生成中..."),
        sources: (((state.goalPortfolio || {}).goals || [])[0] || {}).learningSources || [],
        coreTask: coreTask ? { ...coreTask, sourceTitle: (coreTask.sourceRef || {}).sourceTitle || "已确认来源" } : null,
      });
    } catch (error) { showError(error, "初始化结果加载失败"); }
    finally { this.setData({ loading: false }); }
  },
  enter() { wx.switchTab({ url: "/pages/home/index" }); },
});
