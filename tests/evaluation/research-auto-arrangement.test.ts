import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,writeFileSync,rmSync,mkdirSync,readFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {generateResearchArrangement} from '../../scripts/research-auto-arrangement.js'
import {TaskContractSchema} from '../../src/protocol/task-contract.js'
// @ts-expect-error shared local inference fixture
import {startMockInferenceServer,mockModelsJson} from '../../scripts/mock-inference-server.mjs'
const roots:string[]=[];afterEach(()=>{for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true})})
it.each(['questions','reference','two','three','unknown-usage','cancel','tamper','pre-abort'] as const)('records and validates actual model-generated planning: %s',async mode=>{
 const includeCheck=mode==='three',controller=new AbortController();if(mode==='pre-abort')controller.abort()
 const root=mkdtempSync(join(tmpdir(),'dawn-auto-research-'));roots.push(root);writeFileSync(join(root,'input.csv'),'x\n1')
 const check=TaskContractSchema.parse({resultType:'data-summary',inputs:['input.csv'],access:'read-only',submission:'tool'}),analysis=TaskContractSchema.parse({resultType:'model-metrics',inputs:['input.csv'],outputs:['result.json'],access:'workspace-write',submission:'tool'}),review=TaskContractSchema.parse({resultType:'review',inputs:['result.json'],access:'read-only',submission:'tool'})
 const task=(id:string,contract:any,deps:string[]=[])=>({id,title:id,goal:id,role:id,inputs:contract.inputs,outputs:contract.outputs,dependencies:deps,acceptance:'frozen original judge',review:id==='review',execution:{agent:id,contract}})
 const tasks=[...(includeCheck?[task('check',check)]:[]),task('analyze',analysis,includeCheck?['check']:[]),task('review',review,['analyze'])]
 if(mode==='tamper')tasks.find(t=>t.id==='analyze')!.execution.contract={...analysis,outputs:['other.json']}
 const server=await startMockInferenceServer({scenario:{toolCall(body:any){if(mode==='cancel')controller.abort();if(mode==='reference'){const prompt=JSON.stringify(body.messages);for(const task of tasks){const stage=task.id==='analyze'?'analyze':'review';const ref=prompt.match(new RegExp(stage+'@[a-f0-9]{64}'))?.[0];if(!ref)throw Error('Expected host contract reference');Object.assign(task.execution,{contractRef:ref});delete (task.execution as {contract?:unknown}).contract}};if((body.tools??[]).some((t:any)=>t.function?.name==='propose_plan')&&!(body.messages??[]).some((m:any)=>m.role==='tool'))return{toolName:'propose_plan',...(mode==='unknown-usage'?{}:{usage:{prompt_tokens:7,completion_tokens:3,total_tokens:10}}),args:{title:'arranged',plan:'## 问题与假设\nfixture\n## 数据与切分\ninput.csv\n## 统计检验与模型\noriginal\n## 图\nnone\n## 产物\n`result.json`',arrangement:{dispatch:'team-v1',mode:'science',rationale:'fit this task',independentReview:true,questions:mode==='questions'?['输入单位是什么？']:[],tasks}}};return undefined},reply:()=> 'proposed'}})
 try{
  const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const definitions=['check','analyze','review'].map(name=>({name,description:name,systemPrompt:'original role',tools:['read','write'],filePath:'/'+name}))
  const pending=generateResearchArrangement({workspace:root,sessionDir:join(root,'planner'),modelsPath,provider:'deepseek',model:'deepseek-flash',credential:'offline',definitions,contracts:{check,analyze:analysis,review},instructions:'one synthetic mean',requests:()=>server.requests.length,prepareSettings:(path)=>{mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,JSON.stringify({retry:{enabled:false,maxRetries:0,provider:{maxRetries:0}},compaction:{enabled:false},cacheWarming:'off'}))},signal:controller.signal})
  if(mode==='questions'||mode==='cancel'||mode==='pre-abort'||mode==='tamper'){
   await expect(pending).rejects.toThrow(mode==='questions'?'待确认':mode==='tamper'?'未交付可批准':'取消')
   const recorded=JSON.parse(readFileSync(join(root,'planner/automatic-arrangement.json'),'utf8'));expect(recorded.valid).toBe(false);if(mode==='questions')expect(recorded.questions).toEqual(['输入单位是什么？'])
   if(mode==='pre-abort')expect(server.requests).toHaveLength(0)
   if(mode==='tamper'){expect(existsSync(join(root,'planner/proposed-plan.json'))).toBe(false);expect(JSON.stringify(server.requests)).toContain('文件声明与执行契约不一致')}
   const count=server.requests.length;await new Promise(r=>setTimeout(r,50));expect(server.requests).toHaveLength(count);return
  }
  const plan=await pending
  if(mode==='reference')expect(JSON.stringify(server.requests[0]?.body.messages.filter((m:{role:string})=>m.role==='user'))).not.toContain('冻结科学契约：')
  expect(plan.arrangement.tasks).toHaveLength(includeCheck?3:2);expect(plan.metrics).toMatchObject({taskCount:includeCheck?3:2,valid:true,reviewCovered:true});expect(plan.metrics.requests).toBeGreaterThan(0)
  expect(plan.arrangement.tasks.find(t=>t.id==='analyze')!.execution!.contract).toEqual(analysis)
  if(mode==='unknown-usage')expect(plan.metrics.usage).toEqual({})
  else expect(plan.metrics.usage).toMatchObject({input:expect.any(Number),output:expect.any(Number)})
  expect(JSON.parse(readFileSync(join(root,'planner/automatic-arrangement.json'),'utf8')).usage).toEqual(plan.metrics.usage)
 }finally{await server.close()}
},30000)
