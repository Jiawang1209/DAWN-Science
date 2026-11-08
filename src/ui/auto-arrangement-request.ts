import {t} from './i18n/index.js'
import {autoArrangementRequestPrefix} from '../protocol/task-arrangement.js'
export async function stopAutoArrangement(opts:{input:()=>string|undefined;isCurrent:()=>boolean;running:()=>boolean;read:()=>Promise<{planning:boolean}>;abort:()=>Promise<void>;acknowledge:(input:string)=>void}){
 if(!opts.isCurrent())return
 const input=opts.input(),state=await opts.read()
 if(!opts.isCurrent()||opts.input()!==input||!state.planning||!opts.running())return
 await opts.abort()
 if(input&&opts.isCurrent()&&opts.input()===input)opts.acknowledge(input)
}
export function createAutoArrangementRequester(opts:{read:(owner:string)=>Promise<{planning:boolean}>;acquire:(owner:string)=>Promise<unknown>;enable:(owner:string)=>Promise<unknown>;send:(owner:string,text:string)=>Promise<unknown>;running:(owner:string)=>boolean}){
 const pending=new Set<string>()
 return async(owner:string,task:string,adjustment:string,signal:AbortSignal,isCurrent:()=>boolean)=>{
  const check=()=>{if(signal.aborted||!isCurrent())throw Error(t("会话已切换或规划已取消，未发送到其他会话。"));if(opts.running(owner))throw Error(t("会话当前有任务运行，请等待完成或停止后再安排。"))}
  if(!task.trim()||task.length>16000||adjustment.length>4000)throw Error(t("请提供有效的任务目标。"))
  if(pending.has(owner))throw Error(t("本会话的规划请求正在提交。"))
  check();pending.add(owner)
  try{
   await opts.read(owner);check() // Existing operation checks runtime support before changing anything.
   await opts.acquire(owner);check()
   await opts.enable(owner);check() // Keep read-only on failure; never silently downgrade permissions.
   const prompt=[autoArrangementRequestPrefix+'先只读理解目标、数据和已有会话约束，再用 propose_plan 的 arrangement 提交任务划分、分工、输入输出、依赖、验收与理由。',
    '任务数量是方案结果，由实际任务决定；简单任务可以一块，不能固定拆成三块，也不要让用户预填数字。并行仅用于独立任务且不能共写；用户要求独立审阅时必须保留不同执行角色的审阅任务。缺信息放入 questions，不编造数据或启动执行。',
    '任务目标：\n'+task.trim(),adjustment.trim()?'调整要求：\n'+adjustment.trim():'',
    '原有冻结契约、证据、产物版本、预算、产物锁和恢复要求继续适用。请交可调整的方案，等待用户采纳；这次只规划，不写科研产物、不派子 Agent。'].filter(Boolean).join('\n\n')
   await opts.send(owner,prompt)
  }finally{pending.delete(owner)}
 }
}
