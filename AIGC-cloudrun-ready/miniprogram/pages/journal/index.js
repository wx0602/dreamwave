const api = require("../../services/api");
const storage = require("../../utils/storage");
const { value, showError, eventToStory } = require("../../utils/ui");

Page({
  data: { loading: true, diary: [], suggestion: "", story: null },
  onShow() {
    if (!storage.get(storage.KEYS.userId, "")) { wx.reLaunch({url:"/pages/welcome/index"}); return; }
    this.load();
  },
  onPullDownRefresh() { this.load().finally(()=>wx.stopPullDownRefresh()); },
  async load() {
    this.setData({loading:true});
    try {
      const state=await api.getCurrentSession();
      getApp().globalData.state=state;
      const suggestion=value(state.nextSuggestion,"复盘 1 个要点，再安排下一项 15 分钟小任务。");
      const diary=(state.diary||[]).map(entry=>({
        ...entry,
        displayTitle:value(entry.title,"语境记录"),
        displayBody:this.buildBody(entry,suggestion),
        displayDate:value(entry.createdAt,"--"),
        suggestion:value(entry.nextSuggestion,suggestion),
      }));
      this.setData({diary,suggestion});
    } catch(error){showError(error,"日志加载失败");}
    finally{this.setData({loading:false});}
  },
  buildBody(entry,suggestion){
    const title=value(entry.title,"语境记录");
    let body=value(entry.body,"这次努力已写入角色记忆。").replace(/\s+/g," ");
    const marker=body.indexOf("【章节大结局】"); if(marker>0) body=body.slice(0,marker);
    if(body.length>160) body=`${body.slice(0,160)}...`;
    const reward=value(entry.rewardSummary);
    if(title.includes("完成")||title.includes("推进")||title.includes("结局")){
      return `完成结果\n${title}\n\n剧情文本\n${body}${reward?`\n\n奖励与下一步建议\n${reward}\n下一步：${suggestion}`:""}`;
    }
    return `${body}${reward?`\n\n奖励：${reward}\n下一步：${suggestion}`:""}`;
  },
  async adopt(event){
    const suggestion=event.currentTarget.dataset.suggestion;
    try{ const result=await api.adoptSuggestion(suggestion); const story=eventToStory(result.event,"建议已采纳"); if(story)this.setData({story}); await this.load(); }
    catch(error){showError(error,"建议采纳失败");}
  },
  async refresh(event){
    try{ const result=await api.refreshNextSuggestion(event.currentTarget.dataset.id); const story=eventToStory(result.event,"建议已刷新"); if(story)this.setData({story}); await this.load(); }
    catch(error){showError(error,"建议刷新失败");}
  },
  closeStory(){this.setData({story:null});},
});
