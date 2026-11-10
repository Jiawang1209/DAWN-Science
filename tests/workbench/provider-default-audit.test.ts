import {expect,it,vi} from 'vitest'
import {createWorkbenchBackend} from '../../src/workbench/backend.js'
function fixture(askOnce:NonNullable<Parameters<typeof createWorkbenchBackend>[0]['askOnce']>=async()=>({text:'ok',model:'fixture'})){
 const stored=new Map<string,string>(),configured=['moonshotai-cn','deepseek']
 const registry={agents:{},providers:{}}
 const sessions={setModel:vi.fn(async()=>{})}
 const settings={get:(key:string)=>stored.get(key),set:(key:string,value:string)=>{stored.set(key,value)}}
 const make=()=>createWorkbenchBackend({projects:{} as never,projectStore:{} as never,runs:{} as never,sessions:sessions as never,registry:registry as never,settings:settings as never,events:{onAnyUpdate:()=>()=>{},on回合收尾:()=>()=>{}} as never,credentials:{get:()=> 'fixture-only',set:()=>{},delete:(id:string)=>{const i=configured.indexOf(id);if(i>=0)configured.splice(i,1)},configured:()=>configured,isEncrypted:()=>true},models:{available:async(id:string)=>[id==='deepseek'?'deepseek-fixture':'kimi-fixture'],known:async()=>configured},askOnce})
 return{make,stored,sessions,registry,configured}
}
const nativeIds=(value:any)=>value.agents.filter((a:any)=>a.kind==='native').map((a:any)=>a.provider)
it('saving DeepSeek explicitly makes new tasks prefer DeepSeek even when Kimi credentials were inserted first',async()=>{
 const f=fixture(),backend=f.make()
 await backend.setCredential({providerId:'deepseek',secret:'fixture-only'})
 expect(nativeIds(await backend.getProviders({}))[0]).toBe('deepseek')
 expect(nativeIds(await f.make().getProviders({}))[0]).toBe('deepseek')
})
it('a successful explicit switch updates the next-task preference and a failed switch cannot replace it',async()=>{
 const f=fixture(),backend=f.make()
 await backend.setSessionModel({sessionId:'a',provider:'deepseek',model:'deepseek-fixture'})
 expect(nativeIds(await backend.getProviders({}))[0]).toBe('deepseek')
 f.sessions.setModel.mockRejectedValueOnce(new Error('busy'))
 await expect(backend.setSessionModel({sessionId:'a',provider:'moonshotai-cn',model:'kimi-fixture'})).rejects.toBeDefined()
 expect(nativeIds(await backend.getProviders({}))[0]).toBe('deepseek')
 await backend.setSessionModel({sessionId:'b',provider:'moonshotai-cn',model:'kimi-fixture'})
 expect(nativeIds(await backend.getProviders({}))[0]).toBe('moonshotai-cn')
})
it('preference is only a projection; stale providers fall back without rewriting agent declarations',async()=>{
 const f=fixture(),backend=f.make()
 await backend.getProviders({});const before=Object.keys(f.registry.agents)
 await backend.setSessionModel({sessionId:'a',provider:'deepseek',model:'deepseek-fixture'})
 await backend.getProviders({});expect(Object.keys(f.registry.agents)).toEqual(before)
 await backend.deleteCredential({providerId:'deepseek'})
 expect(nativeIds(await backend.getProviders({}))[0]).toBe('moonshotai-cn')
})
it('a slow earlier credential validation cannot overwrite a newer explicit selection',async()=>{
 const f=fixture(),backend=f.make()
 // Directory resolution is asynchronous even for a local model catalog.
 const saving=backend.setCredential({providerId:'moonshotai-cn',secret:'fixture-only'})
 await backend.setSessionModel({sessionId:'a',provider:'deepseek',model:'deepseek-fixture'})
 await saving
 expect(nativeIds(await backend.getProviders({}))[0]).toBe('deepseek')
})

it('an obsolete failed key verification cannot replace the result of a newer saved key',async()=>{
 let reject!:(error:Error)=>void
 const ask=vi.fn().mockImplementationOnce(()=>new Promise((_,r)=>{reject=r})).mockResolvedValue({text:'ok',model:'fixture'})
 const f=fixture(ask),backend=f.make()
 const old=backend.setCredential({providerId:'deepseek',secret:'old-fixture'})
 await vi.waitFor(()=>expect(ask).toHaveBeenCalledTimes(1))
 await backend.setCredential({providerId:'deepseek',secret:'new-fixture'})
 reject(new Error('401 invalid API key'));await old
 const result=await backend.getProviders({}) as {unusable?:{providerId:string}[]}
 expect(result.unusable?.some(item=>item.providerId==='deepseek')).not.toBe(true)
 expect(nativeIds(result)[0]).toBe('deepseek')
})
it('an existing profile without a stored preference uses the latest added automatic provider, preserving explicit agent order',async()=>{
 const f=fixture(),backend=f.make()
 expect(nativeIds(await backend.getProviders({}))[0]).toBe('deepseek')
 const explicit=fixture()
 Object.assign(explicit.registry.agents,{manual:{kind:'native',provider:'moonshotai-cn',model:'kimi-fixture',capabilities:['chat']}})
 expect(nativeIds(await explicit.make().getProviders({}))[0]).toBe('moonshotai-cn')
})
