function generateTasks(goal) {
  const normalized = (goal || "").toLowerCase();
  let tasks;

  if (/cet|六级|词汇|阅读/.test(normalized)) {
    tasks = [
      { title: "背诵 40 个高频词", estimate: "25 分钟", rewardGrowth: 16, rewardResource: 18 },
      { title: "精读 1 篇阅读训练", estimate: "30 分钟", rewardGrowth: 18, rewardResource: 20 },
      { title: "整理 5 道错题并复盘", estimate: "20 分钟", rewardGrowth: 14, rewardResource: 16 },
    ];
  } else if (/python|代码|编程|算法/.test(normalized)) {
    tasks = [
      { title: "复盘 2 个核心语法点", estimate: "25 分钟", rewardGrowth: 16, rewardResource: 18 },
      { title: "完成 1 组练习题", estimate: "35 分钟", rewardGrowth: 18, rewardResource: 20 },
      { title: "记录今日 bug 与修复过程", estimate: "20 分钟", rewardGrowth: 14, rewardResource: 16 },
    ];
  } else if (/听力|翻译/.test(normalized)) {
    tasks = [
      { title: "完成 1 组听力精听训练", estimate: "25 分钟", rewardGrowth: 14, rewardResource: 16 },
      { title: "整理 10 条高频表达", estimate: "20 分钟", rewardGrowth: 12, rewardResource: 14 },
      { title: "翻译 1 段真题并复盘", estimate: "30 分钟", rewardGrowth: 16, rewardResource: 18 },
    ];
  } else {
    tasks = [
      { title: "拆解今日最小行动单元", estimate: "20 分钟", rewardGrowth: 12, rewardResource: 14 },
      { title: "完成 1 次高专注学习块", estimate: "30 分钟", rewardGrowth: 16, rewardResource: 18 },
      { title: "输出今日复盘摘要", estimate: "15 分钟", rewardGrowth: 12, rewardResource: 12 },
    ];
  }

  return tasks;
}

module.exports = {
  generateTasks,
};
