const fs = require("fs");
const path = require("path");

const { getAgentDir } = require("../store/sessionStore");
const { formatStatSummary } = require("./skillEngineService");

function ensureAgentWorkspace(agentId) {
  const agentDir = getAgentDir(agentId);
  fs.mkdirSync(agentDir, { recursive: true });
  return {
    agentDir,
    identityPath: path.join(agentDir, "IDENTITY.md"),
    memoryPath: path.join(agentDir, "MEMORY.md"),
  };
}

function formatSkillNames(skills = []) {
  return skills.length > 0 ? skills.map((skill) => skill.name).join(", ") : "无";
}

function formatTitleNames(titles = []) {
  return titles.length > 0 ? titles.map((title) => title.name).join(", ") : "无";
}

function buildIdentityMarkdown({
  role,
  profile,
  agent,
  skillState,
  dungeonProfile,
  skillConfigPaths,
  characterArc,
  memoryTree,
  worldState,
}) {
  return `# IDENTITY

## 基础身份

- agentId: ${agent.agentId}
- agentName: ${agent.agentName}
- roleId: ${role.id}
- roleName: ${role.name}
- storyTone: ${role.tone}
- chapter: ${agent.chapter}
- stage: ${agent.stage}
- emotion: ${agent.emotion}

## 配置来源

- roleConfigPath: ${agent.roleConfigPath}
- skillConfigPaths: ${skillConfigPaths.length > 0 ? skillConfigPaths.join(", ") : "无"}

## 角色职责

- 负责把用户的学习行为转译为冒险叙事
- 负责记录主线、支线、奖励与成长变化
- 负责根据技能触发条件，动态拼装加戏 Prompt 与夜间副本 Buff
- 负责维护 L1/L2/L3 记忆树与世界线实体
- 在用户完成当前阶段主线后，提醒输入下一阶段目标

## 表达风格

- speechStyle: ${role.speechStyle}
- personality: ${role.personality}
- keywords: ${role.preferredNarrativeKeywords.join(", ")}

## 当前角色弧光

- arcId: ${characterArc.id}
- arcLabel: ${characterArc.label}
- arcTone: ${characterArc.tone}

## 当前用户目标

- userName: ${profile.name}
- goal: ${profile.goal}
- deadline: ${profile.deadline}
- dailyTime: ${profile.dailyTime}

## 技能装配状态

- unlockedSkills: ${formatSkillNames(skillState.unlockedSkills)}
- lastTriggeredSkills: ${formatSkillNames(skillState.lastTriggeredSkills)}
- activationCount: ${skillState.activationCount}

## 夜间副本面板

- baseStats: ${formatStatSummary(dungeonProfile.baseStats)}
- temporaryBuffs: ${formatStatSummary(dungeonProfile.temporaryBuffs, {
  onlyNonZero: true,
  prefix: "+",
})}
- currentStats: ${formatStatSummary(dungeonProfile.currentStats)}

## 树状记忆概览

- activeSeasonId: ${memoryTree.activeSeason ? memoryTree.activeSeason.seasonId : "无"}
- l1RecentCount: ${(memoryTree.l1Recent || []).length}
- seasonArchiveCount: ${(memoryTree.seasonArchives || []).length}
- permanentTitles: ${formatTitleNames(memoryTree.permanentTitles)}

## 世界线实体概览

- worldEntityCount: ${worldState.totalCount}
- recentWorldEntities: ${
    worldState.entities && worldState.entities.length > 0
      ? worldState.entities.map((entity) => `${entity.name}[${entity.type}/${entity.status}]`).join(", ")
      : "无"
  }

## 世界观设定

${agent.world}
`;
}

