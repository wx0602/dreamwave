const ARC_LIBRARY = [
  {
    id: "novice",
    label: "新手期",
    minLevel: 1,
    maxLevel: 10,
    tone: "青涩、充满好奇、对未知保持敬畏",
    prompt:
      "你当前处于角色弧光的新手期。叙事语气应更青涩、更有探索感，面对未知时保留一丝敬畏，并让成长感显得新鲜而真实。",
  },
  {
    id: "advanced",
    label: "进阶期",
    minLevel: 11,
    maxLevel: 30,
    tone: "沉稳、坚定、熟练运用规则",
    prompt:
      "你当前处于角色弧光的进阶期。叙事语气应沉稳、坚定，体现角色已经熟悉规则、开始主动调动经验与秩序，而不是懵懂试探。",
  },
  {
    id: "legend",
    label: "大师期",
    minLevel: 31,
    maxLevel: Number.POSITIVE_INFINITY,
    tone: "从容、老练、带有传奇人物的自信",
    prompt:
      "你当前处于角色弧光的大师期。叙事语气应从容、老练，展现历战沉淀后的自信和号召力，但不要失去人与目标之间的真实连接。",
  },
];

function getCharacterArc(level) {
  const currentLevel = Math.max(1, Number(level || 1));
  return (
    ARC_LIBRARY.find((arc) => currentLevel >= arc.minLevel && currentLevel <= arc.maxLevel) ||
    ARC_LIBRARY[0]
  );
}

function getCharacterArcSnapshot(level) {
  const arc = getCharacterArc(level);
  return {
    id: arc.id,
    label: arc.label,
    levelRange: `${arc.minLevel}-${Number.isFinite(arc.maxLevel) ? arc.maxLevel : "∞"}`,
    tone: arc.tone,
    prompt: arc.prompt,
  };
}

module.exports = {
  ARC_LIBRARY,
  getCharacterArc,
  getCharacterArcSnapshot,
};
