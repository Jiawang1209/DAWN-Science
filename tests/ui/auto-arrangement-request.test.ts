import {expect,it,vi} from 'vitest'
import {createAutoArrangementRequester,stopAutoArrangement} from '../../src/ui/auto-arrangement-request.js'
it('enables the existing read-only mode before sending a semantic planning request',async()=>{
 const calls:string[]=[],send=vi.fn(async(_owner:string,text:string)=>{calls.push('send');expect(text).toContain('比较两份数据');expect(text).toContain('不能固定拆成三块')})
 const request=createAutoArrangementRequester({read:async()=>({planning:false}),acquire:async()=>{calls.push('lease')},enable:async()=>{calls.push('readonly')},send,running:()=>false})
 await request('p','比较两份数据','保留独立审阅',new AbortController().signal,()=>true)
 expect(calls).toEqual(['lease','readonly','send'])
})
it('does not send or change the new owner after cancellation or a late lease reply',async()=>{
 let done!:()=>void,current=true;const enable=vi.fn(async()=>{}),send=vi.fn(async()=>{})
 const request=createAutoArrangementRequester({read:async()=>({planning:false}),acquire:()=>new Promise<void>(r=>{done=r}),enable,send,running:()=>false})
 const pending=request('p','calculate','',new AbortController().signal,()=>current)
 await Promise.resolve();await Promise.resolve();current=false;done();await expect(pending).rejects.toThrow();expect(enable).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled()
})
it('does not silently queue planning into an active turn or send when read-only setup fails',async()=>{
 const send=vi.fn(async()=>{})
 const opts={read:async()=>({planning:false}),acquire:async()=>{},enable:async()=>{throw Error('failed')},send,running:()=>false}
 await expect(createAutoArrangementRequester({...opts,running:()=>true})('p','task','',new AbortController().signal,()=>true)).rejects.toThrow()
 await expect(createAutoArrangementRequester(opts)('p','task','',new AbortController().signal,()=>true)).rejects.toThrow('failed')
 expect(send).not.toHaveBeenCalled()
})
it('a late stop read cannot abort a newer input, and a late acknowledgement cannot clear it',async()=>{
 let input:string|undefined='u1',release!:()=>void
 const abort=vi.fn(async()=>{}),acknowledge=vi.fn()
 const opts={input:()=>input,isCurrent:()=>true,running:()=>true,read:()=>new Promise<{planning:boolean}>(r=>{release=()=>r({planning:true})}),abort,acknowledge}
 const old=stopAutoArrangement(opts);input='u2';release();await old
 expect(abort).not.toHaveBeenCalled();expect(acknowledge).not.toHaveBeenCalled()
 input='u3'
 const late=stopAutoArrangement({...opts,read:async()=>({planning:true}),abort:()=>new Promise<void>(r=>{release=r})})
 await Promise.resolve();input='u4';release();await late
 expect(acknowledge).not.toHaveBeenCalled()
 await stopAutoArrangement({...opts,read:async()=>({planning:true})})
 expect(abort).toHaveBeenCalledOnce();expect(acknowledge).toHaveBeenCalledWith('u4')
})
