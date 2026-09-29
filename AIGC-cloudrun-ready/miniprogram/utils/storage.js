const KEYS = Object.freeze({
  userId: "alliance.userId",
  userName: "alliance.userName",
  loginAccount: "alliance.loginAccount",
  selectedRole: "alliance.selectedRole",
  agentId: "alliance.agentId",
  dungeonDemo: "alliance.dungeonDemo",
  companion: "alliance.companion",
  companionPosition: "alliance.companionPosition",
  companionEvent: "alliance.companionEvent",
  lastOverduePopup: "alliance.lastOverduePopup",
  sessionToken: "alliance.sessionToken",
  clientId: "alliance.clientId",
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
  [KEYS.userId, KEYS.userName, KEYS.agentId, KEYS.companionEvent, KEYS.lastOverduePopup, KEYS.sessionToken]
    .forEach((key) => wx.removeStorageSync(key));
}

function getOrCreateClientId() {
  const existing = get(KEYS.clientId, "");
  if (existing) return existing;
  const value = `mp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  set(KEYS.clientId, value);
  return value;
}

module.exports = { KEYS, get, set, clearSession, getOrCreateClientId };
