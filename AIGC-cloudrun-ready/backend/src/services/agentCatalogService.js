const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const { parseFrontMatterFile } = require("../lib/frontMatter");

const DEFAULT_ROLE_ID = "scholar";

const catalog = {
  initialized: false,
  rolesById: new Map(),
  skillsById: new Map(),
  roleList: [],
  skillList: [],
};

function normalizePath(filePath) {
  return path.relative(env.backendRoot, filePath).split(path.sep).join("/");
}

function ensureString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`缺少必填字段 ${fieldName}`);
  }
  return normalized;
}

function ensureStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`字段 ${fieldName} 必须为数组`);
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function ensureNumber(value, fieldName, fallback = 0) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`字段 ${fieldName} 必须为数字`);
  }
  return numeric;
}

function normalizeDungeonBaseStats(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    hp: ensureNumber(source.hp, "dungeonBaseStats.hp", 100),
    attack: ensureNumber(source.attack, "dungeonBaseStats.attack", 10),
    defense: ensureNumber(source.defense, "dungeonBaseStats.defense", 8),
    shield: ensureNumber(source.shield, "dungeonBaseStats.shield", 0),
  };
}

function normalizeDeltaStats(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    hp: ensureNumber(source.hp, "mechanicalEffects.dungeonBuff.hp", 0),
    attack: ensureNumber(source.attack, "mechanicalEffects.dungeonBuff.attack", 0),
    defense: ensureNumber(source.defense, "mechanicalEffects.dungeonBuff.defense", 0),
    shield: ensureNumber(source.shield, "mechanicalEffects.dungeonBuff.shield", 0),
  };
}

function normalizeMechanicalEffects(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    rewardGrowthPct: ensureNumber(source.rewardGrowthPct, "mechanicalEffects.rewardGrowthPct", 0),
    rewardGrowthFlat: ensureNumber(
      source.rewardGrowthFlat,
      "mechanicalEffects.rewardGrowthFlat",
      0
    ),
    rewardResourcePct: ensureNumber(
      source.rewardResourcePct,
      "mechanicalEffects.rewardResourcePct",
      0
    ),
    rewardResourceFlat: ensureNumber(
      source.rewardResourceFlat,
      "mechanicalEffects.rewardResourceFlat",
      0
    ),
    dungeonBuff: normalizeDeltaStats(source.dungeonBuff),
  };
}

function normalizeTrigger(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    type: ensureString(source.type || "always", "trigger.type"),
    value: source.value ?? 0,
    label: String(source.label || "").trim(),
  };
}

function normalizeRole(filePath) {
  const parsed = parseFrontMatterFile(filePath);
  const attributes = parsed.attributes || {};

  if (!parsed.body) {
    throw new Error(`${normalizePath(filePath)} 缺少 Markdown Prompt 正文`);
  }

  return {
    id: ensureString(attributes.id, "role.id"),
    name: ensureString(attributes.name, "role.name"),
    description: ensureString(attributes.description, "role.description"),
    spriteClass: ensureString(attributes.spriteClass, "role.spriteClass"),
    tone: ensureString(attributes.tone, "role.tone"),
    world: ensureString(attributes.world, "role.world"),
    chapter: ensureString(attributes.chapter, "role.chapter"),
    agentName: ensureString(attributes.agentName, "role.agentName"),
    prologue: ensureString(attributes.prologue, "role.prologue"),
    speechStyle: ensureString(attributes.speechStyle, "role.speechStyle"),
    personality: ensureString(attributes.personality, "role.personality"),
    preferredNarrativeKeywords: ensureStringArray(
      attributes.preferredNarrativeKeywords || [],
      "role.preferredNarrativeKeywords"
    ),
    initialSkillIds: ensureStringArray(attributes.initialSkillIds || [], "role.initialSkillIds"),
    dungeonBaseStats: normalizeDungeonBaseStats(attributes.dungeonBaseStats),
    systemPrompt: parsed.body,
    configPath: normalizePath(filePath),
  };
}

function normalizeSkill(filePath) {
  const parsed = parseFrontMatterFile(filePath);
  const attributes = parsed.attributes || {};

  if (!parsed.body) {
    throw new Error(`${normalizePath(filePath)} 缺少 Markdown Prompt 正文`);
  }

  return {
    id: ensureString(attributes.id, "skill.id"),
    name: ensureString(attributes.name, "skill.name"),
    description: ensureString(attributes.description, "skill.description"),
    scope: ensureString(attributes.scope || "universal", "skill.scope"),
    ownerRoleIds: ensureStringArray(attributes.ownerRoleIds || [], "skill.ownerRoleIds"),
    trigger: normalizeTrigger(attributes.trigger),
    mechanicalEffects: normalizeMechanicalEffects(attributes.mechanicalEffects),
    promptText: parsed.body,
    configPath: normalizePath(filePath),
  };
}

