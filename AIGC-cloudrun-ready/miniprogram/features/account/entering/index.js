const api = require("../../../services/api");
const storage = require("../../../utils/storage");

const STAGES = ["正在整理你的目标线索", "正在召唤专属 Agent", "正在拆解初始任务", "正在写入世界档案"];

Page({
  data: { progress: 8, stage: STAGES[0], error: "", working: false },
  onLoad() {
    this.payload = getApp().globalData.registrationPayload;
    if (!this.payload) { this.setData({ error: "初始化参数缺失" }); return; }
    this.start();
  },
  onUnload() { this.stopProgress(); },
  startProgress() {
    this.stopProgress();
    this.progressTimer = setInterval(() => {
      const progress = Math.min(this.data.progress + 7, 92);
      this.setData({ progress, stage: STAGES[Math.min(Math.floor(progress / 25), STAGES.length - 1)] });
    }, 360);
  },
  stopProgress() { if (this.progressTimer) clearInterval(this.progressTimer); this.progressTimer = null; },
  async start() {
    if (this.data.working || !this.payload) return;
    this.setData({ progress: 8, stage: STAGES[0], error: "", working: true });
    this.startProgress();
    try {
      const result = await api.createSession(this.payload);
      if (!result || !result.state) throw new Error("初始化返回为空");
      const state = result.state;
      storage.set(storage.KEYS.loginAccount, this.payload.account);
      storage.set(storage.KEYS.userName, this.payload.name);
      storage.set(storage.KEYS.selectedRole, this.payload.roleId);
      storage.set(storage.KEYS.userId, (state.user && state.user.userId) || "");
      storage.set(storage.KEYS.agentId, (state.agent && state.agent.agentId) || "");
      getApp().globalData.state = state;
      getApp().globalData.registrationPayload = null;
      this.stopProgress();
      this.setData({ progress: 100, stage: "世界入口已开启", working: false });
      setTimeout(() => wx.redirectTo({ url: "/features/account/init-result/index" }), 420);
    } catch (error) {
      this.stopProgress();
      this.setData({ error: error.message || "世界生成失败", stage: "入口暂未开启", working: false });
    }
  },
  back() { wx.navigateBack(); },
});
