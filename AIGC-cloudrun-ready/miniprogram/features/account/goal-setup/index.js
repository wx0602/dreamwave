Page({
  data: {
    title: "",
    days: "30",
    dailyTime: "2 小时",
    currentLevel: "UNSYSTEMATIC",
    sourcePreference: "ANY",
    accessPreference: "FREE_ONLY",
    timeOptions: ["30 分钟", "1 小时", "2 小时", "3 小时"],
    levelOptions: [{ value: "BEGINNER", label: "刚开始接触" }, { value: "UNSYSTEMATIC", label: "有基础但不成体系" }, { value: "SPRINT", label: "短期冲刺" }],
    sourceOptions: [{ value: "ANY", label: "让 Agent 判断" }, { value: "VIDEO", label: "视频课程" }, { value: "TEXT", label: "教材 / 文档" }, { value: "PRACTICE", label: "练习 / 项目" }],
    accessOptions: [{ value: "FREE_ONLY", label: "仅免费" }, { value: "PAID_OK", label: "可接受付费" }, { value: "OWNED", label: "我已有资料" }],
    errors: {},
  },
  noop() {},
  onInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value, [`errors.${key}`]: "" });
  },
  timeChange(event) { this.setData({ dailyTime: this.data.timeOptions[event.detail.value] }); },
  levelChange(event) { const item = this.data.levelOptions[event.detail.value]; this.setData({ currentLevel: item.value }); },
  sourceChange(event) { const item = this.data.sourceOptions[event.detail.value]; this.setData({ sourcePreference: item.value }); },
  accessChange(event) { const item = this.data.accessOptions[event.detail.value]; this.setData({ accessPreference: item.value }); },
  submit() {
    const title = this.data.title.trim();
    const days = Number(this.data.days);
    const errors = {};
    if (!title) errors.title = "请写下一个长期目标";
    if (!Number.isFinite(days) || days < 1 || days > 365) errors.days = "请输入 1—365 天";
    if (Object.keys(errors).length) { this.setData({ errors }); return; }
    getApp().globalData.goalSetupPayload = {
      title,
      durationDays: Math.round(days),
      deadline: Math.round(days) + " 天后",
      dailyTime: this.data.dailyTime,
      currentLevel: this.data.currentLevel,
      sourcePreference: this.data.sourcePreference,
      accessPreference: this.data.accessPreference,
    };
    getApp().globalData.goalDraft = null;
    wx.navigateTo({ url: "/features/account/source-select/index?mode=PARALLEL" });
  },
  back() { wx.navigateBack(); },
});
