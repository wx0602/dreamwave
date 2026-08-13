const { getSkillsByIds, listPublicSkillsByIds } = require("./agentCatalogService");

const STAT_LABELS = {
  hp: "生命",
  attack: "攻击",
  defense: "防御",
  shield: "护盾",
};

function cloneStats(stats = {}) {
  return {
    hp: Number(stats.hp || 0),
    attack: Number(stats.attack || 0),
    defense: Number(stats.defense || 0),
    shield: Number(stats.shield || 0),
  };
}

function addStats(baseStats = {}, buffStats = {}) {
  const base = cloneStats(baseStats);
  const buffs = cloneStats(buffStats);
  return {
    hp: base.hp + buffs.hp,
    attack: base.attack + buffs.attack,
    defense: base.defense + buffs.defense,
    shield: base.shield + buffs.shield,
  };
}

function mergeStats(targetStats = {}, patchStats = {}) {
  const nextTarget = cloneStats(targetStats);
  const patch = cloneStats(patchStats);
  return {
    hp: nextTarget.hp + patch.hp,
    attack: nextTarget.attack + patch.attack,
    defense: nextTarget.defense + patch.defense,
    shield: nextTarget.shield + patch.shield,
  };
}

function parseEstimateMinutes(estimate) {
  const match = String(estimate || "").match(/(\d+)\s*分钟?/);
  if (match) {
    return Number(match[1]);
  }

  const fallback = String(estimate || "").match(/(\d+)/);
  return fallback ? Number(fallback[1]) : 0;
}

function buildTriggerLabel(trigger = {}) {
  if (trigger.label) {
    return trigger.label;
  }

  switch (trigger.type) {
    case "always":
      return "总是触发";
    case "task_estimate_minutes_gte":
      return `任务预计时长 >= ${Number(trigger.value || 0)} 分钟`;
    case "streak_gte":
      return `连续打卡 >= ${Number(trigger.value || 0)} 次`;
    case "task_type_is":
      return `任务类型 = ${String(trigger.value || "")}`;
    default:
      return `${trigger.type}: ${String(trigger.value || "")}`;
  }
}

function formatStatSummary(stats = {}, options = {}) {
  const source = cloneStats(stats);
  const onlyNonZero = Boolean(options.onlyNonZero);

  const parts = Object.keys(STAT_LABELS)
    .filter((key) => !onlyNonZero || source[key] !== 0)
    .map((key) => `${STAT_LABELS[key]} ${options.prefix || ""}${source[key]}`);

  return parts.length > 0 ? parts.join(" / ") : "无";
}

function buildInitialSkillState(role) {
  return {
    unlockedSkillIds: [...role.initialSkillIds],
    lastTriggeredSkillIds: [],
    activationCount: 0,
    lastTriggeredAt: null,
  };
}

function buildInitialDungeonProfile(role) {
  return {
    roleId: role.id,
    baseStats: cloneStats(role.dungeonBaseStats),
    temporaryBuffs: cloneStats(),
  };
}

function getDungeonProfileSnapshot(dungeonProfile) {
  const baseStats = cloneStats(dungeonProfile && dungeonProfile.baseStats);
  const temporaryBuffs = cloneStats(dungeonProfile && dungeonProfile.temporaryBuffs);
  return {
    roleId: dungeonProfile ? dungeonProfile.roleId : null,
    baseStats,
    temporaryBuffs,
    currentStats: addStats(baseStats, temporaryBuffs),
  };
}

function getSkillStateSnapshot(skillState) {
  const source = skillState || {};
  return {
    unlockedSkillIds: Array.isArray(source.unlockedSkillIds) ? [...source.unlockedSkillIds] : [],
    unlockedSkills: listPublicSkillsByIds(source.unlockedSkillIds || []),
    lastTriggeredSkillIds: Array.isArray(source.lastTriggeredSkillIds)
      ? [...source.lastTriggeredSkillIds]
      : [],
    lastTriggeredSkills: listPublicSkillsByIds(source.lastTriggeredSkillIds || []),
    activationCount: Number(source.activationCount || 0),
    lastTriggeredAt: source.lastTriggeredAt || null,
  };
}

function buildSkillInventoryEntries(skillIds = []) {
  return listPublicSkillsByIds(skillIds).map((skill) => ({
    id: `skill:${skill.id}`,
    name: skill.name,
    detail: `${skill.description}｜触发条件：${buildTriggerLabel(skill.trigger)}`,
    equipped: true,
    category: "skill",
  }));
}

function isSkillUsableByRole(skill, roleId) {
  return skill.scope === "universal" || skill.ownerRoleIds.length === 0 || skill.ownerRoleIds.includes(roleId);
}

