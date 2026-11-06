/** Shared dev:mock/Electron demo. Budget writes still use the real UI IPC. */
export function budgetDelegationTool(body){
 const last=body.messages?.at(-1)
 const content=typeof last?.content==='string'?last.content:Array.isArray(last?.content)?last.content.map(block=>block.text??'').join(''):''
 if(last?.role!=='user'||!content.includes('演示委派预算'))return
 if(!body.tools?.some(tool=>(tool.function?.name??tool.name)==='subagent'))return
 return{toolName:'subagent',args:{agent:'scout',task:'只读检查当前工作区，用一句话报告完成。'}}
}
