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
