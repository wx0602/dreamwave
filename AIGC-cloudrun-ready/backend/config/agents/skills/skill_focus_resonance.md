---
id: focus_resonance
name: 深度专注成就
description: 真实指标：单次任务预计专注时长达到 25 分钟，代表一次完整学习块完成。
scope: role
ownerRoleIds:
  - scholar
trigger:
  type: task_estimate_minutes_gte
  value: 25
  label: 单次专注时长达到 25 分钟
mechanicalEffects:
  rewardGrowthPct: 20
  rewardGrowthFlat: 0
  rewardResourcePct: 0
  rewardResourceFlat: 0
  dungeonBuff:
    hp: 0
    attack: 0
    defense: 0
    shield: 6
---
若本次事件触发“专注共振”，请重点描写古塔符印被连续点亮、知识能量在角色周围形成护盾的画面，并让这种共振与当前完成的学习动作自然连接。
