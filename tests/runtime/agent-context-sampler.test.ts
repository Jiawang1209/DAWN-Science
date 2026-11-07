import {describe,it,expect} from 'vitest'
import {sampleAgentContext} from '../../src/runtime/agent-context-sampler.js'
import {AgentContextSampleSchema} from '../../src/protocol/agent-context-observation.js'
const reply=(model='m',provider='p')=>({role:'assistant',model,provider,stopReason:'stop',usage:{totalTokens:20,input:12,output:8,cacheRead:0,cacheWrite:0},content:[{type:'text',text:'visible'},{type:'thinking',thinking:'PRIVATE_THOUGHT'}]})
const make=(messages:unknown[]=[reply()],branch?:unknown[],tokens:number|null|undefined=20,capacity:number|undefined=100)=>({state:{model:{id:'m',provider:'p',contextWindow:capacity as number|undefined},systemPrompt:'system',tools:[{name:'read',description:'Read',parameters:{type:'object'},execute:()=>{}}],messages},messages,getContextUsage:()=>tokens===undefined?undefined:{tokens},sessionManager:{getBranch:()=>branch??messages.map(message=>({type:'message',message}))}})
describe('numeric current context producer',()=>{
 it('uses SDK tokens with independent model capacity and explicit estimate provenance',()=>{expect(sampleAgentContext(make(),10)).toMatchObject({availability:'available',source:'sdk-estimate',usedTokens:20,contextWindow:100,contextWindowSource:'model-config',observedAt:10})})
 it('never borrows the latest SDK anchor from another route',()=>{expect(sampleAgentContext(make([reply(),reply('other')]),10)).toMatchObject({availability:'unknown',reason:'no-current-route-anchor'});expect(sampleAgentContext(make([reply('m','other')]),10).availability).toBe('unknown')})
 it('requires anchor after latest compaction even when retained old messages survive',()=>{const message=reply();expect(sampleAgentContext(make([message],[{type:'message',message},{type:'compaction'}]),10)).toMatchObject({availability:'unknown',reason:'after-compaction'})})
 it('does not turn null or missing SDK readings into pseudo-zero or old receipt totals',()=>{for(const tokens of [null,undefined]){const session=make();session.getContextUsage=()=>tokens===undefined?undefined:{tokens};const sample=sampleAgentContext(session,10);expect(sample.availability).toBe('unknown');expect(sample).not.toHaveProperty('usedTokens')}})
 it('accepts actual SDK zero but omits unavailable capacity and percent',()=>{const session=make([reply()],undefined,0);session.state.model.contextWindow=undefined;const sample=sampleAgentContext(session,10);expect(sample).toMatchObject({availability:'available',usedTokens:0});expect(sample).not.toHaveProperty('contextWindow');expect(sample).not.toHaveProperty('percent')})
 it('counts retained public content only; private reasoning affects neither counts nor payload',()=>{const session=make();const before=sampleAgentContext(session,10);(session.messages[0] as ReturnType<typeof reply>).content.push({type:'thinking',thinking:'SECRET'.repeat(1000)} as never);const after=sampleAgentContext(session,10);expect(after.composition).toEqual(before.composition);expect(JSON.stringify(after)).not.toMatch(/PRIVATE_THOUGHT|SECRET|visible|systemPrompt|execute/);expect(after.composition?.messageBytes).toBe(Buffer.byteLength('visible'))})
 it('strictly distinguishes unknown from zero and rejects raw/invalid payloads',()=>{const base={version:1,observedAt:10,provider:'p',model:'m'};expect(AgentContextSampleSchema.safeParse({...base,availability:'available',source:'sdk-estimate',usedTokens:0}).success).toBe(true);for(const usedTokens of [-1,NaN,Infinity])expect(AgentContextSampleSchema.safeParse({...base,availability:'available',source:'sdk-estimate',usedTokens}).success).toBe(false);expect(AgentContextSampleSchema.safeParse({...base,availability:'unknown',source:'unknown',reason:'unsupported',usedTokens:0}).success).toBe(false);expect(AgentContextSampleSchema.safeParse({...base,availability:'unknown',source:'unknown',reason:'SECRET exception'}).success).toBe(false);expect(AgentContextSampleSchema.safeParse({...base,availability:'available',source:'sdk-estimate',usedTokens:20,prompt:'SECRET'}).success).toBe(false)})
})

