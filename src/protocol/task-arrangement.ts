/** Model-proposed task structure encoded in the existing plan Markdown, never execution state. */
import {z} from 'zod'
import {WorkspaceRelativePathSchema} from './analysis-route.js'
import {TaskContractSchema} from './task-contract.js'
export const autoArrangementRequestPrefix='请为以下具体任务自动安排。'
/** Shared planning request for the UI and isolated scenario evaluation. No execution authority. */
export function autoArrangementPrompt(task:string,adjustment=''):string {
 return[autoArrangementRequestPrefix+'先只读理解目标、数据和已有会话约束，再用 propose_plan 的 arrangement 提交任务划分、分工、输入输出、依赖、验收与理由。',
  '任务数量是方案结果，由实际任务决定；简单单结果任务优先一个任务块，不能固定拆成三块，也不要让用户预填数字。只有依赖、独立输入、权限边界或明确审阅要求才增加分工；请在理由里解释额外分工的实际作用。并行仅用于独立任务且不能共写；用户要求独立审阅时必须保留不同执行角色的审阅任务。缺信息放入 questions，不编造数据或启动执行。',
  '任务目标：\n'+task.trim(),adjustment.trim()?'调整要求：\n'+adjustment.trim():'',
  '原有冻结契约、证据、产物版本、预算、产物锁和恢复要求继续适用。请交可调整的方案，等待用户采纳；这次只规划，不写科研产物、不派子 Agent。'].filter(Boolean).join('\n\n')
}