function buildMemoryMarkdown({ agent, memories, memoryTree, worldState }) {
  const header = `# MEMORY

## Agent 概览

- agentId: ${agent.agentId}
- agentName: ${agent.agentName}
- currentChapter: ${agent.chapter}
- memoryCount: ${memories.length}

## L1 短期记忆
`;

  const l1Lines =
    memoryTree.l1Recent && memoryTree.l1Recent.length > 0
      ? memoryTree.l1Recent.map((memory) => `- ${memory.createdAt}: ${memory.memorySummary}`)
      : ["- 暂无 L1 记忆。"];

  const activeSeasonSection = `## 当前赛季

${
  memoryTree.activeSeason
    ? [
        `- seasonId: ${memoryTree.activeSeason.seasonId}`,
        `- index: ${memoryTree.activeSeason.index}`,
        `- goal: ${memoryTree.activeSeason.goal}`,
        `- chapterTitle: ${memoryTree.activeSeason.chapterTitle}`,
        `- taskMemoryCount: ${memoryTree.activeSeason.taskMemories.length}`,
        `- chapterFinaleCount: ${memoryTree.activeSeason.chapterFinales.length}`,
      ].join("\n")
    : "- 当前无激活赛季。"
}
`;

  const seasonArchiveSection = `## L2 剧集层

${
  memoryTree.seasonArchives && memoryTree.seasonArchives.length > 0
    ? memoryTree.seasonArchives
        .map(
          (archive) => `### 第 ${archive.index} 季：${archive.goal}
- completedAt: ${archive.completedAt}
- digest: ${archive.seasonDigest}
- titles: ${formatTitleNames(archive.earnedTitles)}`
        )
        .join("\n\n")
    : "- 暂无赛季归档。"
}
`;

  const titleSection = `## L3 永久资产层

${
  memoryTree.permanentTitles && memoryTree.permanentTitles.length > 0
    ? memoryTree.permanentTitles
        .map((title) => `- ${title.name}${title.description ? `：${title.description}` : ""}`)
        .join("\n")
    : "- 暂无历史称号。"
}
`;

  const worldStateSection = `## 世界线实体库

${
  worldState.entities && worldState.entities.length > 0
    ? worldState.entities
        .map(
          (entity) =>
            `- ${entity.name} [${entity.type}/${entity.status}]${entity.summary ? `：${entity.summary}` : ""}`
        )
        .join("\n")
    : "- 暂无返场实体。"
}
`;

  const timelineSection = `## 时间线记忆

${
  memories.length === 0
    ? "- 暂无记忆，等待首次任务完成后写入。"
    : memories
        .map((memory) => {
          return [
            `### ${memory.title}`,
            `- createdAt: ${memory.createdAt}`,
            `- type: ${memory.type}`,
            `- memorySummary: ${memory.memorySummary || memory.summary || ""}`,
            memory.storyText ? `- storyText: ${memory.storyText}` : null,
            memory.reward ? `- reward: ${memory.reward}` : null,
            Array.isArray(memory.skillsTriggered) && memory.skillsTriggered.length > 0
              ? `- skillsTriggered: ${memory.skillsTriggered.join(", ")}`
              : null,
            memory.dungeonBuffs
              ? `- dungeonBuffs: ${formatStatSummary(memory.dungeonBuffs, {
                  onlyNonZero: true,
                  prefix: "+",
                })}`
              : null,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n")
}
`;

  return `${header}\n${l1Lines.join("\n")}\n\n${activeSeasonSection}\n${seasonArchiveSection}\n${titleSection}\n${worldStateSection}\n${timelineSection}\n`;
}

function syncIdentity(agentContext) {
  const workspace = ensureAgentWorkspace(agentContext.agent.agentId);
  fs.writeFileSync(
    workspace.identityPath,
    buildIdentityMarkdown(agentContext),
    "utf8"
  );
  return workspace;
}

function syncMemory(agentContext) {
  const workspace = ensureAgentWorkspace(agentContext.agent.agentId);
  fs.writeFileSync(workspace.memoryPath, buildMemoryMarkdown(agentContext), "utf8");
  return workspace;
}

function readMemoryMarkdown(agentId) {
  const workspace = ensureAgentWorkspace(agentId);
  if (!fs.existsSync(workspace.memoryPath)) {
    return "";
  }

  return fs.readFileSync(workspace.memoryPath, "utf8");
}

module.exports = {
  ensureAgentWorkspace,
  syncIdentity,
  syncMemory,
  readMemoryMarkdown,
};
