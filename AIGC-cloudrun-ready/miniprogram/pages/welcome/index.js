const api = require("../../services/api");

Page({
  data: { title: "", subtitle: "", ready: false, loading: false },
  onLoad() {
    this.timers = [];
    this.typeText("title", "欢迎来到任务织梦师", 85, () => {
      this.later(() => this.typeText("subtitle", "把学习目标拆成任务，把过程写成冒险故事。", 42, () => {
        this.later(() => this.setData({ ready: true }), 260);
      }), 180);
    });
  },
  onUnload() { (this.timers || []).forEach(clearTimeout); },
  later(callback, delay) {
    const timer = setTimeout(callback, delay);
    this.timers.push(timer);
  },
  typeText(field, text, delay, done) {
    let index = 0;
    const step = () => {
      index += 1;
      this.setData({ [field]: text.slice(0, index) });
      if (index < text.length) this.later(step, delay);
      else if (done) done();
    };
    step();
  },
  async startAdventure() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try { await api.listRoles(); } catch (error) { /* 角色页有本地视觉兜底 */ }
    wx.navigateTo({ url: "/features/account/role-select/index" });
    this.setData({ loading: false });
  },
  goLogin() { wx.navigateTo({ url: "/features/account/login/index" }); },
});
