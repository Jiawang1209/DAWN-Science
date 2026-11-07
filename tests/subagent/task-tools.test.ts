import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,mkdirSync,rmSync,symlinkSync,writeFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {resolveTaskSettings,taskToolDenial,createTaskTools} from '../../src/subagent/task-tools.js'
import {TaskContractSchema} from '../../src/orchestration/task-contract.js'
const roots:string[]=[]
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
const root=()=>{const p=mkdtempSync(join(tmpdir(),'dawn-task-gate-'));roots.push(p);return p}
it('read-only removes execution and write capabilities even if the persona requests them',()=>{
 const settings=resolveTaskSettings(TaskContractSchema.parse({}),'allow-all',['read','bash','write'])
 expect(settings.scope.tools).toEqual(['read'])
 expect(taskToolDenial(settings.scope,root(),'bash',{command:'echo hi'})).toBeDefined()
})
it('scoped writing refuses raw data, inputs, aliases and undeclared paths',()=>{
 const cwd=root(),outside=root();mkdirSync(join(cwd,'results'));symlinkSync(outside,join(cwd,'results','alias'))
 const c=TaskContractSchema.parse({access:'workspace-write',inputs:['input.csv'],outputs:['results/out.csv','results/alias/no.txt','data/raw/x.csv']})
 const s=resolveTaskSettings(c,'allow-all',['write','read'])
 expect(taskToolDenial(s.scope,cwd,'write',{path:'results/out.csv',content:'x'})).toBeUndefined()
 for(const path of ['input.csv','else.csv','results/alias/no.txt','data/raw/x.csv'])expect(taskToolDenial(s.scope,cwd,'write',{path,content:'x'})).toBeDefined()
})
it('frozen risky permission rejects shell escalation even when task access allows execution',()=>{
 const settings=resolveTaskSettings(undefined,'deny-risky')
 expect(taskToolDenial(settings.scope,root(),'bash',{command:'npm install unknown'})).toBeDefined()
})
it('wraps real Pi tools and never executes denied writes or invents their evidence',async()=>{
 const cwd=root(),settings=resolveTaskSettings(TaskContractSchema.parse({}),'allow-all',['read','write'])
 const {tools,evidence}=createTaskTools(cwd,settings)
 const write=tools.find(t=>t.name==='write')
 expect(write).toBeUndefined();expect(existsSync(join(cwd,'denied.txt'))).toBe(false);expect(evidence()).toEqual([])
 writeFileSync(join(cwd,'input.txt'),'hello')
 const read=tools.find(t=>t.name==='read')!
 await read.execute('r1',{path:'input.txt'})
 expect(evidence()[0]).toMatchObject({toolCallId:'r1',name:'read',status:'done'})
})

it('rejects writes through a hard-link alias of a declared input',async()=>{
 const {linkSync}=await import('node:fs')
 const cwd=root();writeFileSync(join(cwd,'input.csv'),'original');linkSync(join(cwd,'input.csv'),join(cwd,'out.csv'))
 const settings=resolveTaskSettings(TaskContractSchema.parse({access:'workspace-write',inputs:['input.csv'],outputs:['out.csv']}),'allow-all')
 expect(taskToolDenial(settings.scope,cwd,'write',{path:'out.csv',content:'overwrite'})).toBeDefined()
})
it('narrow scopes cannot delegate an effect through teammate messaging',()=>{
 const settings=resolveTaskSettings(TaskContractSchema.parse({}),'allow-all')
 expect(taskToolDenial(settings.scope,root(),'bot_message',{to:'writer',message:'write a file'})).toBeDefined()
 expect(taskToolDenial(settings.scope,root(),'team_send',{to:'writer',content:'write a file'})).toBeDefined()
})

it('records actual silent shell execution in the Pi result and satisfies required execution evidence',async()=>{
 const {acceptTaskResult}=await import('../../src/orchestration/task-contract.js')
 const cwd=root(),contract=TaskContractSchema.parse({access:'workspace-exec',requireExecution:true})
 const settings=resolveTaskSettings(contract,'allow-all',['bash']),{tools,evidence}=createTaskTools(cwd,settings)
 const result=await tools[0]!.execute('actual-shell',{command:'true'})
 expect(result.details).toMatchObject({analysisRouteEvidence:{execution:'ran'}})
 expect(acceptTaskResult(contract,JSON.stringify({summary:'ran',blockers:[],deliverables:[],execution:{state:'completed',note:'silent command exited',toolCallIds:['actual-shell']},verification:{state:'unreviewed',note:'no scientific review'}}),evidence(),cwd).state).toBe('accepted')
})

