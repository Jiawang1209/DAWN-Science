import { expect,it } from 'vitest'
// @ts-expect-error shared development/e2e fixture is JavaScript
import { startMockInferenceServer } from '../../scripts/mock-inference-server.mjs'
const body={model:'deepseek-flash',stream:false,messages:[{role:'user',content:'[analysis_route_action] '+JSON.stringify({routeId:'r',revision:1,stepId:'S1',action:'continue'})}],tools:[{type:'function',function:{name:'get_analysis_route',parameters:{type:'object'}}}]}
async function reply(server:{url:string},request=body){return fetch(server.url+'/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)}).then(r=>r.json())}
it('lets an explicit scenario own tool selection and final reply without falling into another demo',async()=>{
  let next=true
  const server=await startMockInferenceServer({scenario:{toolCall:()=>next?{toolName:'read',args:{path:'data/raw/README.md'}}:undefined,reply:()=> '本场景的真实工具流程已结束'}})
  try{const first=await reply(server);expect(first.choices[0].message.tool_calls[0].function.name).toBe('read');next=false;const last=await reply(server);expect(last.choices[0].message.tool_calls).toBeUndefined();expect(last.choices[0].message.content).toBe('本场景的真实工具流程已结束')}finally{await server.close()}
})
it('keeps the existing route demo unchanged without an explicit scenario',async()=>{
  const server=await startMockInferenceServer()
  try{const result=await reply(server);expect(result.choices[0].message.tool_calls[0].function.name).toBe('get_analysis_route')}finally{await server.close()}
})
// @ts-expect-error shared deterministic scientific demo is JavaScript
import { scientificRouteDemo } from '../../scripts/mock-route-scientific-case.mjs'
it('scientific demo resumes only the chosen Chinese presentation, and pause is not permission',()=>{
 const scene=scientificRouteDemo()
 const action='[analysis_route_action] '+JSON.stringify({routeId:'r',revision:1,stepId:'S2',action:'continue'})
 const messages:any[]=[{role:'user',content:action},{role:'assistant',tool_calls:[{id:'read',function:{name:'get_analysis_route'}},{id:'q',function:{name:'ask_user_question'}}]},{role:'tool',tool_call_id:'read',content:JSON.stringify({route:{routeId:'r',revision:1,steps:[]}})}]
 const withChoice=(selected:string)=>({tools:body.tools,messages:[...messages,{role:'tool',tool_call_id:'q',content:JSON.stringify({answers:[{id:'report_style',selected:[selected]}]})}]})
 expect(scene.toolCall({...withChoice('中文简报'),tools:[]})).toBeUndefined()
 expect(scene.toolCall(withChoice('先暂停'))).toBeUndefined()
 expect(scene.toolCall(withChoice('中文简报')).toolName).toBe('write')
})
it('does not let the delivery demo override an explicitly selected scenario',async()=>{
 const server=await startMockInferenceServer({scenario:{toolCall:()=>undefined,reply:()=> 'explicit delivery scenario'}})
 try{const result=await reply(server,{...body,messages:[{role:'user',content:'演示科研分析交付'}]});expect(result.choices[0].message.content).toBe('explicit delivery scenario')}finally{await server.close()}
})
