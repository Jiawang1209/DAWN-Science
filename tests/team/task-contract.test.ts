import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {建团队,加成员,加任务,写团队} from '../../src/team/state.js'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {团队调度器} from '../../src/team/scheduler.js'
import {TaskContractSchema} from '../../src/orchestration/task-contract.js'
import {resolveTaskSettings} from '../../src/subagent/task-tools.js'
import {跑一轮} from '../../src/team/runner.js'
const roots:string[]=[];afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
it('persists a validated task contract and rejects contradicting output declarations',()=>{
 const t=建团队({id:'t',name:'t',goal:'g',captainSessionId:'p'})
 const contract=TaskContractSchema.parse({access:'workspace-write',outputs:['out.csv']})
 const task=加任务(t,{subject:'write',contract})
 expect(task.contract).toEqual(contract);expect(task.outputs).toEqual(['out.csv'])
 expect(()=>加任务(t,{subject:'contradiction',outputs:['other.csv'],contract})).toThrow()
})
it('a Bot contract failure blocks dependent tasks and retains the host receipt',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-team-contract-'));roots.push(cwd)
 const team=建团队({id:'t',name:'t',goal:'g',captainSessionId:'p'});加成员(team,{name:'b',agent:'b',botId:'b',botScopeKey:'scope'})
 const contract=TaskContractSchema.parse({access:'workspace-write',outputs:['missing.csv']})
 加任务(team,{id:'first',subject:'write',assignee:'b',contract});加任务(team,{id:'second',subject:'downstream',dependencies:['first'],assignee:'b'})
 let runs=0
 const scheduler=new 团队调度器({orchestration:new OrchestrationService(new OrchestrationStore(cwd,'p')),sessionDir:cwd,定义:()=>[],跑:{childOf:()=>({command:'unused',args:[]}),context:{provider:'p',model:'m',cwd}},onChange:()=>{},
 prepareTask:(_member,task)=>resolveTaskSettings(task?.contract,'allow-all'),memberRunner:async request=>{
  runs++;expect(request.settings?.contract).toEqual(contract)
  return{ok:true,evidence:[],output:JSON.stringify({summary:'done',blockers:[],deliverables:[{path:'missing.csv'}],execution:{state:'not_run',note:'no computation'},verification:{state:'unreviewed',note:'not reviewed'}})}
 }})
 写团队(scheduler.dir('t'),team);await scheduler.踢一下('t')
 const end=Date.now()+2000;while(scheduler.读('t').tasks[0]?.status==='in_progress'&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,10))
 expect(scheduler.读('t').tasks[0]).toMatchObject({status:'failed',receipt:{state:'invalid'}});expect(runs).toBe(1)
})

it('the parent rejects a peer-message RPC from a narrow child before invoking the scheduler',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-team-rpc-scope-'));roots.push(cwd);let calls=0
 const result=await 跑一轮({definition:{name:'a',description:'a',systemPrompt:'a',filePath:'/a'},memberName:'a',teamId:'t',prompt:'check',systemPrompt:'check',sessionDir:cwd,agentDir:cwd,resume:false,settings:resolveTaskSettings(TaskContractSchema.parse({}),'allow-all')},
  {childOf:()=>({command:process.execPath,args:['-e',`const lines=require('readline').createInterface({input:process.stdin});let first=true;lines.on('line',line=>{if(first){first=false;console.log(JSON.stringify({type:'call',id:'send',name:'team_send',params:{to:'writer',content:'write'}}))}else{console.log(JSON.stringify({type:'done',ok:true,output:line}));process.exit()}})`]}),context:{cwd,provider:'p',model:'m'},onCall:async()=>{calls++;return 'unexpected'},timeoutMs:3000})
 expect(result.ok).toBe(true);expect(calls).toBe(0)
 expect(JSON.parse(result.output)).toMatchObject({ok:false,result:expect.stringContaining('只读')})
})
