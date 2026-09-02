const storage = require("../../../utils/storage");
const { getRoleImage, normalizeRoleId } = require("../../../utils/roles");

Page({
  data: {
    roleId: "traveler", roleImage: getRoleImage("traveler"), account: "", password: "", name: "", goal: "",
    deadline: "30 天后", dailyTime: "2 小时", deadlineOptions: ["14 天后", "30 天后", "60 天后", "90 天后"],
    timeOptions: ["30 分钟", "1 小时", "2 小时", "3 小时"], errors: {},
  },
  onLoad(query) {
    const roleId = normalizeRoleId(query.roleId || storage.get(storage.KEYS.selectedRole, "traveler"));
    this.setData({ roleId, roleImage: getRoleImage(roleId) });
  },
  input(event) { const key = event.currentTarget.dataset.key; this.setData({ [key]: event.detail.value, [`errors.${key}`]: "" }); },
  deadlineChange(event) { this.setData({ deadline: this.data.deadlineOptions[event.detail.value] }); },
  timeChange(event) { this.setData({ dailyTime: this.data.timeOptions[event.detail.value] }); },
  submit() {
    const fields = ["account", "password", "name", "goal"];
    const errors = {};
    fields.forEach((key) => { if (!this.data[key].trim()) errors[key] = "此项不能为空"; });
    if (this.data.password && this.data.password.length < 6) errors.password = "密码至少 6 位";
    if (Object.keys(errors).length) { this.setData({ errors }); return; }
    const payload = {
      account: this.data.account.trim(), password: this.data.password,
      name: this.data.name.trim(), goal: this.data.goal.trim(),
      deadline: this.data.deadline, dailyTime: this.data.dailyTime, roleId: this.data.roleId,
    };
    getApp().globalData.registrationPayload = payload;
    getApp().globalData.goalDraft = null;
    wx.navigateTo({ url: "/features/account/source-select/index" });
  },
});