const line=z.string().trim().min(1).max(2000).refine(s=>!/[\r\n\u0000]/.test(s),'字段必须是单行文本')
const id=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
const path=WorkspaceRelativePathSchema.pipe(line).refine(s=>s.length<=512)
const task=z.object({id,title:line,goal:line,role:line,inputs:z.array(path).max(24),outputs:z.array(path).max(24),dependencies:z.array(id).max(12),acceptance:line,review:z.boolean(),execution:z.object({agent:line,contract:TaskContractSchema}).strict().optional()}).strict()
export const TaskArrangementSchema=z.object({dispatch:z.literal('team-v1').optional(),mode:z.enum(['single','parallel','chain','science']),rationale:line,independentReview:z.boolean(),tasks:z.array(task).min(1).max(12),questions:z.array(line).max(12)}).strict().superRefine((p,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message})
 if(p.dispatch&&p.tasks.some(t=>!t.execution))fail('可执行安排必须为每个任务声明执行者与契约')
 if(!p.dispatch&&p.tasks.some(t=>t.execution))fail('执行信息需要显式的可执行安排版本')
 if((p.mode==='science'||p.tasks.some(t=>t.review))&&!p.independentReview)fail('独立审阅标记与任务安排不一致')
 const ids=new Set(p.tasks.map(t=>t.id));if(ids.size!==p.tasks.length)fail('任务 ID 重复')
 for(const t of p.tasks){
  if(new Set(t.dependencies).size!==t.dependencies.length)fail('任务依赖重复')
  if(t.dependencies.some(d=>!ids.has(d)))fail('任务依赖不存在')
 }
 const seen=new Set<string>();for(let i=0;i<p.tasks.length;i++)for(const t of p.tasks)if(t.dependencies.every(d=>seen.has(d)))seen.add(t.id)
 if(seen.size!==ids.size)fail('任务依赖存在环或缺失节点')
 if(p.mode==='single'&&p.tasks.length!==1)fail('单任务方式只能包含一个任务块')
 if(p.mode==='parallel'){
  if(p.tasks.some(t=>t.dependencies.length))fail('并行任务不能包含前后依赖')
  const outputs=p.tasks.flatMap(t=>t.outputs);if(new Set(outputs).size!==outputs.length)fail('并行任务不能共用写入目标')
 }
 if(p.independentReview||p.mode==='science'){
  const workers=p.tasks.filter(t=>!t.review),reviews=p.tasks.filter(t=>t.review)
  if(!workers.length||!reviews.length)fail('独立审阅需要执行任务和单独的审阅任务')
  if(reviews.some(t=>workers.some(w=>w.role===t.role)))fail('审阅分工不能与执行角色相同')
  if(reviews.some(t=>!t.dependencies.length))fail('独立审阅必须依赖待审结果')
 }
})
/** Input-only host references are expanded before the ordinary arrangement is persisted. */
export const TaskArrangementInputSchema=z.object({...TaskArrangementSchema.shape,tasks:z.array(task.extend({execution:z.object({agent:line,contract:TaskContractSchema.optional(),contractRef:z.string().max(160).optional()}).strict().refine(e=>!!e.contract!==!!e.contractRef,'执行契约和引用必须且只能提供一个').optional()})).min(1).max(12)}).strict()
export type TaskArrangementInput=z.infer<typeof TaskArrangementInputSchema>
export type TaskArrangement=z.infer<typeof TaskArrangementSchema>
export const arrangementHeading='## 任务安排（自动安排）'
const modes={single:'单任务',parallel:'并行委派',chain:'串行交接',science:'科研流水线'} as const
/** Canonical readable fields are persisted with the original plan and its approval fingerprint. */
export function serializeTaskArrangement(input:TaskArrangement):string{
 const p=TaskArrangementSchema.parse(input)
 return[arrangementHeading,`执行方式：${modes[p.mode]}`,`安排理由：${p.rationale}`,`保留独立审阅：${p.independentReview||p.mode==='science'?'是':'否'}`,...(p.dispatch?[`执行绑定：${p.dispatch}`]:[]),
 ...p.questions.map(q=>`待确认：${q}`),
 ...p.tasks.flatMap(t=>['',`### ${t.id} · ${t.title}`,`- 目标：${t.goal}`,`- 分工：${t.role}`,...t.inputs.map(x=>`- 输入：${x}`),...t.outputs.map(x=>`- 输出：${x}`),...t.dependencies.map(x=>`- 依赖：${x}`),`- 验收：${t.acceptance}`,`- 独立审阅：${t.review?'是':'否'}`,...(t.execution?[`- 执行者：${t.execution.agent}`,`- 执行契约：${JSON.stringify(t.execution.contract)}`]:[])])].join('\n')
}
export type ArrangementRead={state:'absent'}|{state:'invalid';reason:string}|{state:'valid';arrangement:TaskArrangement;start:number;end:number}
/** Parsing displays/validates an existing proposal; it does not decide task semantics. */
export function parseTaskArrangement(markdown:string):ArrangementRead{
 const lines=markdown.split(/\r?\n/),structural=new Set<number>()
 let fence:{char:string;width:number}|undefined
 for(let i=0;i<lines.length;i++){
  const l=lines[i]!
  if(fence){if(new RegExp('^ {0,3}'+fence.char+'{'+fence.width+',}\\s*$').test(l))fence=undefined;continue}
  const opening=/^ {0,3}(`{3,})([^`]*$)|^ {0,3}(~{3,})(.*)$/.exec(l)
  if(opening){const marker=opening[1]??opening[3]!;fence={char:marker[0]!,width:marker.length};continue}
  if(/^(?: {4}|\t)/.test(l))continue
  structural.add(i)
 }
 const starts=lines.flatMap((l,i)=>structural.has(i)&&l.trim()===arrangementHeading?[i]:[])
 if(!starts.length)return{state:'absent'}
 if(starts.length!==1)return{state:'invalid',reason:'任务安排节重复'}
 const start=starts[0]!,next=lines.findIndex((l,i)=>i>start&&structural.has(i)&&/^ {0,3}##\s/.test(l)),end=next<0?lines.length:next
 try{
  const fields:Record<string,unknown>={tasks:[],questions:[]},tasks=fields.tasks as Record<string,unknown>[],questions=fields.questions as string[]
  let current:Record<string,unknown>|undefined
  const put=(target:Record<string,unknown>,key:string,value:unknown)=>{if(key in target)throw new Error('字段重复：'+key);target[key]=value}
  const bool=(s:string)=>{if(s!=='是'&&s!=='否')throw new Error('是否字段必须为是或否');return s==='是'}
  for(const raw of lines.slice(start+1,end)){
   const l=raw.trim();if(!l)continue
   const heading=/^### ([A-Za-z][A-Za-z0-9_-]{0,63}) · (.+)$/.exec(l)
   if(heading){current={id:heading[1],title:heading[2],inputs:[],outputs:[],dependencies:[]};tasks.push(current);continue}
   if(!current){
    if(l.startsWith('执行方式：')){const value=l.slice(5),mode=Object.entries(modes).find(([,name])=>name===value)?.[0];if(!mode)throw new Error('执行方式无效');put(fields,'mode',mode)}
    else if(l.startsWith('安排理由：'))put(fields,'rationale',l.slice(5))
    else if(l.startsWith('保留独立审阅：'))put(fields,'independentReview',bool(l.slice(7)))
    else if(l.startsWith('执行绑定：'))put(fields,'dispatch',l.slice(5))
    else if(l.startsWith('待确认：'))questions.push(l.slice(4))
    else throw new Error('无法识别安排字段')
   }else{
    if(l.startsWith('- 执行者：')){put(current,'agent',l.slice(6));continue}
    if(l.startsWith('- 执行契约：')){put(current,'contract',JSON.parse(l.slice(7)));continue}
    const m=/^- (目标|分工|输入|输出|依赖|验收|独立审阅)：(.*)$/.exec(l);if(!m)throw new Error('无法识别任务字段')
    const keys:Record<string,string>={'目标':'goal','分工':'role','输入':'inputs','输出':'outputs','依赖':'dependencies','验收':'acceptance','独立审阅':'review'},key=keys[m[1]!]!,value=m[2]!
    if(['inputs','outputs','dependencies'].includes(key))(current[key] as string[]).push(value)
    else put(current,key,key==='review'?bool(value):value)
   }
  }
  for(const task of tasks)if('agent' in task||'contract' in task){task.execution={agent:task.agent,contract:task.contract};delete task.agent;delete task.contract}
  const parsed=TaskArrangementSchema.safeParse(fields)
  if(!parsed.success)return{state:'invalid',reason:parsed.error.issues.map(i=>i.message).join('；')}
  return{state:'valid',arrangement:parsed.data,start,end}
 }catch(error){return{state:'invalid',reason:error instanceof Error?error.message:String(error)}}
}
export function validateArrangementEdit(original:string,edited:string):void{
 const before=parseTaskArrangement(original),after=parseTaskArrangement(edited)
 if(before.state==='valid'&&after.state!=='valid')throw new Error('请保留有效的任务安排；可修改任务内容、分工和依赖后再采纳')
 if(after.state==='invalid')throw new Error('任务安排无效：'+after.reason)
 if(before.state==='valid'&&before.arrangement.dispatch&&after.state==='valid'&&!after.arrangement.dispatch)throw new Error('不能通过编辑删除已声明的执行绑定')
 if(before.state==='valid'&&before.arrangement.independentReview&&after.state==='valid'&&!after.arrangement.independentReview)throw new Error('不能通过修改方案取消原有独立审阅要求')
 if(after.state==='valid'&&after.arrangement.questions.length)throw new Error('请先补齐待确认项，再更新并采纳任务安排')
}
export function withoutTaskArrangement(markdown:string,read:ArrangementRead):string{
 if(read.state!=='valid')return markdown
 const lines=markdown.split(/\r?\n/);return[...lines.slice(0,read.start),...lines.slice(read.end)].join('\n')
}
