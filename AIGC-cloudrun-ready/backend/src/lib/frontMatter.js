const fs = require("fs");

function countIndent(line) {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function skipBlank(lines, index) {
  let cursor = index;
  while (cursor < lines.length) {
    const trimmed = lines[cursor].trim();
    if (trimmed && !trimmed.startsWith("#")) {
      break;
    }
    cursor += 1;
  }
  return cursor;
}

function parseQuotedString(value) {
  return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, "\"").replace(/\\'/g, "'");
}

function parseInlineArray(value) {
  const inner = value.slice(1, -1).trim();
  if (!inner) {
    return [];
  }

  return inner
    .split(",")
    .map((item) => parseScalar(item.trim()))
    .filter((item) => item !== "");
}

function parseScalar(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (value === "[]") {
    return [];
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return parseQuotedString(value);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return parseInlineArray(value);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (value === "|" || value === ">") {
    throw new Error("当前 Front-matter 解析器不支持 YAML 多行标量，请将长文本写入 Markdown 正文。");
  }
  return value;
}

function parseObject(lines, startIndex, indent) {
  const result = {};
  let index = startIndex;

  while (index < lines.length) {
    index = skipBlank(lines, index);
    if (index >= lines.length) {
      break;
    }

    const line = lines[index];
    const currentIndent = countIndent(line);
    const trimmed = line.trim();

    if (currentIndent < indent) {
      break;
    }
    if (currentIndent !== indent) {
      throw new Error(`YAML 缩进不合法: "${line}"`);
    }
    if (trimmed.startsWith("- ")) {
      throw new Error(`对象节点中不应直接出现数组项: "${line}"`);
    }

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`YAML 键值格式错误: "${line}"`);
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const rawValue = trimmed.slice(colonIndex + 1).trim();

    if (rawValue) {
      result[key] = parseScalar(rawValue);
      index += 1;
      continue;
    }

    const nextIndex = skipBlank(lines, index + 1);
    if (nextIndex >= lines.length || countIndent(lines[nextIndex]) <= currentIndent) {
      result[key] = null;
      index = nextIndex;
      continue;
    }

    const parsed = parseBlock(lines, nextIndex, currentIndent + 2);
    result[key] = parsed.value;
    index = parsed.nextIndex;
  }

  return {
    value: result,
    nextIndex: index,
  };
}

function parseArray(lines, startIndex, indent) {
  const result = [];
  let index = startIndex;

  while (index < lines.length) {
    index = skipBlank(lines, index);
    if (index >= lines.length) {
      break;
    }

    const line = lines[index];
    const currentIndent = countIndent(line);
    const trimmed = line.trim();

    if (currentIndent < indent) {
      break;
    }
    if (currentIndent !== indent || !trimmed.startsWith("- ")) {
      break;
    }

    const rawValue = trimmed.slice(2).trim();

    if (rawValue) {
      result.push(parseScalar(rawValue));
      index += 1;
      continue;
    }

    const nextIndex = skipBlank(lines, index + 1);
    if (nextIndex >= lines.length || countIndent(lines[nextIndex]) <= currentIndent) {
      result.push(null);
      index = nextIndex;
      continue;
    }

    const parsed = parseBlock(lines, nextIndex, currentIndent + 2);
    result.push(parsed.value);
    index = parsed.nextIndex;
  }

  return {
    value: result,
    nextIndex: index,
  };
}

function parseBlock(lines, startIndex, indent) {
  const firstIndex = skipBlank(lines, startIndex);
  if (firstIndex >= lines.length) {
    return {
      value: {},
      nextIndex: firstIndex,
    };
  }

  const firstLine = lines[firstIndex];
  if (countIndent(firstLine) < indent) {
    return {
      value: {},
      nextIndex: firstIndex,
    };
  }

  if (firstLine.trim().startsWith("- ")) {
    return parseArray(lines, firstIndex, indent);
  }

  return parseObject(lines, firstIndex, indent);
}

function parseYamlBlock(yamlText) {
  const lines = yamlText.replace(/\r\n/g, "\n").split("\n");
  const parsed = parseBlock(lines, 0, 0);
  return parsed.value;
}

function parseFrontMatter(content) {
  const normalized = content.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    return {
      attributes: {},
      body: normalized.trim(),
    };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    throw new Error("Front-matter 缺少结束分隔符 ---");
  }

  const yamlBlock = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 5).trim();

  return {
    attributes: parseYamlBlock(yamlBlock),
    body,
  };
}

function parseFrontMatterFile(filePath) {
  return parseFrontMatter(fs.readFileSync(filePath, "utf8"));
}

module.exports = {
  parseFrontMatter,
  parseFrontMatterFile,
};