it('registers submission for a contract, permits fixing its arguments and blocks writes after commit',async()=>{
 const cwd=root(),contract=TaskContractSchema.parse({access:'workspace-write',outputs:['out.txt'],submission:'tool'})
 const task=createTaskTools(cwd,resolveTaskSettings(contract,'allow-all',['write']))
 const submit=task.tools.find(t=>t.name==='submit_task_result')!
 expect(submit).toBeDefined();expect((await submit.execute('bad',{summary:'incomplete'})).isError).toBe(true)
 await task.tools.find(t=>t.name==='write')!.execute('w',{path:'out.txt',content:'original'})
 expect((await submit.execute('good',{summary:'done',blockers:[],deliverables:[{path:'out.txt'}],execution:{state:'not_run',note:'document'},verification:{state:'unreviewed',note:'not scientific review'}})).isError).not.toBe(true)
 expect((await task.tools.find(t=>t.name==='write')!.execute('late',{path:'out.txt',content:'changed'})).isError).toBe(true)
 const {readFileSync}=await import('node:fs');expect(readFileSync(join(cwd,'out.txt'),'utf8')).toBe('original')
})
it('a pending authorization blocks submission, and ancillary tools share the terminal gate',async()=>{
 const cwd=root();let release!:()=>void
 const gate=new Promise<void>(r=>{release=r})
 const task=createTaskTools(cwd,resolveTaskSettings(TaskContractSchema.parse({submission:'tool'}),'allow-all',['read']),async()=>{await gate;return undefined})
 writeFileSync(join(cwd,'in.txt'),'input')
 const read=task.tools.find(t=>t.name==='read')!.execute('r',{path:'in.txt'})
 const submit=task.tools.find(t=>t.name==='submit_task_result')!,value={summary:'checked',blockers:[],deliverables:[],execution:{state:'not_run',note:'readonly'},verification:{state:'unreviewed',note:'not science review'}}
 expect((await submit.execute('early',value)).isError).toBe(true);release();await read
 const proof=task.evidence();expect((await submit.execute('done',value)).isError).not.toBe(true)
 let ran=false;const extra=task.guardExtras([{name:'resource_read',label:'resource_read',description:'test',parameters:{},execute:async()=>{ran=true;return{content:[]}}}])[0]!
 expect((await extra.execute('late',{})).isError).toBe(true);expect(ran).toBe(false)
 proof[0]!.status='error';expect(task.evidence()[0]?.status).toBe('done')
})

const evidenceLabel=(result:{content:{type:string;text?:string}[]})=>JSON.parse(result.content.find(c=>c.text?.startsWith('[task_tool_evidence] '))!.text!.slice('[task_tool_evidence] '.length))
it('exposes actual read and silent execution IDs in separate text without altering scientific evidence',async()=>{
 const cwd=root();writeFileSync(join(cwd,'input.txt'),'scientific source')
 const task=createTaskTools(cwd,resolveTaskSettings(TaskContractSchema.parse({access:'workspace-exec'}),'allow-all',['read','bash']))
 const read=await task.tools.find(t=>t.name==='read')!.execute('host-read',{path:'input.txt',toolCallId:'forged'})
 expect(read.content[0]?.text).toBe('scientific source')
 expect(evidenceLabel(read)).toMatchObject({toolCallId:'host-read',name:'read',status:'done',execution:'not_observed',path:'input.txt'})
 const shell=await task.tools.find(t=>t.name==='bash')!.execute('host-shell',{command:'true'})
 expect(evidenceLabel(shell)).toMatchObject({toolCallId:'host-shell',name:'bash',status:'done',execution:'ran'})
 expect(task.evidence()[0]?.result).toBe('scientific source')
 expect(task.evidence()[1]?.result).not.toContain('[task_tool_evidence]')
})
it('labels denied, failed and successful file calls with their real status and paths',async()=>{
 const cwd=root(),task=createTaskTools(cwd,resolveTaskSettings(TaskContractSchema.parse({access:'workspace-write',outputs:['out.txt']}),'allow-all',['write','read']))
 const write=task.tools.find(t=>t.name==='write')!,read=task.tools.find(t=>t.name==='read')!
 expect(evidenceLabel(await write.execute('denied',{path:'other.txt',content:'secret'}))).toMatchObject({toolCallId:'denied',status:'error',execution:'not_observed'})
 const failed=await read.execute('missing',{path:'missing.txt'})
 expect(failed.isError).toBe(true);expect(evidenceLabel(failed)).toMatchObject({toolCallId:'missing',status:'error'})
 expect(evidenceLabel(await write.execute('written',{path:'out.txt',content:'ok'}))).toMatchObject({toolCallId:'written',status:'done',filesWritten:[join(cwd,'out.txt')]})
 expect(task.evidence()).toHaveLength(3)
})
it('keeps task catalogs isolated and rejects IDs copied from another task',async()=>{
 const cwd=root();writeFileSync(join(cwd,'in.txt'),'input')
 const settings=resolveTaskSettings(TaskContractSchema.parse({submission:'tool'}),'allow-all',['read'])
 const first=createTaskTools(cwd,settings),second=createTaskTools(cwd,settings)
 await first.tools.find(t=>t.name==='read')!.execute('first-only',{path:'in.txt'})
 const response=await second.submission!.submit({summary:'forged review',blockers:[],deliverables:[],execution:{state:'not_run',note:'readonly'},verification:{state:'reviewed',note:'borrowed',toolCallIds:['first-only']}})
 expect(response.isError).toBe(true)
 expect(JSON.parse(response.content[0]!.text).evidenceCatalog.entries).toEqual([])
 expect(first.evidence()).toHaveLength(1);expect(second.evidence()).toEqual([])
})
