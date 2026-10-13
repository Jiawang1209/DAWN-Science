import {团队上限} from "../team/types.js"
import type {EventSink} from "../runtime/types.js"
/** Await the managed NativeRuntime's whole prompt, never a single model response. */
export function runBotTurn(opts: {
 sessionId:string;signal:AbortSignal;attach(sink:EventSink):()=>void;
 write():void;abort():Promise<void>;timeoutMs?:number
}):Promise<{ok:boolean;output:string;error?:string}> {
 return new Promise(resolve=>{
  let output="",outputBytes=0,overflow=false,error:string|undefined,settled=false,detach=()=>{}
  const finish=()=>{if(settled)return;settled=true;clearTimeout(timer);detach();opts.signal.removeEventListener("abort",cancel);resolve(error?{ok:false,output,error}:{ok:true,output})}
  const cancel=()=>{error="任务已停止";void opts.abort().catch(e=>{error=String(e)}).finally(finish)}
  const timer=setTimeout(()=>{error="Bot 任务执行超时";void opts.abort().catch(e=>{error=`Bot 任务执行超时；停止失败：${String(e)}`}).finally(finish)},opts.timeoutMs??30*60_000)
  timer.unref?.()
  detach=opts.attach(e=>{
   if(e.sessionId!==opts.sessionId)return
   if(settled)return
   if(e.kind==="output"&&!overflow){
    const bytes=outputBytes+Buffer.byteLength(e.data,"utf8")
    if(bytes>团队上限.maxOutputBytes){
     overflow=true;output="";error=`Bot 输出超过 64 KiB 上限（已收到 ${bytes} 字节）；省略全部输出，未返回截断的回复或产物列表。`
     void opts.abort().catch(e=>{error+=` 停止失败：${String(e)}`}).finally(finish)
    }else{output+=e.data;outputBytes=bytes}
   }
   if(e.kind==="notice"&&e.failed&&!overflow)error=e.text
   if(e.kind==="exited"){error=error??"Bot 会话已退出";finish()}
   if(e.kind==="idle")finish()
  })
  opts.signal.addEventListener("abort",cancel,{once:true})
  if(opts.signal.aborted){cancel();return}
  try{opts.write()}catch(e){error=e instanceof Error?e.message:String(e);finish()}
 })
}
