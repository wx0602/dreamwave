// Start DevTools automation on port 9420 before running this read-only probe.
const fs = require('fs');
const path = require('path');
const cloud = require('../miniprogram/config/cloud');
const socket = new WebSocket(process.env.WECHAT_AUTOMATION_URL || 'ws://127.0.0.1:9420');
const pending = new Map();
let sequence = 0;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 45000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
};
socket.onerror = () => { console.error('Cannot connect to DevTools automation'); process.exitCode = 1; };
socket.onopen = async () => {
  try {
    const page = await send('App.getCurrentPage');
    const result = await send('App.callFunction', {
      functionDeclaration: `async function(env, service) {
        const results = [];
        for (const path of ['/healthz', '/api/roles']) {
          try {
            const response = await wx.cloud.callContainer({ config: { env }, path, method: 'GET', header: { 'X-WX-SERVICE': service } });
            const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
            results.push({ path, statusCode: response.statusCode, data });
          } catch (error) { results.push({ path, error: error.errMsg || error.message }); }
        }
        return results;
      }`,
      args: [cloud.env, cloud.service],
    });
    const report = { checkedAt: new Date().toISOString(), environment: cloud.env, service: cloud.service, page, checks: result.result };
    const output = path.join(__dirname, '../docs/wechat-cloud-check.json');
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (report.checks.some(check => check.error || check.statusCode !== 200)) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { socket.close(); }
};
