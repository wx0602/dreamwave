const dns = require("dns").promises;
const net = require("net");
const { URL } = require("url");
const { AppError } = require("../lib/errors");

function isPrivateIp(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const parts = address.split(".").map(Number);
    return parts[0] === 10
      || parts[0] === 127
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || parts[0] === 0;
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1"
      || normalized === "::"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe8")
      || normalized.startsWith("fe9")
      || normalized.startsWith("fea")
      || normalized.startsWith("feb");
  }
  return true;
}

async function assertSafeUrl(value, options = {}) {
  const raw = String(value || "").trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new AppError("SOURCE_URL_INVALID", "来源链接不是合法 URL", 400);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError("SOURCE_URL_INVALID", "来源链接只允许 HTTP 或 HTTPS", 400);
  }
  if (parsed.username || parsed.password) {
    throw new AppError("SOURCE_URL_UNSAFE", "来源链接不能包含账号或密码", 400);
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new AppError("SOURCE_URL_UNSAFE", "来源链接指向了受限主机", 400);
  }
  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new AppError("SOURCE_URL_UNSAFE", "来源链接指向了私有网络地址", 400);
  }
  if (!options.skipDns) {
    let records;
    try {
      records = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch (error) {
      throw new AppError("SOURCE_URL_UNAVAILABLE", "来源主机无法解析", 400);
    }
    if (!records.length || records.some((record) => isPrivateIp(record.address))) {
      throw new AppError("SOURCE_URL_UNSAFE", "来源主机解析到了受限网络地址", 400);
    }
  }
  return parsed;
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "source"].forEach((key) => {
      parsed.searchParams.delete(key);
    });
    parsed.hash = "";
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch (error) {
    return raw;
  }
}

async function verifyUrl(value, options = {}) {
  const parsed = await assertSafeUrl(value);
  const timeoutMs = Math.max(500, Math.min(5000, Number(options.timeoutMs) || 2500));
  let current = parsed;
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/html,text/plain,application/json", "User-Agent": "DreamwaveSourceVerifier/1.0" },
      });
      if (response.status === 405 || response.status === 501) {
        response = await fetch(current, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: { Accept: "text/html,text/plain,application/json", Range: "bytes=0-0", "User-Agent": "DreamwaveSourceVerifier/1.0" },
        });
      }
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        current = await assertSafeUrl(new URL(response.headers.get("location"), current).toString());
        continue;
      }
      return {
        url: current.toString(),
        status: response.status,
        accessible: response.status >= 200 && response.status < 300,
        requiresLogin: response.status === 401 || response.status === 403,
        verificationStatus: response.status >= 200 && response.status < 300
          ? "VERIFIED"
          : response.status === 401 || response.status === 403 ? "PARTIAL" : "UNAVAILABLE",
        contentType: String(response.headers.get("content-type") || "").split(";")[0].trim(),
      };
    } catch (error) {
      return {
        url: current.toString(),
        status: 0,
        accessible: false,
        requiresLogin: false,
        verificationStatus: "UNAVAILABLE",
        error: error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return { url: current.toString(), status: 0, accessible: false, requiresLogin: false, verificationStatus: "UNAVAILABLE" };
}

module.exports = {
  isPrivateIp,
  assertSafeUrl,
  normalizeUrl,
  verifyUrl,
};
