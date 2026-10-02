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
  const originalEnv = process.env.NODE_ENV;
  try {
    global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }), { status: 200 });
    const result = await generateSourceBoundPlan(context, { apiKey: 'test-only-key' });
    assert.strictEqual(result.source, 'llm');
    assert.strictEqual(result.firstWeek[0].mainTasks[0].title, '声明与输出变量');
    const invalid = JSON.parse(JSON.stringify(plan));
    invalid.firstWeek[0].mainTasks = [];
    global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(invalid) } }] }), { status: 200 });
    await assert.rejects(generateSourceBoundPlan(context, { apiKey: 'test-only-key' }), e => e.code === 'PLAN_VALIDATION_FAILED');
    global.fetch = async () => { throw new Error('network unavailable'); };
    await assert.rejects(generateSourceBoundPlan(context, { apiKey: 'test-only-key' }), e => e.code === 'PLAN_AI_UNAVAILABLE');
    console.log('Plan quality regression passed: concrete actions retained; invalid or failed AI output never silently becomes a template.');
  } finally {
    global.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
