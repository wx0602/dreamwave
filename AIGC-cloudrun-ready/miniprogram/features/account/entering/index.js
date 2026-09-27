const api = require("../../../services/api");
const storage = require("../../../utils/storage");

const STAGES = ["正在确认学习来源", "正在核对第一周计划", "正在写入世界档案", "正在开启今日核心任务"];

Page({
  data: { progress: 8, stage: STAGES[0], error: "", working: false },

  onLoad() {
    this.confirmation = getApp().globalData.confirmationPayload;
    if (!this.confirmation || !this.confirmation.draftId) {
      this.setData({ error: "确认参数缺失，请返回计划页重试。" });
      return;
    }
    this.start();
  },

  onUnload() { this.stopProgress(); },

  startProgress() {
    this.stopProgress();
    this.progressTimer = setInterval(() => {
      const progress = Math.min(this.data.progress + 8, 92);
      this.setData({ progress, stage: STAGES[Math.min(Math.floor(progress / 25), STAGES.length - 1)] });
    }, 360);
  },

  stopProgress() {
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = null;
  },

  finishInitialization(result) {
    const state = result && result.state;
    if (!state) throw new Error("确认结果为空");
    const user = state.user || {};
    storage.set(storage.KEYS.loginAccount, this.confirmation.registration && this.confirmation.registration.account || "");
    storage.set(storage.KEYS.userName, user.nickname || "");
    storage.set(storage.KEYS.selectedRole, user.selectedRoleId || "traveler");
    storage.set(storage.KEYS.userId, user.userId || "");
    storage.set(storage.KEYS.agentId, state.agent && state.agent.agentId || "");
    getApp().globalData.state = state;
    getApp().globalData.goalDraft = null;
    getApp().globalData.goalSetupPayload = null;
    getApp().globalData.confirmationPayload = null;
    getApp().globalData.registrationPayload = null;
    this.stopProgress();
    this.setData({ progress: 100, stage: "世界入口已开启", working: false });
    setTimeout(() => {
      if (this.confirmation.mode === "PARALLEL") wx.switchTab({ url: "/pages/home/index" });
      else wx.redirectTo({ url: "/features/account/init-result/index" });
    }, 420);
  },

  async start() {
    if (this.data.working || !this.confirmation) return;
    this.setData({ progress: 8, stage: STAGES[0], error: "", working: true });
    this.startProgress();
    try {
      const result = await api.confirmGoalDraft(this.confirmation.draftId, this.confirmation);
      this.finishInitialization(result);
    } catch (error) {
      this.stopProgress();
      this.setData({ error: error.message || "确认失败", stage: "确认暂未完成", working: false });
    }
  },

  retry() { this.start(); },
  back() { wx.navigateBack({ delta: 2 }); },
});
