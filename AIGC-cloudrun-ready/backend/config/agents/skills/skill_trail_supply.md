---
id: trail_supply
name: 支线完成成就
description: 真实指标：完成一项自定义支线任务，代表额外学习行动已落地。
scope: role
ownerRoleIds:
  - traveler
trigger:
  type: task_type_is
  value: side
  label: 完成 1 项支线任务
mechanicalEffects:
  rewardGrowthPct: 0
  rewardGrowthFlat: 0
  rewardResourcePct: 30
  rewardResourceFlat: 3
  dungeonBuff:
    hp: 0
    attack: 3
    defense: 0
    shield: 0
---
若本次事件触发“路途补给”，请描写旅人从补给箱、遗迹残卷或沿途营地中获得额外火力与物资，让画面带一点移动中的节奏感。
