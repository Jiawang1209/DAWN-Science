import {expect,it} from 'vitest'
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {generateResearchArrangement} from '../../scripts/research-auto-arrangement.js'
import {buildPlanningContractContext} from '../../src/runtime/planning-contract-context.js'
// @ts-expect-error shared deterministic server
import {startMockInferenceServer,mockModelsJson} from '../../scripts/mock-inference-server.mjs'
// @ts-expect-error shared deterministic research
import {researchScenario} from '../../scripts/mock-research.mjs'
it('evaluates production confirmation and dynamic catalog query without evaluation-only contract injection',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-product-research-'))
 const selection={template:{id:'tabular-ecology' as const,version:1 as const,language:'python' as const,method:'arithmetic mean',units:'m',missingValues:'block'},inputs:['input.csv'],outputRoot:'results',requireExecution:true,independentReview:true}
 const context=buildPlanningContractContext({...selection,version:1,ownerSessionId:'research-planner',revision:1,confirmedAt:1})
 const server=await startMockInferenceServer({scenario:researchScenario([{id:'t',instructions:'production mean',expected:{mean:2,n:3,unit:'m'}}])})
 try{
  writeFileSync(join(root,'input.csv'),'x\n1\n2\n3\n');const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const result=await generateResearchArrangement({planningSource:selection,workspace:root,sessionDir:join(root,'planner'),modelsPath,provider:'deepseek',model:'deepseek-flash',credential:'offline',definitions:['check','analyze','review'].map(name=>({name,description:name,systemPrompt:'original role',tools:['read','write','bash'],filePath:'/'+name})),contracts:context.contracts,instructions:'production mean',requests:()=>server.requests.length,prepareSettings:path=>{mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,JSON.stringify({retry:{enabled:false,maxRetries:0,provider:{maxRetries:0}},compaction:{enabled:false},cacheWarming:'off'}))},signal:new AbortController().signal})
  expect(result.metrics.catalogSource).toBe('confirmed-product');expect(result.metrics.valid).toBe(true);expect(result.arrangement.tasks).toHaveLength(2)
  expect(JSON.parse(readFileSync(join(root,'planner/plans.json'),'utf8')).planningContext.ownerSessionId).toBe('research-planner')
  const requests=server.requests as {body:{messages:{role:string;tool_calls?:{function:{name:string}}[]}[]}}[]
  const calls=requests.flatMap(r=>r.body.messages).flatMap(m=>m.tool_calls??[])
  expect(calls.some(c=>c.function.name==='get_plan_contracts')).toBe(true)
 }finally{await server.close();rmSync(root,{recursive:true,force:true})}
},30000)
