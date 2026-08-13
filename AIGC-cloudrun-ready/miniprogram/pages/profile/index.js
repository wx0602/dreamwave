const api=require("../../services/api");
const storage=require("../../utils/storage");
const {getRoleImage}=require("../../utils/roles");
const {value,showError}=require("../../utils/ui");

Page({
 data:{loading:true,name:"未命名角色",role:"未设定",chapter:"未设定",avatar:"",level:1,growth:0,nextLevel:100,growthPercent:0,resources:0,goal:"未设定",goalProgress:"目标地图生成中",achievements:[],bag:[],skillsExpanded:false,bagExpanded:false},
 onShow(){if(!storage.get(storage.KEYS.userId,"")){wx.reLaunch({url:"/pages/welcome/index"});return;}this.load();},
 onPullDownRefresh(){this.load().finally(()=>wx.stopPullDownRefresh());},
 async load(){this.setData({loading:true});try{const state=await api.getCurrentSession();getApp().globalData.state=state;this.render(state);}catch(error){showError(error,"角色档案加载失败");}finally{this.setData({loading:false});}},
 render(state){
  const user=state.user||{},agent=state.agent||{},progress=state.progress||{};
  const achievements=this.achievements(state); const bag=(state.inventory||[]).filter(item=>item&&item.inventoryId!=="badge"&&item.inventoryId!=="agent"&&!String(item.inventoryId||"").startsWith("skill:")&&item.category!=="skill").map(item=>value(item.name,"未命名道具"));
  this.setData({name:value(user.nickname,"未命名角色"),role:value(agent.roleName,value(user.roleName,"未设定")),chapter:value(user.currentChapter,"未设定"),avatar:getRoleImage(agent.roleId||user.selectedRoleId),level:Number(progress.level)||1,growth:Number(progress.growthValue)||0,nextLevel:Math.max(Number(progress.nextLevel)||100,1),growthPercent:Math.min(100,Math.round((Number(progress.growthValue)||0)*100/Math.max(Number(progress.nextLevel)||100,1))),resources:Number(progress.resourcePoints)||0,goal:value(user.currentGoal,"未设定"),goalProgress:this.goalProgress(state),achievements,bag});
 },
 achievements(state){const p=state.progress||{};const done=(state.tasks||[]).filter(t=>String(t.status).toLowerCase()==="completed");const practice=done.filter(t=>/题|练习|quiz/i.test(`${t.title||""} ${t.detail||""}`)).length;const review=done.filter(t=>/复习|复盘|回顾/.test(`${t.title||""} ${t.detail||""}`)).length;const list=[`连续专注 ${p.streak||0} 天`,`知识点掌握度 ${Math.min(100,Math.round((p.growthValue||0)*100/Math.max(p.nextLevel||100,1)))}%`,`任务完成量 ${done.length} 项`,`刷题完成量 ${practice} 组`,`复习进度 ${review} 次`,`能力触发 ${(state.skillState&&state.skillState.activationCount)||0} 次`];((state.skillState&&state.skillState.unlockedSkills)||[]).forEach(s=>list.push(`已解锁成就：${s.name}`));return list;},
 goalProgress(state){const plan=state.goalPlan;if(!plan)return"目标地图生成中";const stages=plan.stageGoals||[];const doneStages=stages.filter(s=>String(s.status).toUpperCase()==="DONE").length;const current=stages.find(s=>s.id===plan.currentStageId)||stages[0]||{};const tasks=current.tasks||[];const done=tasks.filter(t=>String(t.status).toUpperCase()==="DONE").length;return `长期目标：${value(plan.longTermGoal,"未设定")}\n已完成阶段：${doneStages} / ${stages.length}\n当前阶段：${value(current.title,"未设定")}\n今日任务：${done} / ${tasks.length}`;},
 toggleSkills(){this.setData({skillsExpanded:!this.data.skillsExpanded});},toggleBag(){this.setData({bagExpanded:!this.data.bagExpanded});},openGoalMap(){wx.navigateTo({url:"/features/adventure/goal-map/index"});},
 logout(){wx.showModal({title:"退出当前账号",content:"本机登录标记会被清除，后端账号数据不受影响。",success:res=>{if(res.confirm){storage.clearSession();getApp().globalData.state=null;wx.reLaunch({url:"/pages/welcome/index"});}}});}
});
