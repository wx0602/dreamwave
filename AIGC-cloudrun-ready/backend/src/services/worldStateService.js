function createEmptyWorldState() {
  return {
    entityOrder: [],
    entitiesByKey: {},
    lastUpdatedAt: null,
  };
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function buildEntityKey(type, name) {
  return `${sanitizeText(type || "other")}:${sanitizeText(name)}`;
}

function normalizeEntity(entity, context = {}) {
  const name = sanitizeText(entity.name || entity.item || entity.npc);
  if (!name) {
    return null;
  }

  const type = sanitizeText(entity.type || (entity.item ? "item" : entity.npc ? "npc" : "other")) || "other";
  const key = sanitizeText(entity.key) || buildEntityKey(type, name);
  const timestamp = context.timestamp || new Date().toISOString();

  return {
    key,
    type,
    name,
    status: sanitizeText(entity.status || "active") || "active",
    summary: sanitizeText(entity.summary || entity.description),
    sourceSeasonId: context.sourceSeasonId || entity.sourceSeasonId || null,
    sourceTaskId: context.sourceTaskId || entity.sourceTaskId || null,
    firstSeenAt: entity.firstSeenAt || timestamp,
    lastSeenAt: timestamp,
    appearanceCount: Number(entity.appearanceCount || 1),
  };
}

function upsertWorldEntities(worldState, entities, context = {}) {
  const touched = [];

  entities
    .map((entity) => normalizeEntity(entity, context))
    .filter(Boolean)
    .forEach((entity) => {
      const existing = worldState.entitiesByKey[entity.key];
      if (!existing) {
        worldState.entitiesByKey[entity.key] = entity;
        worldState.entityOrder.unshift(entity.key);
        touched.push(entity);
        return;
      }

      worldState.entitiesByKey[entity.key] = {
        ...existing,
        ...entity,
        firstSeenAt: existing.firstSeenAt || entity.firstSeenAt,
        appearanceCount: Number(existing.appearanceCount || 0) + 1,
      };
      touched.push(worldState.entitiesByKey[entity.key]);
    });

  worldState.entityOrder = Array.from(new Set(worldState.entityOrder));
  if (touched.length > 0) {
    worldState.lastUpdatedAt = context.timestamp || new Date().toISOString();
  }

  return touched;
}

function listWorldEntities(worldState, limit = 8) {
  return (worldState.entityOrder || [])
    .map((key) => worldState.entitiesByKey[key])
    .filter(Boolean)
    .slice(0, limit);
}

function getWorldStateSnapshot(worldState, limit = 12) {
  return {
    totalCount: Object.keys(worldState.entitiesByKey || {}).length,
    lastUpdatedAt: worldState.lastUpdatedAt || null,
    entities: listWorldEntities(worldState, limit),
  };
}

module.exports = {
  createEmptyWorldState,
  upsertWorldEntities,
  listWorldEntities,
  getWorldStateSnapshot,
};
