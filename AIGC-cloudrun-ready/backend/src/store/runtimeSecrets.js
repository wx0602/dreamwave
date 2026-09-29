const runtimeSecrets = {
  deepseekApiKey: "",
};
const { getRequestContext } = require("../context/requestContext");

function setDeepseekApiKey(apiKey) {
  const value = (apiKey || "").trim();
  const context = getRequestContext();
  if (context) {
    context.apiKey = value;
    return;
  }
  runtimeSecrets.deepseekApiKey = value;
}

function getDeepseekApiKey() {
  const context = getRequestContext();
  if (context) return context.apiKey || "";
  return runtimeSecrets.deepseekApiKey;
}

function clearRuntimeSecrets() {
  const context = getRequestContext();
  if (context) {
    context.apiKey = "";
    return;
  }
  runtimeSecrets.deepseekApiKey = "";
}

module.exports = {
  setDeepseekApiKey,
  getDeepseekApiKey,
  clearRuntimeSecrets,
};
