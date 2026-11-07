import {expect,it} from 'vitest'
import {getBuiltinModel} from '@earendil-works/pi-ai/providers/all'
import {normalizeContext} from '@earendil-works/pi-ai/utils/transcript'
import {stream} from '@earendil-works/pi-ai/api/openai-completions'
import type {Model} from '@earendil-works/pi-ai'
import {researchProxyModel} from '../../scripts/research-model-compat.js'
import {RESEARCH_STAGE_PROVIDERS} from '../../scripts/research-trial-budget.js'

it('keeps serialized DeepSeek payloads identical across the single provider and both loopback aliases',async()=>{
 const original=getBuiltinModel('deepseek','deepseek-flash') as Model<'openai-completions'>
 const serialize=async(model:Model<'openai-completions'>)=>{
  let body:unknown
  const result=await stream(model,normalizeContext({messages:[
   {role:'user',content:'Inspect the synthetic input',timestamp:1},
   {role:'assistant',content:[{type:'toolCall',id:'read-1',name:'read',arguments:{path:'in.csv'}}],api:original.api,provider:original.provider,model:original.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'toolUse',timestamp:2},
   {role:'toolResult',toolCallId:'read-1',toolName:'read',content:[{type:'text',text:'x\n1'}],isError:false,timestamp:3},
  ]}),{apiKey:'offline-only',maxTokens:123,fetch:async(_url,init)=>{
   body=JSON.parse(String(init?.body))
   return new Response('data: {"id":"mock","choices":[{"delta":{"content":"ok"},"index":0,"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})
  }}).result()
  expect(result.stopReason).not.toBe('error')
  return body
 }
 const expected=await serialize({...original,reasoning:false})
 expect(expected).toMatchObject({max_tokens:123})
 expect(expected).not.toHaveProperty('store')
 for(const provider of ['deepseek',...Object.values(RESEARCH_STAGE_PROVIDERS)]){
  expect(await serialize({...researchProxyModel(original),api:'openai-completions',provider,baseUrl:'http://127.0.0.1:1'} as Model<'openai-completions'>)).toEqual(expected)
 }
 expect(()=>researchProxyModel({...original,provider:'unverified'})).toThrow(/verified/)
})
