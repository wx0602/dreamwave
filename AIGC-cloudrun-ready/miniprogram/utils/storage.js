const KEYS = Object.freeze({
  userId: "alliance.userId",
  userName: "alliance.userName",
  loginAccount: "alliance.loginAccount",
  selectedRole: "alliance.selectedRole",
  agentId: "alliance.agentId",
  dungeonDemo: "alliance.dungeonDemo",
  companion: "alliance.companion",
  companionEvent: "alliance.companionEvent",
  lastOverduePopup: "alliance.lastOverduePopup",
});

function get(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value === "" || value === undefined || value === null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function set(key, value) {
  wx.setStorageSync(key, value);
}

function clearSession() {
  [KEYS.userId, KEYS.userName, KEYS.agentId, KEYS.companionEvent, KEYS.lastOverduePopup]
    .forEach((key) => wx.removeStorageSync(key));
}

module.exports = { KEYS, get, set, clearSession };
