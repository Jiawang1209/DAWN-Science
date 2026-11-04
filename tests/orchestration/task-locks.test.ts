import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,rmSync,symlinkSync,writeFileSync,linkSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {taskOutputReservation,sharedTaskOutputLocks,outputLockScope,canonicalOutputPaths,localOutputReservationPaths} from '../../src/bot/output-locks.js'
import {resolveTaskSettings} from '../../src/subagent/task-tools.js'
import {TaskContractSchema} from '../../src/orchestration/task-contract.js'
const roots:string[]=[];afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
it('shares canonical scope with Bot locks and releases queued cancellation without starting',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-task-lock-'));roots.push(cwd)
 symlinkSync(cwd,join(cwd,'alias'))
 expect(outputLockScope(join(cwd,'alias'))).toBe(outputLockScope(cwd))
 const ctrl=new AbortController(),settings=resolveTaskSettings(TaskContractSchema.parse({access:'workspace-write',outputs:['out.txt']}),'allow-all')
 const held=await sharedTaskOutputLocks.acquire(outputLockScope(cwd),undefined,new AbortController().signal)
 let started=false
 const waiting=taskOutputReservation(cwd,settings,ctrl.signal).then(release=>{started=true;release()})
 ctrl.abort();await expect(waiting).rejects.toThrow();expect(started).toBe(false);held()
 const release=await taskOutputReservation(cwd,settings,new AbortController().signal);release()
})
it('allows disjoint scoped outputs but reserves the whole workspace for shell',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-task-disjoint-'));roots.push(cwd)
 const a=resolveTaskSettings(TaskContractSchema.parse({access:'workspace-write',outputs:['a.txt']}),'allow-all')
 const b=resolveTaskSettings(TaskContractSchema.parse({access:'workspace-write',outputs:['b.txt']}),'allow-all')
 const first=await taskOutputReservation(cwd,a,new AbortController().signal),second=await taskOutputReservation(cwd,b,new AbortController().signal)
 const ctrl=new AbortController();const shell=taskOutputReservation(cwd,resolveTaskSettings(undefined,'allow-all'),ctrl.signal)
 ctrl.abort();await expect(shell).rejects.toThrow();first();second()
})

it.each(['scoped','legacy Bot'])('serializes hard-link aliases against a %s writer',async adapter=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-task-hardlink-'));roots.push(cwd)
 writeFileSync(join(cwd,'a.txt'),'original');linkSync(join(cwd,'a.txt'),join(cwd,'b.txt'))
 const settings=(path:string)=>resolveTaskSettings(TaskContractSchema.parse({access:'workspace-write',outputs:[path]}),'allow-all')
 const first=await taskOutputReservation(cwd,settings('a.txt'),new AbortController().signal)
 const controller=new AbortController();let acquired=false
 const waiting=(adapter==='scoped'?taskOutputReservation(cwd,settings('b.txt'),controller.signal):sharedTaskOutputLocks.acquire(outputLockScope(cwd),localOutputReservationPaths(['b.txt'],cwd),controller.signal)).then(release=>{acquired=true;return release})
 try{
  await new Promise<void>(resolve=>setImmediate(resolve))
  expect(acquired).toBe(false)
  first();const second=await waiting;second()
 }finally{controller.abort();first();await waiting.then(release=>release(),()=>{})}
})

it('a real scoped subprocess holds the same Bot reservation until cancellation and actual exit',async()=>{
 const {SubagentExecutor}=await import('../../src/subagent/executor.js')
 const {existsSync,readFileSync}=await import('node:fs')
 const cwd=mkdtempSync(join(tmpdir(),'dawn-task-live-lock-'));roots.push(cwd)
 const marker=join(cwd,'pid'),controller=new AbortController()
 const contract=TaskContractSchema.parse({access:'workspace-write',outputs:['out.txt']})
 const executor=new SubagentExecutor({context:{cwd,provider:'p',model:'m',agentDirOf:()=>join(cwd,'run')},prepareTask:()=>resolveTaskSettings(contract,'allow-all'),
 childOf:()=>({command:process.execPath,args:['-e',`require('fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));process.stdin.resume();setInterval(()=>{},1000)`]})})
 const running=executor.run({mode:'single',agent:'a',task:'hold'},[{name:'a',description:'a',systemPrompt:'a',filePath:'/a'}],controller.signal)
 const end=Date.now()+3000;while(!existsSync(marker)&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,10))
 expect(existsSync(marker)).toBe(true)
 const pid=Number(readFileSync(marker,'utf8'));let acquired=false
 const waiting=sharedTaskOutputLocks.acquire(outputLockScope(cwd),canonicalOutputPaths(['out.txt'],cwd),new AbortController().signal).then(release=>{acquired=true;return release})
 try {
  await new Promise<void>(resolve=>setImmediate(resolve));expect(acquired).toBe(false)
  controller.abort();expect((await running).results[0]?.ok).toBe(false)
  const release=await waiting
  try{let alive=true;try{process.kill(pid,0)}catch{alive=false};expect(alive).toBe(false)}finally{release()}
 }finally{controller.abort();await running;const release=await waiting;release()}
})
