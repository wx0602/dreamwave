const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

function runWithRequestContext(context, action) {
  return storage.run(context, action);
}

function getRequestContext() {
  return storage.getStore() || null;
}

function requireRequestContext() {
  const context = getRequestContext();
  if (!context) throw new Error("当前操作缺少请求上下文");
  return context;
}

module.exports = {
  runWithRequestContext,
  getRequestContext,
  requireRequestContext,
};
