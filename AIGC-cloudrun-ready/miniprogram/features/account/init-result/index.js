const api = require("../../../services/api");
const { value, showError } = require("../../../utils/ui");

Page({
  data: { loading: true, companionName: "", chapter: "", world: "", goal: "", narrative: "", sources: [], mainTasks: [] },
  async onLoad() {
    try {
      const state = await api.getCurrentSession();
      getApp().globalData.state = state;
      const mainTasks = (state.tasks || []).filter((task) => task.priorityTier === "CORE").slice(0, 3);
      this.setData({
        companionName: value(state.agent && state.agent.agentName, "旅程伙伴"),
        chapter: value(state.user && state.user.currentChapter, "新篇章"),
        world: value(state.user && state.user.worldSetting, "未设定"),
        goal: value(state.user && state.user.currentGoal, "未设定"),
        narrative: value(state.openingNarrative, "主线生成中..."),
        sources: (((state.goalPortfolio || {}).goals || [])[0] || {}).learningSources || [],
        mainTasks: mainTasks.map((task) => ({ ...task, sourceTitle: (task.sourceRef || {}).sourceTitle || "暂未绑定资料" })),
      });
    } catch (error) { showError(error, "初始化结果加载失败"); }
    finally { this.setData({ loading: false }); }
  },
  enter() { wx.switchTab({ url: "/pages/home/index" }); },
});
