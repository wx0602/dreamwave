function formatDiaryTime(date) {
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDungeonState(demoMode) {
  const current = new Date();
  if (demoMode) {
    current.setHours(22, 6, 0, 0);
  }

  const openTime = new Date(current);
  openTime.setHours(22, 0, 0, 0);
  const unlocked = current >= openTime;

  const diff = Math.max(0, openTime.getTime() - current.getTime());
  const hours = String(Math.floor(diff / 3600000)).padStart(2, "0");
  const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");

  return {
    unlocked,
    clock: current.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    countdown: unlocked ? "00:00" : `${hours}:${minutes}`,
  };
}

module.exports = {
  formatDiaryTime,
  getDungeonState,
};