import {observeAgentContext} from '../../src/runtime/agent-context-sampler.js'
import {AgentSession} from '@earendil-works/pi-coding-agent'
it('exercises installed SDK anchoring/compaction/capacity behavior without network',()=>{
 const session=make(),model=session.state.model
 const sdk=()=>AgentSession.prototype.getContextUsage.call({model,messages:session.messages,sessionManager:session.sessionManager} as never)
 session.getContextUsage=sdk
 expect(sdk()?.tokens).toBe(20);expect(sampleAgentContext(session,10).availability).toBe('available')
 session.messages.push(reply('old'));expect(sdk()?.tokens).toBe(20);expect(sampleAgentContext(session,10).availability).toBe('unknown')
 session.sessionManager.getBranch=()=>[{type:'message',message:reply()},{type:'compaction'}] as never;expect(sdk()?.tokens).toBeNull();expect(sampleAgentContext(session,10)).toMatchObject({availability:'unknown',reason:'after-compaction'})
 model.contextWindow=undefined;expect(sdk()).toBeUndefined();expect(sampleAgentContext(session,10)).not.toHaveProperty('usedTokens')
})
it('samples after SDK message persistence, coalesces boundaries, and never samples deltas',async()=>{
 const session=make([]);let listener!:(event:unknown)=>void,calls=0;const original=session.sessionManager.getBranch
 session.sessionManager.getBranch=()=>{calls++;return original()};const samples:unknown[]=[]
 const stop=observeAgentContext({...session,subscribe:(cb:typeof listener)=>{listener=cb;return()=>{}}},sample=>samples.push(sample))
 expect(calls).toBe(1);for(let i=0;i<1000;i++)listener({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'PRIVATE'}});expect(calls).toBe(1)
 listener({type:'message_end'});listener({type:'turn_end'});session.messages.push(reply()) // SDK persists AFTER listener dispatch.
 await Promise.resolve();expect(calls).toBe(2);expect(samples.at(-1)).toMatchObject({availability:'available',usedTokens:20});listener({type:'turn_end'});await Promise.resolve();expect(samples).toHaveLength(2);stop();listener({type:'agent_end'});await Promise.resolve();expect(calls).toBe(3)
})
it('isolates both subscriber and reporter failures from execution',()=>{
 expect(()=>observeAgentContext({...make(),subscribe:()=>{throw new Error('PRIVATE')}},()=>{})).not.toThrow()
 expect(()=>observeAgentContext(make(),()=>{throw new Error('PRIVATE')})).not.toThrow()
})
it('does not echo SDK exceptions, hidden fields, or raw retained contents into a sample',()=>{
 const session=make();session.getContextUsage=()=>{throw new Error('PRIVATE_EXCEPTION_WITH_SECRET')}
 const sample=sampleAgentContext(session,10)
 expect(sample).toMatchObject({availability:'unknown',source:'unknown',reason:'sample-failed'})
 expect(JSON.stringify(sample)).not.toMatch(/PRIVATE|thinking|reasoning|systemPrompt|arguments|visible/)
})
it('enforces bounded identity/capacity/provenance/composition with no extra raw fields',()=>{
 const base={version:1,observedAt:10,provider:'p',model:'m',availability:'available',source:'sdk-estimate',usedTokens:0}
 for(const extra of [{provider:'x'.repeat(257)},{model:'bad\nroute'},{source:'provider'},{contextWindow:0,contextWindowSource:'model-config'},{contextWindow:100},{composition:{systemBytes:1,toolBytes:2,messageBytes:-1,source:'retained-bytes-estimate'}},{composition:{systemBytes:1,toolBytes:2,messageBytes:3,source:'retained-bytes-estimate',thinking:'PRIVATE'}}])expect(AgentContextSampleSchema.safeParse({...base,...extra}).success).toBe(false)
})
