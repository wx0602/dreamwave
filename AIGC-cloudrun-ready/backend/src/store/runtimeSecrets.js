const runtimeSecrets = {
  deepseekApiKey: "",
};

function setDeepseekApiKey(apiKey) {
  runtimeSecrets.deepseekApiKey = (apiKey || "").trim();
}

function getDeepseekApiKey() {
  return runtimeSecrets.deepseekApiKey;
}

function clearRuntimeSecrets() {
  runtimeSecrets.deepseekApiKey = "";
}

module.exports = {
  setDeepseekApiKey,
  getDeepseekApiKey,
  clearRuntimeSecrets,
};
