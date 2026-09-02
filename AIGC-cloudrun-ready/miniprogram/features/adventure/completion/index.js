const api = require("../../../services/api");
const storage = require("../../../utils/storage");
const { eventToStory } = require("../../../utils/ui");

const STAGES = ["正在回收任务线索", "正在计算成长奖励", "正在续写角色记忆", "正在生成下一步建议"];

Page({
  data: { progress: 8, stage: STAGES[0], error: "", story: null, summary: "", submitting: false },
  onLoad() {
    this.task = getApp().globalData.completionTask;
    if (!this.task) this.setData({ error: "任务信息缺失，无法结算" });
  },
  onUnload() { this.stop(); },
  start() {
    this.stop();
    this.timer = setInterval(() => {
      const progress = Math.min(92, this.data.progress + 7);
      this.setData({ progress, stage: STAGES[Math.min(Math.floor(progress / 25), 3)] });
    }, 340);
  },
  input(event) { this.setData({ summary: event.detail.value, error: "" }); },
  validateSummary() {
    const summary = String(this.data.summary || "").trim();
    const length = Array.from(summary).length;
    if (length > 0 && (length < 5 || length > 100)) {
      wx.showToast({ title: "总结请填写 5—100 个字，或直接跳过", icon: "none" });
      return null;
    }
    return summary;
  },
  async complete() {
    if (!this.task || this.data.submitting || this.data.story) return;
    const summary = this.validateSummary();
    if (summary === null) return;
    this.setData({ progress: 8, stage: STAGES[0], error: "", story: null, submitting: true });
    this.start();
    try {
      const result = await api.completeTask(this.task.taskId, summary);
      this.stop();
      getApp().globalData.state = result.state;
      storage.set(storage.KEYS.companionEvent, { type: "task_complete", title: this.task.title, resources: this.task.rewardResource || 0 });
      const story = eventToStory(result.event, "任务完成") || { title: "任务完成", body: "已完成「" + this.task.title + "」", meta: "成长 +" + (this.task.rewardGrowth || 0) + " · 资源 +" + (this.task.rewardResource || 0) };
      this.setData({ progress: 100, stage: "结算完成", story, submitting: false });
    } catch (error) {
      this.stop();
      this.setData({ error: error.message || "任务结算失败", stage: "结算中断", submitting: false });
    }
  },
  home() { wx.switchTab({ url: "/pages/home/index" }); },
});
