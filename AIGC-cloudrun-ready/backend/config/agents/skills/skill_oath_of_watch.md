---
id: oath_of_watch
name: 连续专注成就
description: 真实指标：连续打卡达到 3 天，说明学习节奏已经初步稳定。
scope: role
ownerRoleIds:
  - knight
trigger:
  type: streak_gte
  value: 3
  label: 连续专注达到 3 天
mechanicalEffects:
  rewardGrowthPct: 10
  rewardGrowthFlat: 2
  rewardResourcePct: 0
  rewardResourceFlat: 0
  dungeonBuff:
    hp: 0
    attack: 0
    defense: 4
    shield: 0
---
若本次事件触发“守望誓约”，请描写骑士盔甲与城墙纹章同步发光，表现一种重新立誓、加固防线的瞬间力量。
