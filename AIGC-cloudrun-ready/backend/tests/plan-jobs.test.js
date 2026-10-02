const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const runtime = fs.mkdtempSync(path.join(os.tmpdir(),'aigc-plan-jobs-'));
Object.assign(process.env,{NODE_ENV:'test',PERSISTENCE_DRIVER:'file',REQUIRE_SHARED_PERSISTENCE:'false',RUNTIME_DIR:runtime,HOST:'127.0.0.1',PORT:'31929'});
const planning = require('../src/services/sourceBoundPlanningService');
let release, rejectGeneration, calls = 0;
planning.generateSourceBoundPlan = context => {
  calls++;
  return new Promise((resolve,reject)=>{ release=()=>resolve(planning.buildFallbackPlan(context)); rejectGeneration=reject; });
};
const { startServer } = require('../src/app');
const { executeRequest, closePersistence } = require('../src/store/requestPersistence');
const { createGoalDraft, updateGoalDraft } = require('../src/store/goalDraftStore');
const base='http://127.0.0.1:31929';
async function api(url, body, client='owner') {
  const res=await fetch(base+url,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-client-id':client,connection:'close'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(2000)});
  return {status:res.status,...await res.json()};
}
async function waitFor(url,status) {
  for(let i=0;i<100;i++) {
    const r=await api(url);
    if(r.data.planGeneration.status===status) return r.data;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('Job did not settle');
}
async function run() {
  const server=await startServer();
  try {
    const draft=await executeRequest({headers:{'x-client-id':'owner'},socket:{}},{},()=>{
      const d=createGoalDraft({goalProfile:{title:'练习英语口语',durationDays:7,dailyBudgetMinutes:30}});
      return updateGoalDraft(d.draftId,d.revision,x=>({...x,status:'SOURCE_SKIPPED',selectedBundleId:'SKIPPED',selectedSourceIds:[]}));
    });
    const url='/api/goal-drafts/'+draft.draftId;
    const first=await api(url+'/plan-generations',{async:true,expectedRevision:draft.revision});
    assert.strictEqual(first.data.planGeneration.status,'RUNNING');
    assert.strictEqual((await api(url)).status,200,'Polling must remain available while AI is blocked');
    assert.strictEqual((await api('/api/goal-drafts',{goalProfile:{title:'另一个用户的目标'}},'other')).status,200,'Other users must not wait for AI');
    assert.strictEqual((await api(url,null,'other')).status,403,'Job and result must remain private');
    const duplicate=await api(url+'/plan-generations',{async:true,expectedRevision:draft.revision});
    assert.strictEqual(duplicate.data.planGeneration.jobId,first.data.planGeneration.jobId);
    assert.strictEqual(calls,1,'Repeated submit must not start another AI call');
    release();
    let current=await waitFor(url,'SUCCEEDED');
    assert.strictEqual(current.status,'PLAN_READY');
    assert.strictEqual(current.planDraft.firstWeek.length,7);
    await api(url+'/plan-generations',{async:true,expectedRevision:current.revision});
    rejectGeneration(new Error('simulated AI failure'));
    current=await waitFor(url,'FAILED');
    const retry=await api(url+'/plan-generations',{async:true,expectedRevision:current.revision});
    assert.strictEqual(retry.data.planGeneration.status,'RUNNING');
    release();
    await waitFor(url,'SUCCEEDED');
    console.log('Async plan jobs passed: immediate response, nonblocking requests, deduplication, owner isolation, completion and retry.');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await closePersistence();
    for(const name of ['SIGINT','SIGTERM','SIGHUP']) process.removeAllListeners(name);
    fs.rmSync(runtime,{recursive:true,force:true});
  }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
