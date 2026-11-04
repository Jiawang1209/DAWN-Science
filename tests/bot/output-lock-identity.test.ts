import {expect,it} from 'vitest'
import {mkdtempSync,writeFileSync,renameSync,linkSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os';import {join} from 'node:path'
import {taskOutputReservation} from '../../src/bot/output-locks.js'
import {resolveTaskSettings} from '../../src/subagent/task-tools.js'
import {TaskContractSchema} from '../../src/protocol/task-contract.js'
const writer=(path:string)=>resolveTaskSettings(TaskContractSchema.parse({access:'workspace-write',outputs:[path]}),'allow-all')
const tick=()=>new Promise<void>(done=>setImmediate(done))
it('refreshes a queued reader after the prior owner atomically replaces an input and creates a new alias',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-lock-queue-'));let owner=()=>{},reader=()=>{}
 try{
 writeFileSync(join(root,'in.csv'),'same');owner=await taskOutputReservation(root,resolveTaskSettings(TaskContractSchema.parse({access:'workspace-exec'}),'allow-all'),new AbortController().signal)
 const pending=taskOutputReservation(root,resolveTaskSettings(TaskContractSchema.parse({resultType:'review',inputs:['in.csv']}),'allow-all'),new AbortController().signal)
 writeFileSync(join(root,'replacement'),'same');renameSync(join(root,'replacement'),join(root,'in.csv'));linkSync(join(root,'in.csv'),join(root,'alias.csv'));owner();reader=await pending
 let entered=false;const ctrl=new AbortController(),competitor=taskOutputReservation(root,writer('alias.csv'),ctrl.signal).then(unlock=>{entered=true;unlock()},()=>{})
 await tick();ctrl.abort();await competitor;expect(entered).toBe(false)
 }finally{reader();owner();rmSync(root,{recursive:true,force:true})}
})
it.each(['old','new'] as const)('keeps both historical and current inode reservations while an active writer replaces a file (%s alias)',async alias=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-lock-active-'));let release=()=>{}
 try{
 writeFileSync(join(root,'out.csv'),'old');linkSync(join(root,'out.csv'),join(root,'old.csv'));release=await taskOutputReservation(root,writer('out.csv'),new AbortController().signal)
 writeFileSync(join(root,'replacement'),'new');renameSync(join(root,'replacement'),join(root,'out.csv'));linkSync(join(root,'out.csv'),join(root,'new.csv'))
 let entered=false;const ctrl=new AbortController(),competitor=taskOutputReservation(root,writer(alias+'.csv'),ctrl.signal).then(unlock=>{entered=true;unlock()},()=>{})
 await tick();ctrl.abort();await competitor;expect(entered).toBe(false)
 }finally{release();rmSync(root,{recursive:true,force:true})}
})
it('reserves future case aliases before either output directory exists',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-lock-case-'));let release=()=>{}
 try{release=await taskOutputReservation(root,writer('results/a/report.md'),new AbortController().signal);let entered=false;const ctrl=new AbortController(),competitor=taskOutputReservation(root,writer('results/A/report.md'),ctrl.signal).then(unlock=>{entered=true;unlock()},()=>{});await tick();ctrl.abort();await competitor;expect(entered).toBe(false)}finally{release();rmSync(root,{recursive:true,force:true})}
})
it('shares reservations across aliases of the same workspace, including case aliases where supported',async()=>{
 const {existsSync,symlinkSync}=await import('node:fs')
 const root=mkdtempSync(join(tmpdir(),'DawnScopeCase-'));let release=()=>{}
 try{
 const upper=root.toUpperCase(),alias=existsSync(upper)?upper:join(root,'workspace-alias');if(alias!==upper)symlinkSync(root,alias)
 release=await taskOutputReservation(root,writer('results/out.csv'),new AbortController().signal)
 let entered=false;const ctrl=new AbortController(),competitor=taskOutputReservation(alias,writer('results/out.csv'),ctrl.signal).then(unlock=>{entered=true;unlock()},()=>{})
 await tick();ctrl.abort();await competitor;expect(entered).toBe(false)
 }finally{release();rmSync(root,{recursive:true,force:true})}
})
