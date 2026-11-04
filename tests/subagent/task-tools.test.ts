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
