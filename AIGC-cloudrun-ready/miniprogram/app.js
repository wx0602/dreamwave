const cloudConfig = require("./config/cloud");

App({
  globalData: {
    state: null,
    registrationPayload: null,
    goalSetupPayload: null,
    goalDraft: null,
    confirmationPayload: null,
    focusTask: null,
    completionTask: null,
  },
  onLaunch() {
    if (cloudConfig.transport === "local") {
      console.info("小程序正在使用本地后端：" + cloudConfig.localBaseUrl);
      return;
    }
    if (!wx.cloud) {
      console.error("当前基础库不支持 wx.cloud，请升级微信开发者工具基础库");
      return;
    }
    const options = { traceUser: true };
    if (cloudConfig.env) options.env = cloudConfig.env;
    wx.cloud.init(options);
  },
});
