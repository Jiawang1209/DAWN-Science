import{expect,it}from"vitest"
import{BotOutputLocks}from"../../src/bot/output-locks.js"
import{canonicalOutputPaths}from"../../src/bot/output-locks.js"
import{mkdtempSync,mkdirSync,symlinkSync,rmSync,realpathSync}from"node:fs"
import{tmpdir}from"node:os"
import{join}from"node:path"
it("相对、绝对和符号链接输出都预约同一实际路径",()=>{
 const root=mkdtempSync(join(tmpdir(),"bot-outputs-"))
 try{mkdirSync(join(root,"results"));symlinkSync(join(root,"results"),join(root,"alias"));expect(canonicalOutputPaths(["results/new.csv",join(root,"results/new.csv"),"alias/new.csv"],root)).toEqual(Array(3).fill(join(realpathSync(root),"results/new.csv")))}finally{rmSync(root,{recursive:true,force:true})}
})
it("同一 scope 的冲突写入排队，互不重叠的产物可以并行，取消队列不执行",async()=>{
 const locks=new BotOutputLocks(),a=new AbortController(),b=new AbortController()
 const release=await locks.acquire("scope",["figures/plot.png"],a.signal);let entered=false
 const pending=locks.acquire("scope",["figures/plot.png"],b.signal).then(r=>{entered=true;r()})
 const parallel=await locks.acquire("scope",["scripts/model.py"],a.signal);parallel();await Promise.resolve();expect(entered).toBe(false);release();await pending;expect(entered).toBe(true)
 const held=await locks.acquire("scope",["*"],a.signal),c=new AbortController();const cancelled=locks.acquire("scope",["results.csv"],c.signal);c.abort();await expect(cancelled).rejects.toThrow(/停止/);held()
})
it('scientific readonly validation reserves its inputs against other task writers until acceptance drains',async()=>{
 const {taskOutputReservation}=await import('../../src/bot/output-locks.js'),{resolveTaskSettings}=await import('../../src/subagent/task-tools.js'),{TaskContractSchema}=await import('../../src/orchestration/task-contract.js')
 const root=mkdtempSync(join(tmpdir(),'science-review-lock-')),signal=new AbortController().signal
 try{
  const review=resolveTaskSettings(TaskContractSchema.parse({resultType:'review',inputs:['result.csv']}),'allow-all')
  const writer=resolveTaskSettings(TaskContractSchema.parse({access:'workspace-write',outputs:['result.csv']}),'allow-all')
  const release=await taskOutputReservation(root,review,signal);let entered=false
  const pending=taskOutputReservation(root,writer,signal).then(unlock=>{entered=true;unlock()})
  await new Promise<void>(resolve=>setImmediate(resolve));expect(entered).toBe(false);release();await pending;expect(entered).toBe(true)
 }finally{rmSync(root,{recursive:true,force:true})}
})
it.each([['read','write'],['read']])('holds version-bound inputs with tool set %j and supports canceling a competing writer',async(...tools)=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path')
 const {taskOutputReservation}=await import('../../src/bot/output-locks.js'),{resolveTaskSettings}=await import('../../src/subagent/task-tools.js'),{TaskContractSchema}=await import('../../src/protocol/task-contract.js')
 const root=mkdtempSync(join(tmpdir(),'version-bound-lock-'));let release=()=>{}
 try{writeFileSync(join(root,'in.csv'),'x');const base=resolveTaskSettings(TaskContractSchema.parse({inputs:['in.csv'],outputs:['out.csv'],access:'workspace-write'}),'allow-all'),settings={...base,versions:{version:1 as const,inputs:[{path:'in.csv',sha256:'0'.repeat(64),bytes:1}]}}
 settings.scope.tools=tools;release=await taskOutputReservation(root,settings,new AbortController().signal)
 let entered=false;const ctrl=new AbortController(),pending=taskOutputReservation(root,resolveTaskSettings(TaskContractSchema.parse({outputs:['in.csv'],access:'workspace-write'}),'allow-all'),ctrl.signal).then(unlock=>{entered=true;unlock()})
 await new Promise<void>(done=>setImmediate(done));expect(entered).toBe(false);ctrl.abort();await expect(pending).rejects.toThrow(/停止/)
 }finally{release();rmSync(root,{recursive:true,force:true})}
})
