const FALLBACK_ROLES = [
  {
    id: "knight",
    name: "守望骑士",
    description: "史诗主线 / 使命感强",
    worldSetting: "王城边境出现了会吞噬记忆的迷雾，你需要修复失序的知识结界。",
    image: "/assets/roles/role_knight.jpg",
  },
  {
    id: "scholar",
    name: "奥术学者",
    description: "知识探索 / 世界观丰富",
    worldSetting: "失落语境之塔正在崩塌，唯有修复词汇符印与阅读回廊才能重启知识核心。",
    image: "/assets/roles/role_scholar.jpg",
  },
  {
    id: "traveler",
    name: "荒野旅人",
    description: "冒险邂逅 / 支线体验强",
    worldSetting: "浮空荒野上散落着无数残卷营地，你要在风暴抵达前逐站收集所需线索。",
    image: "/assets/roles/role_traveler.jpg",
  },
];

const ROLE_META = Object.freeze({
  knight: { companionName: "曜庭", companionTag: "守护型陪跑", compact: "战线", focus: "/features/adventure/assets/focus/knight-focus.jpg", rest: "/features/adventure/assets/focus/knight-rest.jpg" },
  scholar: { companionName: "璃恩", companionTag: "拆解型陪跑", compact: "节点", focus: "/features/adventure/assets/focus/scholar-focus.jpg", rest: "/features/adventure/assets/focus/scholar-rest.jpg" },
  traveler: { companionName: "岚行", companionTag: "远征型陪跑", compact: "旅程", focus: "/features/adventure/assets/focus/traveler-focus.jpg", rest: "/features/adventure/assets/focus/traveler-rest.jpg" },
});

function normalizeRoleId(roleId) {
  return ROLE_META[roleId] ? roleId : "traveler";
}

function getRoleImage(roleId) {
  const match = FALLBACK_ROLES.find((role) => role.id === normalizeRoleId(roleId));
  return match.image;
}

function mergeRemoteRoles(roles) {
  if (!Array.isArray(roles) || !roles.length) return FALLBACK_ROLES;
  return roles.map((role) => {
    const fallback = FALLBACK_ROLES.find((item) => item.id === role.id) || FALLBACK_ROLES[0];
    return { ...fallback, ...role, image: getRoleImage(role.id) };
  });
}

module.exports = { FALLBACK_ROLES, ROLE_META, normalizeRoleId, getRoleImage, mergeRemoteRoles };
