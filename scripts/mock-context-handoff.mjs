/** Shared dev/evaluation fixture: only inference decisions are deterministic. */
export const CONTEXT_FACTS='UNIT=m;METHOD=arithmetic mean;PROTECT=original;'
export const CONTEXT_RESULT={n:5,mean:3,unit:'m',method:'arithmetic mean',preserveInput:true}
export function contextHandoffScenario(){
 const text=v=>typeof v==='string'?v:Array.isArray(v)?v.map(b=>b.text??'').join(''):''
 function choose(body){
  const ms=body.messages??[],calls=ms.flatMap(m=>m.role==='assistant'?m.tool_calls??[]:[])
  const reads=calls.filter(c=>c.function?.name==='read').map(c=>{try{return JSON.parse(c.function.arguments).path}catch{return undefined}})
  if(!reads.includes('in.csv'))return{toolName:'read',args:{path:'in.csv'}}
  const facts=ms.some(m=>['user','tool'].includes(m.role)&&text(m.content).includes(CONTEXT_FACTS))
  if(!facts&&!reads.includes('context.txt'))return{toolName:'read',args:{path:'context.txt'}}
  return undefined
 }
 return{toolCall:choose,reply:body=>{
  if(choose(body))return '读取已授权的输入与背景。'
  const facts=(body.messages??[]).some(m=>['user','tool'].includes(m.role)&&text(m.content).includes(CONTEXT_FACTS))
  return facts?JSON.stringify(CONTEXT_RESULT):'blocked: approved context missing'
 }}
}
