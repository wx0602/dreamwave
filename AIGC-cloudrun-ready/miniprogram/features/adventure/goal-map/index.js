const api=require("../../../services/api");
const {value,showError,eventToStory}=require("../../../utils/ui");

Page({
 data:{loading:true,plan:null,stages:[],newGoal:"",goalModal:false,story:null},
 onShow(){this.load();},
 async load(){this.setData({loading:true});try{const state=await api.getCurrentSession();getApp().globalData.state=state;const plan=state.goalPlan;if(!plan)throw new Error("目标地图正在生成，请稍后再试");const stages=(plan.stageGoals||[]).map(stage=>({...stage,statusLabel:String(stage.status).toUpperCase()==="DONE"?"已完成":String(stage.status).toUpperCase()==="IN_PROGRESS"?"进行中":"未开始",current:stage.id===plan.currentStageId,tasks:(stage.tasks||[]).map(task=>({...task,done:String(task.status).toUpperCase()==="DONE"}))}));this.setData({plan,stages,newGoal:value(plan.longTermGoal,"")});}catch(error){showError(error,"目标地图加载失败");}finally{this.setData({loading:false});}},
 openGoalEdit(){this.setData({goalModal:true});},closeGoalEdit(){this.setData({goalModal:false});},goalInput(e){this.setData({newGoal:e.detail.value});},
 async changeGoal(){const goal=this.data.newGoal.trim();if(!goal)return;this.setData({goalModal:false});await this.replan("CHANGE_DIRECTION",goal);},
 async replanTap(e){await this.replan(e.currentTarget.dataset.reason);},
 async replan(reason,newGoal){this.setData({loading:true});try{const result=await api.replanGoal(reason,null,newGoal);const story=eventToStory(result.event,"目标地图已更新");if(story)this.setData({story});await this.load();}catch(error){showError(error,"目标重规划失败");}finally{this.setData({loading:false});}},
 closeStory(){this.setData({story:null});}
});
