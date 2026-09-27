const api = require("../../../services/api");
const storage = require("../../../utils/storage");
const { eventToStory } = require("../../../utils/ui");

Page({
  data: { error: "", story: null, summary: "", summaryLength: 0, status: "INPUT", storyExpanded: false },
  onLoad() {
    this.task = getApp().globalData.completionTask;
    if (!this.task) this.setData({ error: "任务信息缺失，无法结算", status: "INPUT" });
  },
  input(event) { const summary = event.detail.value; this.setData({ summary, summaryLength: Array.from(summary).length, error: "" }); },
  validateSummary() {
    const summary = String(this.data.summary || "").trim();
    const length = Array.from(summary).length;
    if (length > 0 && (length < 5 || length > 100)) {
      wx.showToast({ title: "总结请填写 5—100 个字，或直接跳过", icon: "none" });
      return null;
    }
    return summary;
  },
  async submitSummary(summaryOverride) {
    if (!this.task || this.data.status === "SUBMITTING" || this.data.status === "RESULT") return;
    const summary = summaryOverride === "" ? "" : this.validateSummary();
    if (summary === null) return;
    this.setData({ error: "", story: null, status: "SUBMITTING", storyExpanded: false });
    try {
      const result = await api.completeTask(this.task.taskId, summary);
      getApp().globalData.state = result.state;
      storage.set(storage.KEYS.companionEvent, { type: "task_complete", title: this.task.title, resources: this.task.rewardResource || 0 });
      const story = eventToStory(result.event, "任务完成") || { title: "任务完成", body: "已完成「" + this.task.title + "」", meta: "成长 +" + (this.task.rewardGrowth || 0) + " · 资源 +" + (this.task.rewardResource || 0) };
      this.setData({ story, status: "RESULT", storyExpanded: false });
    } catch (error) {
      this.setData({ error: error.message || "任务结算失败", status: "INPUT" });
    }
  },
  complete() { return this.submitSummary(); },
  skipSummary() { return this.submitSummary(""); },
  toggleStory() { this.setData({ storyExpanded: !this.data.storyExpanded }); },
  home() { wx.switchTab({ url: "/pages/home/index" }); },
});
