const env = require("../config/env");

function getResolvedApiKey(overrideApiKey) {
  return (overrideApiKey || env.deepseek.apiKey || "").trim();
}

function stripJsonFence(content) {
  return content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function chatCompletion(messages, options = {}) {
  const apiKey = getResolvedApiKey(options.apiKey);

  if (!apiKey) {
    return null;
  }

  const payload = {
    model: env.deepseek.model,
    messages,
    temperature: options.temperature ?? 0.8,
    max_tokens: options.maxTokens ?? 360,
  };

  if (options.responseFormat) {
    payload.response_format = options.responseFormat;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number(options.timeoutMs) || env.deepseek.timeoutMs || 25000
  );
  let response;
  try {
    response = await fetch(env.deepseek.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("DeepSeek 调用超时");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek 调用失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function jsonCompletion(messages, options = {}) {
  const content = await chatCompletion(messages, {
    ...options,
    temperature: options.temperature ?? 0.6,
    responseFormat: options.responseFormat || { type: "json_object" },
  });

  if (!content) {
    return null;
  }

  return JSON.parse(stripJsonFence(content));
}

module.exports = {
  chatCompletion,
  jsonCompletion,
  getResolvedApiKey,
};
