const STORY_ASSETS = Object.freeze({
  watcher_shield: "story_asset_watcher_shield.jpg", oath_sword: "story_asset_oath_sword.jpg",
  azure_helm: "story_asset_azure_helm.jpg", glory_banner: "story_asset_glory_banner.jpg",
  guardian_armor: "story_asset_guardian_armor.jpg", arcane_tome: "story_asset_arcane_tome.jpg",
  astrolabe: "story_asset_astrolabe.jpg", mana_potion: "story_asset_mana_potion.jpg",
  arcane_scepter: "story_asset_arcane_scepter.jpg", exploration_map: "story_asset_exploration_map.jpg",
  traveler_pack: "story_asset_traveler_pack.jpg", wild_lantern: "story_asset_wild_lantern.jpg",
  wind_bow: "story_asset_wind_bow.jpg", journey_boots: "story_asset_journey_boots.jpg",
  spring_flask: "story_asset_spring_flask.jpg", sky_crystal: "story_asset_sky_crystal.jpg",
  hourglass: "story_asset_hourglass.jpg", eternal_blossom: "story_asset_eternal_blossom.jpg",
  starlight_pendant: "story_asset_starlight_pendant.jpg", treasure_chest: "story_asset_treasure_chest.jpg",
  sky_tower: "story_asset_sky_tower.jpg", wisdom_society: "story_asset_wisdom_society.jpg",
  traveler_guild: "story_asset_traveler_guild.jpg", nature_pact: "story_asset_nature_pact.jpg",
  radiant_oath: "story_asset_radiant_oath.jpg",
});

function value(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return !text || text === "null" || text === "undefined" ? fallback : text;
}

function showError(error, fallback = "操作失败，请稍后重试") {
  wx.showToast({ title: value(error && error.message, fallback), icon: "none", duration: 2600 });
}

function storyAssetPath(asset) {
  const file = asset && STORY_ASSETS[asset.id];
  return file ? `/assets/story/${file}` : "";
}

function eventToStory(event, fallbackTitle = "剧情更新") {
  if (!event) return null;
  const body = value(event.storyText);
  if (!body) return null;
  return {
    title: value(event.title, fallbackTitle),
    body,
    meta: value(event.rewardSummary),
    asset: storyAssetPath(event.storyAsset),
    assetLabel: event.storyAsset
      ? [value(event.storyAsset.category), value(event.storyAsset.name)].filter(Boolean).join(" · ")
      : "",
  };
}

function formatTimer(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

module.exports = { value, showError, storyAssetPath, eventToStory, formatTimer };
