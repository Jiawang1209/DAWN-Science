/** Shared dev:mock / Electron demonstration, driven only by explicit demo wording. */
export function evidenceHandoffTool(body){
 const messages=body.messages??[],text=v=>typeof v==='string'?v:Array.isArray(v)?v.map(b=>b.text??'').join(''):''
 const latest=messages.findLast(m=>m.role==='user')
 if(!text(latest?.content).includes('演示证据交接'))return
 const names=new Set((body.tools??[]).map(t=>t.function?.name??t.name))
 if(!names.has('subagent_context_sources')||!names.has('subagent'))return
 const calls=messages.slice(messages.lastIndexOf(latest)+1).flatMap(m=>m.role==='assistant'?m.tool_calls??[]:[])
 const source=calls.findLast(c=>c.function?.name==='subagent_context_sources')
 if(!source)return{toolName:'subagent_context_sources',args:{}}
 if(calls.some(c=>c.function?.name==='subagent'))return
 const response=messages.findLast(m=>m.role==='tool'&&m.tool_call_id===source.id)
 let catalog;try{catalog=JSON.parse(text(response?.content))}catch{return}
 const early=catalog.messages.find(m=>m.preview.includes('早期约束'))??catalog.messages[0]
 if(early)return{toolName:'subagent',args:{agent:'scout',task:'只读报告收到的早期方法和单位要求。不要读取或执行无关文件。',handoff:{recentMessages:1,messageIds:[early.id],...(catalog.route?.steps?.[0]?{routeStepId:catalog.route.steps[0].id}:{})}}}
}
