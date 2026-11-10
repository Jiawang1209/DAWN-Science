/** Public legacy batch tool, real reservation, disposable input; no model or environment mocks. */
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {strict as assert} from 'node:assert'
import {createSciencePipelineTools} from '../../../../src/team/science-pipeline-tools.js'
import {团队调度器} from '../../../../src/team/scheduler.js'
import {sharedTaskOutputLocks,outputLockScope} from '../../../../src/bot/output-locks.js'
import {AnalysisRouteSchema} from '../../../../src/protocol/analysis-route.js'
const root=mkdtempSync(join(tmpdir(),'dawn-batch-unit-effect-')),controller=new AbortController()
let release=()=>{},current:string|undefined,catalogCalls=0,childCalls=0
const timer=setTimeout(()=>controller.abort(),2000)
try{
 const input='x\n1\n2\n3\n';writeFileSync(join(root,'in.csv'),input)
 const scheduler=new 团队调度器({sessionDir:root,定义:()=>[],跑:{context:{cwd:root,provider:'fixture',model:'local'},childOf:()=>{childCalls++;throw Error('unexpected child')}},onChange:()=>{}})
 const route=AnalysisRouteSchema.parse({routeId:'r',revision:1,updatedAt:1,title:'fixture',goal:'mean',dataContext:[],steps:[{id:'s',title:'mean',purpose:'approved',inputs:[],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
 const definitions=['check','analyze','review'].map(name=>({name,description:'fixture',systemPrompt:'fixture',filePath:'/'+name,tools:['read','write','bash']}))
 const tool=createSciencePipelineTools({sessionId:'owner',调度器:scheduler,定义:()=>definitions,当前:{get:()=>current,set:id=>{current=id}},已知模型:async()=>{catalogCalls++;throw Error('unexpected model discovery')},route:()=>route}).find(t=>t.name==='start_science_batch')!
 release=await sharedTaskOutputLocks.acquire(outputLockScope(root),undefined,controller.signal)
 const response=await tool.execute('missing-unit',{routeId:'r',revision:1,stepId:'s',executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'arithmetic mean',concurrency:2,template:{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'',unitStatus:'missing',missingValues:'block'},items:[{id:'a',label:'A',inputs:['in.csv']},{id:'b',label:'B',inputs:['in.csv']}],outputRoot:'results'},controller.signal)
 const proof={realModelRequests:0,actualPublicTool:'start_science_batch',actualWriterLockHeld:true,response,catalogCalls,childCalls,currentTeamPublished:current!==undefined,timedOut:controller.signal.aborted,scientificOutputDirectoryExists:existsSync(join(root,'results')),inputUnchanged:readFileSync(join(root,'in.csv'),'utf8')===input}
 assert.equal(response.isError,true);assert.match(response.content[0]!.text,/单位/);assert.equal(catalogCalls,0);assert.equal(childCalls,0);assert.equal(proof.currentTeamPublished,false);assert.equal(proof.timedOut,false);assert.equal(proof.scientificOutputDirectoryExists,false);assert.equal(proof.inputUnchanged,true)
 writeFileSync(new URL('./batch-unit-effects.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof))
}finally{clearTimeout(timer);controller.abort();release();rmSync(root,{recursive:true,force:true})}
