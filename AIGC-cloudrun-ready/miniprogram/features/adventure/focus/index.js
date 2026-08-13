const { ROLE_META, normalizeRoleId } = require("../../../utils/roles");
const { formatTimer } = require("../../../utils/ui");

Page({
  data: { task: {}, mode: "focus", modeLabel: "专注进行中", hint: "专注，是一场朝圣之旅", seconds: 1500, focusSeconds: 1500, timer: "25:00", background: "", paused: false, pauseModal: false, restDoneModal: false },
  onLoad() {
    const task = getApp().globalData.focusTask;
    if (!task) { wx.showToast({ title: "任务信息缺失", icon: "none" }); wx.navigateBack(); return; }
    const state = getApp().globalData.state || {};
    const roleId = normalizeRoleId((state.agent && state.agent.roleId) || "traveler");
    const seconds = Math.max(1, Number(task.estimatedMinutes) || 25) * 60;
    this.setData({ task, seconds, focusSeconds: seconds, timer: formatTimer(seconds), background: ROLE_META[roleId].focus, roleId });
    this.startTimer();
  },
  onHide() { this.stopTimer(); this.setData({ paused: true }); },
  onShow() { if (this.data.task.taskId && this.data.paused && !this.data.pauseModal && !this.data.restDoneModal) this.startTimer(); },
  onUnload() { this.stopTimer(); },
  startTimer() {
    this.stopTimer();
    this.setData({ paused: false });
    this.interval = setInterval(() => {
      const seconds = Math.max(0, this.data.seconds - 1);
      this.setData({ seconds, timer: formatTimer(seconds) });
      if (!seconds) {
        this.stopTimer();
        if (this.data.mode === "rest") this.setData({ restDoneModal: true });
        else this.finish();
      }
    }, 1000);
  },
  stopTimer() { if (this.interval) clearInterval(this.interval); this.interval = null; },
  pause() { this.stopTimer(); this.setData({ paused: true, pauseModal: true }); },
  resume() { this.setData({ pauseModal: false, restDoneModal: false }); this.startTimer(); },
  rest() {
    this.setData({ pauseModal: false, mode: "rest", modeLabel: "休息中", hint: "放松片刻，让节奏慢下来，准备好再回到任务里。", focusSeconds: this.data.seconds, seconds: 300, timer: "05:00", background: ROLE_META[this.data.roleId].rest });
    this.startTimer();
  },
  resumeFocus() {
    const focusSeconds = Math.max(1, Number(this.data.focusSeconds) || 1);
    this.setData({ pauseModal: false, restDoneModal: false, mode: "focus", modeLabel: "继续专注", hint: "专注，是一场朝圣之旅", seconds: focusSeconds, timer: formatTimer(focusSeconds), background: ROLE_META[this.data.roleId].focus });
    this.startTimer();
  },
  abandon() { this.stopTimer(); wx.showToast({ title: "任务已终止，不计为完成", icon: "none" }); setTimeout(() => wx.navigateBack(), 500); },
  finish() { this.stopTimer(); getApp().globalData.completionTask = this.data.task; wx.redirectTo({ url: "/features/adventure/completion/index" }); },
});
