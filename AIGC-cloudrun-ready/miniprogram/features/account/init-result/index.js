const api = require("../../../services/api");
const { value, showError } = require("../../../utils/ui");

Page({
  data: { loading: true, agentName: "", chapter: "", world: "", goal: "", narrative: "", tasks: [] },
  async onLoad() {
    try {
      const state = await api.getCurrentSession();
      getApp().globalData.state = state;
      this.setData({
        agentName: value(state.agent && state.agent.agentName, "未命名 Agent"),
        chapter: value(state.user && state.user.currentChapter, "新篇章"),
        world: value(state.user && state.user.worldSetting, "未设定"),
        goal: value(state.user && state.user.currentGoal, "未设定"),
        narrative: value(state.openingNarrative, "主线生成中..."), tasks: state.tasks || [],
      });
    } catch (error) { showError(error, "初始化结果加载失败"); }
    finally { this.setData({ loading: false }); }
  },
  enter() { wx.switchTab({ url: "/pages/home/index" }); },
});
