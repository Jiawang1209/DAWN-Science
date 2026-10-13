import {expect,it,vi} from "vitest"
import {runBotTurn} from "../../src/bot/team-runner.js"
import type {AgentEvent,EventSink} from "../../src/runtime/types.js"
it("只在整轮 idle 结算，turn_end 不提早释放成员", async()=>{
 let sink:EventSink=()=>{}; let done=false;let detached=false
 const promise=runBotTurn({sessionId:"s",signal:new AbortController().signal,attach:cb=>{sink=cb;return()=>{detached=true}},write:()=>{},abort:async()=>{} }).then(r=>{done=true;return r})
 sink({kind:"output",sessionId:"s",data:"first"});sink({kind:"turn_end",sessionId:"s"});await Promise.resolve();expect(done).toBe(false)
 sink({kind:"output",sessionId:"s",data:"final"});sink({kind:"idle",sessionId:"s"});expect(await promise).toEqual({ok:true,output:"firstfinal"});expect(detached).toBe(true)
})
it("超时且 abort 拒绝仍收尾，保留失败状态并移除订阅",async()=>{
 vi.useFakeTimers();let detached=false
 try{const result=runBotTurn({sessionId:"s",signal:new AbortController().signal,attach:()=>()=>{detached=true},write:()=>{},abort:async()=>{throw Error("disconnected")},timeoutMs:10});await vi.advanceTimersByTimeAsync(10);expect(await result).toMatchObject({ok:false,error:expect.stringMatching(/超时.*disconnected/)});expect(detached).toBe(true)}finally{vi.useRealTimers()}
})
it("取消只停止自己的会话并清理订阅",async()=>{
 let stopped=0;const ctrl=new AbortController();let sink:EventSink=()=>{}
 const promise=runBotTurn({sessionId:"member",signal:ctrl.signal,attach:cb=>{sink=cb;return()=>{}},write:()=>{},abort:async()=>{stopped++;sink({kind:"idle",sessionId:"member"})}})
 ctrl.abort();expect((await promise).ok).toBe(false);expect(stopped).toBe(1)
})
it("fails and aborts at the 64 KiB UTF-8 output boundary without returning a partial artifact list",async()=>{
 let sink:EventSink=()=>{};let stopped=0;let detached=false
 const promise=runBotTurn({sessionId:"s",signal:new AbortController().signal,attach:cb=>{sink=cb;return()=>{detached=true}},write:()=>{},abort:async()=>{stopped++;sink({kind:"idle",sessionId:"s"})}})
 sink({kind:"output",sessionId:"s",data:"中".repeat(20_000)})
 sink({kind:"output",sessionId:"s",data:"中".repeat(2_000)})
 // More output must never grow the buffer or recover a failed turn.
 sink({kind:"output",sessionId:"s",data:'["analysis/result.csv"]'})
 sink({kind:"idle",sessionId:"s"})
 expect(await promise).toMatchObject({ok:false,output:"",error:expect.stringMatching(/64 KiB.*66000.*未.*截断/)});expect(stopped).toBe(1);expect(detached).toBe(true)
})