function readMarkdownDirectory(dirPath, normalizer) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`配置目录不存在: ${normalizePath(dirPath)}`);
  }

  return fs
    .readdirSync(dirPath)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort()
    .map((fileName) => normalizer(path.join(dirPath, fileName)));
}

function buildPublicSkill(skill) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    scope: skill.scope,
    ownerRoleIds: [...skill.ownerRoleIds],
    trigger: { ...skill.trigger },
    mechanicalEffects: {
      ...skill.mechanicalEffects,
      dungeonBuff: { ...skill.mechanicalEffects.dungeonBuff },
    },
    configPath: skill.configPath,
  };
}

function buildPublicRole(role, nextSkillsById) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    spriteClass: role.spriteClass,
    tone: role.tone,
    world: role.world,
    chapter: role.chapter,
    agentName: role.agentName,
    prologue: role.prologue,
    speechStyle: role.speechStyle,
    personality: role.personality,
    preferredNarrativeKeywords: [...role.preferredNarrativeKeywords],
    initialSkillIds: [...role.initialSkillIds],
    startingSkills: role.initialSkillIds
      .map((skillId) => nextSkillsById.get(skillId))
      .filter(Boolean)
      .map(buildPublicSkill),
    dungeonBaseStats: { ...role.dungeonBaseStats },
    configPath: role.configPath,
  };
}

function initializeAgentCatalog() {
  const nextRoles = readMarkdownDirectory(env.roleConfigDir, normalizeRole);
  const nextSkills = readMarkdownDirectory(env.skillConfigDir, normalizeSkill);

  if (nextRoles.length === 0) {
    throw new Error("未找到任何角色配置文件");
  }

  const rolesById = new Map();
  const skillsById = new Map();

  nextRoles.forEach((role) => {
    if (rolesById.has(role.id)) {
      throw new Error(`角色 ID 重复: ${role.id}`);
    }
    rolesById.set(role.id, role);
  });

  nextSkills.forEach((skill) => {
    if (skillsById.has(skill.id)) {
      throw new Error(`技能 ID 重复: ${skill.id}`);
    }
    skillsById.set(skill.id, skill);
  });

  nextRoles.forEach((role) => {
    role.initialSkillIds.forEach((skillId) => {
      if (!skillsById.has(skillId)) {
        throw new Error(`角色 ${role.id} 引用了不存在的技能 ${skillId}`);
      }
    });
  });

  nextSkills.forEach((skill) => {
    skill.ownerRoleIds.forEach((roleId) => {
      if (!rolesById.has(roleId)) {
        throw new Error(`技能 ${skill.id} 绑定了不存在的角色 ${roleId}`);
      }
    });
  });

  catalog.initialized = true;
  catalog.rolesById = rolesById;
  catalog.skillsById = skillsById;
  catalog.roleList = nextRoles;
  catalog.skillList = nextSkills;

  return {
    roles: listRoles(),
    skills: listSkills(),
  };
}

function ensureCatalog() {
  if (!catalog.initialized) {
    initializeAgentCatalog();
  }
  return catalog;
}

function getRole(roleId) {
  const current = ensureCatalog();
  return (
    current.rolesById.get(roleId) ||
    current.rolesById.get(DEFAULT_ROLE_ID) ||
    current.roleList[0]
  );
}

function getRoleOrThrow(roleId) {
  const normalized = String(roleId || "").trim();
  const current = ensureCatalog();
  const role = current.rolesById.get(normalized);
  if (!role) {
    throw new Error(`角色不存在: ${normalized || "empty"}`);
  }
  return role;
}

function getRolesMap() {
  const current = ensureCatalog();
  return current.roleList.reduce((accumulator, role) => {
    accumulator[role.id] = buildPublicRole(role, current.skillsById);
    return accumulator;
  }, {});
}

function listRoles() {
  const current = ensureCatalog();
  return current.roleList.map((role) => buildPublicRole(role, current.skillsById));
}

function getSkill(skillId) {
  const current = ensureCatalog();
  return current.skillsById.get(skillId) || null;
}

function getSkillsByIds(skillIds = []) {
  return skillIds
    .map((skillId) => getSkill(skillId))
    .filter(Boolean);
}

function listSkills() {
  const current = ensureCatalog();
  return current.skillList.map(buildPublicSkill);
}

function listPublicSkillsByIds(skillIds = []) {
  return getSkillsByIds(skillIds).map(buildPublicSkill);
}

module.exports = {
  initializeAgentCatalog,
  getRole,
  getRoleOrThrow,
  getRolesMap,
  listRoles,
  getSkill,
  getSkillsByIds,
  listSkills,
  listPublicSkillsByIds,
};
