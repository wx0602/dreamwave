const assert = require('assert');
const { buildFallbackPlan, validateSourceBoundPlan, generateSourceBoundPlan } = require('../src/services/sourceBoundPlanningService');
const context = { goalProfile: { title: '学习 JavaScript', durationDays: 1, dailyBudgetMinutes: 120 }, sources: [], selectedSourceIds: [] };
const plan = buildFallbackPlan(context);
plan.firstWeek[0].mainTasks = [
  { title: '声明与输出变量', detail: '了解 var、let、const 的区别及 number、string、boolean 的含义。', estimatedMinutes: 25, sourceRef: null },
  { title: '解释变量声明', detail: '写下 3 句话说明 let 和 const 的区别。', estimatedMinutes: 20, sourceRef: null },
  { title: '综合运用流程控制', detail: '设计一个小程序：接收一个数字，判断正数、负数还是零，并输出提示。', estimatedMinutes: 25, sourceRef: null },
];
async function run() {
  assert.deepStrictEqual(validateSourceBoundPlan(plan, context).issues, []);
  const originalFetch = global.fetch;
  const stagePlan = { stageGoals: Array.from({length:3}, (_,index) => ({
    title: '阶段' + (index+1), description:'按目标推进',
    tasks: plan.firstWeek[0].mainTasks.map(task=>({...task,description:task.detail})),
  })) };
  let rolling = { days: plan.firstWeek };
  let calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    const isRolling = body.messages[0].content.includes('任务规划师');
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(isRolling ? rolling : stagePlan)}}]}), {status:200});
  };
  try {
    const result = await generateSourceBoundPlan(context, {apiKey:'test-only-key'});
    assert.strictEqual(result.source,'llm');
    assert.strictEqual(result.generator,'stable-63ffb9c');
    assert.strictEqual(result.firstWeek[0].mainTasks[0].title,'声明与输出变量');
    assert.strictEqual(calls.length,2,'Stable flow must generate stages then rolling tasks');
    assert.strictEqual(JSON.parse(calls[1].messages[1].content).phases[0].title,'阶段1');
    for (const dailyBudgetMinutes of [25, 30, 60]) {
      const timed = await generateSourceBoundPlan({...context, goalProfile:{...context.goalProfile, title:'练习英语口语', dailyBudgetMinutes}}, {apiKey:'test-only-key'});
      const tasks = [...timed.firstWeek[0].mainTasks, ...timed.firstWeek[0].sideTasks];
      assert(tasks.reduce((sum, task)=>sum+task.estimatedMinutes,0) <= dailyBudgetMinutes);
      assert(tasks.every(task=>Number.isInteger(task.estimatedMinutes) && task.estimatedMinutes >= 5));
      assert.strictEqual(timed.firstWeek[0].mainTasks[0].detail,plan.firstWeek[0].mainTasks[0].detail);
    }
    const selected = await generateSourceBoundPlan({...context,
      selectedSourceIds:['book'], sources:[{sourceId:'book',title:'用户资料',url:'https://example.test/book'}],
    }, {apiKey:'test-only-key'});
    assert.strictEqual(selected.firstWeek[0].mainTasks[0].sourceRef.sourceId,'book');
    assert.strictEqual(selected.firstWeek[0].mainTasks[0].sourceRef.locatorType,'URL');
    rolling = {days:[]};
    await assert.rejects(generateSourceBoundPlan(context,{apiKey:'test-only-key'}),e=>e.code==='PLAN_AI_UNAVAILABLE');
    global.fetch = async () => { throw new Error('network unavailable'); };
    await assert.rejects(generateSourceBoundPlan(context,{apiKey:'test-only-key'}),e=>e.code==='PLAN_AI_UNAVAILABLE');
    console.log('Stable planner adapter regression passed: stage-to-rolling flow, source references, retained tasks and explicit failure.');
  } finally { global.fetch = originalFetch; }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
