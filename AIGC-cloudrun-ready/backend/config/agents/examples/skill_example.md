---
id: demo_skill
name: 示例技能
description: 给策划参考格式的技能样例，不会被系统加载。
scope: universal
ownerRoleIds: []
trigger:
  type: task_estimate_minutes_gte
  value: 60
  label: 预计学习时长达到 60 分钟
mechanicalEffects:
  rewardGrowthPct: 20
  rewardGrowthFlat: 0
  rewardResourcePct: 0
  rewardResourceFlat: 0
  dungeonBuff:
    hp: 0
    attack: 2
    defense: 0
    shield: 5
---
这里开始写技能触发后的“加戏指令”。只描述本次生成剧情时必须强调的特殊画面或动作，不要在这里写 if/else 判断。
