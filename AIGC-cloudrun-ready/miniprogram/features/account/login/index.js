const api = require("../../../services/api");
const storage = require("../../../utils/storage");
const { showError } = require("../../../utils/ui");

Page({
  data: { account: "", password: "", loading: false, accountError: "", passwordError: "" },
  onLoad() { this.setData({ account: storage.get(storage.KEYS.loginAccount, "") }); },
  onAccountInput(event) { this.setData({ account: event.detail.value, accountError: "" }); },
  onPasswordInput(event) { this.setData({ password: event.detail.value, passwordError: "" }); },
  async submit() {
    const account = this.data.account.trim();
    const password = this.data.password.trim();
    if (!account || !password) {
      this.setData({ accountError: account ? "" : "请输入账号", passwordError: password ? "" : "请输入密码" });
      return;
    }
    this.setData({ loading: true });
    try {
      const result = await api.loginSession({ account, password });
      const state = result && result.state;
      if (!state || !state.user) throw new Error("登录返回数据异常");
      storage.set(storage.KEYS.loginAccount, account);
      storage.set(storage.KEYS.userId, state.user.userId || "");
      storage.set(storage.KEYS.userName, state.user.nickname || "");
      storage.set(storage.KEYS.selectedRole, state.user.selectedRoleId || "traveler");
      storage.set(storage.KEYS.agentId, (state.agent && state.agent.agentId) || "");
      getApp().globalData.state = state;
      wx.switchTab({ url: "/pages/home/index" });
    } catch (error) {
      const message = error.message || "账号或密码错误，请重试";
      this.setData({ passwordError: message });
      showError(error, "登录失败");
    } finally { this.setData({ loading: false }); }
  },
  goRegister() { wx.redirectTo({ url: "/features/account/role-select/index" }); },
});