function isSkillTriggered(skill, task, state) {
  const trigger = skill.trigger || {};

  switch (trigger.type) {
    case "always":
      return true;
    case "task_estimate_minutes_gte":
      return parseEstimateMinutes(task.estimate) >= Number(trigger.value || 0);
    case "streak_gte":
      return Number(state.stats && state.stats.streak ? state.stats.streak : 0) >= Number(trigger.value || 0);
    case "task_type_is":
      return String(task.type || "") === String(trigger.value || "");
    default:
      return false;
  }
}

function evaluateTriggeredSkills({ role, state, task }) {
  const unlockedSkillIds =
    state.skillState && Array.isArray(state.skillState.unlockedSkillIds)
      ? state.skillState.unlockedSkillIds
      : role.initialSkillIds;

  const unlockedSkills = getSkillsByIds(unlockedSkillIds).filter((skill) =>
    isSkillUsableByRole(skill, role.id)
  );

  const triggeredSkills = unlockedSkills.filter((skill) => isSkillTriggered(skill, task, state));
  const effectTotals = triggeredSkills.reduce(
    (totals, skill) => {
      totals.rewardGrowthPct += Number(skill.mechanicalEffects.rewardGrowthPct || 0);
      totals.rewardGrowthFlat += Number(skill.mechanicalEffects.rewardGrowthFlat || 0);
      totals.rewardResourcePct += Number(skill.mechanicalEffects.rewardResourcePct || 0);
      totals.rewardResourceFlat += Number(skill.mechanicalEffects.rewardResourceFlat || 0);
      totals.dungeonBuff = mergeStats(totals.dungeonBuff, skill.mechanicalEffects.dungeonBuff);
      return totals;
    },
    {
      rewardGrowthPct: 0,
      rewardGrowthFlat: 0,
      rewardResourcePct: 0,
      rewardResourceFlat: 0,
      dungeonBuff: cloneStats(),
    }
  );

  const rewardGrowthDelta =
    Math.round(Number(task.rewardGrowth || 0) * (effectTotals.rewardGrowthPct / 100)) +
    effectTotals.rewardGrowthFlat;
  const rewardResourceDelta =
    Math.round(Number(task.rewardResource || 0) * (effectTotals.rewardResourcePct / 100)) +
    effectTotals.rewardResourceFlat;

  return {
    triggeredSkills,
    publicTriggeredSkills: listPublicSkillsByIds(triggeredSkills.map((skill) => skill.id)),
    effectTotals,
    rewardGrowthDelta,
    rewardResourceDelta,
    promptText: triggeredSkills.map((skill) => skill.promptText).join("\n\n"),
  };
}

function applyTriggeredSkillEffects(state, skillResolution) {
  const nextDungeonBuffs = mergeStats(
    state.dungeon && state.dungeon.temporaryBuffs,
    skillResolution.effectTotals.dungeonBuff
  );

  state.stats.growth += skillResolution.rewardGrowthDelta;
  state.stats.resources += skillResolution.rewardResourceDelta;
  state.dungeon.temporaryBuffs = nextDungeonBuffs;
  state.skillState.lastTriggeredSkillIds = skillResolution.triggeredSkills.map((skill) => skill.id);

  if (skillResolution.triggeredSkills.length > 0) {
    state.skillState.activationCount += skillResolution.triggeredSkills.length;
    state.skillState.lastTriggeredAt = new Date().toISOString();
  }
}

function clearLastTriggeredSkills(state) {
  state.skillState.lastTriggeredSkillIds = [];
}

function buildSkillEffectSummary(skillResolution) {
  if (!skillResolution || skillResolution.triggeredSkills.length === 0) {
    return "";
  }

  const parts = [`触发技能：${skillResolution.triggeredSkills.map((skill) => skill.name).join("、")}`];

  if (skillResolution.rewardGrowthDelta > 0) {
    parts.push(`成长值额外 +${skillResolution.rewardGrowthDelta}`);
  }
  if (skillResolution.rewardResourceDelta > 0) {
    parts.push(`资源点额外 +${skillResolution.rewardResourceDelta}`);
  }

  const dungeonBuffSummary = formatStatSummary(skillResolution.effectTotals.dungeonBuff, {
    onlyNonZero: true,
    prefix: "+",
  });
  if (dungeonBuffSummary !== "无") {
    parts.push(`副本增益 ${dungeonBuffSummary}`);
  }

  return `${parts.join("；")}。`;
}

module.exports = {
  buildInitialSkillState,
  buildInitialDungeonProfile,
  getDungeonProfileSnapshot,
  getSkillStateSnapshot,
  buildSkillInventoryEntries,
  buildTriggerLabel,
  formatStatSummary,
  evaluateTriggeredSkills,
  applyTriggeredSkillEffects,
  clearLastTriggeredSkills,
  buildSkillEffectSummary,
};
