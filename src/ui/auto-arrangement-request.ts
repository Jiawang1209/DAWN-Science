import {t} from './i18n/index.js'
import {autoArrangementPrompt} from '../protocol/task-arrangement.js'
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
   const prompt=autoArrangementPrompt(task,adjustment)
   await opts.send(owner,prompt)
  }finally{pending.delete(owner)}
 }
}
