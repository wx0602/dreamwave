function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function handleCors(req, res) {
  if (req.method !== "OPTIONS") {
    return false;
  }

  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end();
  return true;
}

const { AppError } = require("./errors");

function parseBody(req, options = {}) {
  const maxBytes = Number(options.maxBytes) || 64 * 1024;
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    let settled = false;
    req.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) {
        settled = true;
        reject(new AppError("REQUEST_TOO_LARGE", "请求体过大", 413));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => {
      if (settled) return;
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new AppError("INVALID_JSON", "请求体不是合法的 JSON", 400));
      }
    });
    req.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

module.exports = {
  json,
  handleCors,
  parseBody,
};
