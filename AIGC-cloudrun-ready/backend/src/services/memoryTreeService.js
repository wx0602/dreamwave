function createEmptyMemoryTree() {
  return {
    l1WindowSize: 8,
    l1Recent: [],
    activeSeason: null,
    seasonArchives: [],
    permanentTitles: [],
  };
}

function createSeasonRecord(payload) {
  return {
    seasonId: payload.seasonId,
    index: Number(payload.index || 1),
    goal: String(payload.goal || "").trim(),
    roleId: String(payload.roleId || "").trim(),
    roleName: String(payload.roleName || "").trim(),
    chapterTitle: String(payload.chapterTitle || "").trim(),
    startedAt: payload.startedAt || new Date().toISOString(),
    taskMemories: [],
    chapterFinales: [],
  };
}

function normalizeTitle(title, context = {}) {
  const name = String(title.name || title || "").trim();
  if (!name) {
    return null;
  }

  return {
    name,
    description: String(title.description || "").trim(),
    sourceSeasonId: context.sourceSeasonId || title.sourceSeasonId || null,
    createdAt: context.createdAt || title.createdAt || new Date().toISOString(),
  };
}

function pushL1Summary(memoryTree, summaryEntry) {
  memoryTree.l1Recent.unshift(summaryEntry);
  memoryTree.l1Recent = memoryTree.l1Recent.slice(0, Number(memoryTree.l1WindowSize || 8));
}

function recordTaskMemory(memoryTree, payload) {
  const summaryEntry = {
    memoryId: payload.memoryId,
    title: String(payload.title || "").trim(),
    memorySummary: String(payload.memorySummary || "").trim(),
    createdAt: payload.createdAt || new Date().toISOString(),
    taskId: payload.taskId || null,
  };

  if (!summaryEntry.memorySummary) {
    return summaryEntry;
  }

  pushL1Summary(memoryTree, summaryEntry);

  if (memoryTree.activeSeason) {
    memoryTree.activeSeason.taskMemories.push(summaryEntry);
  }

  return summaryEntry;
}

function recordChapterFinale(memoryTree, payload) {
  if (!memoryTree.activeSeason) {
    return null;
  }

  const finale = {
    chapterTitle: String(payload.chapterTitle || memoryTree.activeSeason.chapterTitle || "").trim(),
    title: String(payload.title || "章节大结局").trim(),
    finalText: String(payload.finalText || "").trim(),
    finalDigest: String(payload.finalDigest || "").trim(),
    createdAt: payload.createdAt || new Date().toISOString(),
  };

  memoryTree.activeSeason.chapterFinales.push(finale);
  return finale;
}

function mergePermanentTitles(memoryTree, titles, context = {}) {
  const normalized = titles
    .map((title) => normalizeTitle(title, context))
    .filter(Boolean);

  normalized.forEach((title) => {
    const existingIndex = memoryTree.permanentTitles.findIndex(
      (entry) => entry.name === title.name
    );

    if (existingIndex === -1) {
      memoryTree.permanentTitles.unshift(title);
      return;
    }

    memoryTree.permanentTitles[existingIndex] = {
      ...memoryTree.permanentTitles[existingIndex],
      ...title,
    };
  });

  return normalized;
}

function archiveActiveSeason(memoryTree, archivePayload) {
  if (!memoryTree.activeSeason) {
    return null;
  }

  const archive = {
    seasonId: memoryTree.activeSeason.seasonId,
    index: memoryTree.activeSeason.index,
    goal: memoryTree.activeSeason.goal,
    roleId: memoryTree.activeSeason.roleId,
    roleName: memoryTree.activeSeason.roleName,
    chapterTitle: memoryTree.activeSeason.chapterTitle,
    startedAt: memoryTree.activeSeason.startedAt,
    completedAt: archivePayload.completedAt || new Date().toISOString(),
    seasonEpic: String(archivePayload.seasonEpic || "").trim(),
    seasonDigest: String(archivePayload.seasonDigest || "").trim(),
    taskMemories: [...memoryTree.activeSeason.taskMemories],
    chapterFinales: [...memoryTree.activeSeason.chapterFinales],
    earnedTitles: mergePermanentTitles(memoryTree, archivePayload.earnedTitles || [], {
      sourceSeasonId: memoryTree.activeSeason.seasonId,
      createdAt: archivePayload.completedAt || new Date().toISOString(),
    }),
  };

  memoryTree.seasonArchives.unshift(archive);
  memoryTree.activeSeason = null;
  return archive;
}

function startNewSeason(memoryTree, payload) {
  memoryTree.activeSeason = createSeasonRecord(payload);
  return memoryTree.activeSeason;
}

function getL1RecentSummaries(memoryTree, limit = 8) {
  return (memoryTree.l1Recent || []).slice(0, limit);
}

function getRecentSeasonDigests(memoryTree, limit = 3) {
  return (memoryTree.seasonArchives || []).slice(0, limit).map((archive) => ({
    seasonId: archive.seasonId,
    goal: archive.goal,
    seasonDigest: archive.seasonDigest,
    chapterTitle: archive.chapterTitle,
    earnedTitles: archive.earnedTitles || [],
    completedAt: archive.completedAt,
  }));
}

function buildMemoryTreeSnapshot(memoryTree) {
  return {
    l1WindowSize: Number(memoryTree.l1WindowSize || 8),
    l1Recent: [...(memoryTree.l1Recent || [])],
    activeSeason: memoryTree.activeSeason
      ? {
          ...memoryTree.activeSeason,
          taskMemories: [...memoryTree.activeSeason.taskMemories],
          chapterFinales: [...memoryTree.activeSeason.chapterFinales],
        }
      : null,
    seasonArchives: (memoryTree.seasonArchives || []).map((archive) => ({
      ...archive,
      taskMemories: [...archive.taskMemories],
      chapterFinales: [...archive.chapterFinales],
      earnedTitles: [...archive.earnedTitles],
    })),
    permanentTitles: [...(memoryTree.permanentTitles || [])],
  };
}

module.exports = {
  createEmptyMemoryTree,
  createSeasonRecord,
  recordTaskMemory,
  recordChapterFinale,
  startNewSeason,
  archiveActiveSeason,
  mergePermanentTitles,
  getL1RecentSummaries,
  getRecentSeasonDigests,
  buildMemoryTreeSnapshot,
};
