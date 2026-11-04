import {团队上限} from "../team/types.js"
import type {EventSink} from "../runtime/types.js"
/** Await the managed NativeRuntime's whole prompt, never a single model response. */
export function runBotTurn(opts: {
 sessionId:string;signal:AbortSignal;attach(sink:EventSink):()=>void;
 finalText?:()=>string|undefined;
 write():void;abort():Promise<void>;timeoutMs?:number
}):Promise<{ok:boolean;output:string;error?:string}> {
 return new Promise(resolve=>{
  let output="",outputBytes=0,overflow=false,error:string|undefined,settled=false,stopping=false,detach=()=>{}
  const finish=()=>{
   if(settled)return
   settled=true;clearTimeout(timer);detach();opts.signal.removeEventListener("abort",cancel)
   if(!error&&opts.finalText){
    try{output=opts.finalText()??'';if(Buffer.byteLength(output,'utf8')>团队上限.maxOutputBytes){output='';error='Bot 最终回复超过 64 KiB 上限；未接收截断的回复或产物列表。'}}
    catch(e){output='';error=`Bot 最终回复无法读取：${String(e)}`}
   }
   resolve(error?{ok:false,output,error}:{ok:true,output})
  }
  const stop=(reason:string)=>{
   if(settled||stopping)return
   stopping=true;error=reason;clearTimeout(timer);opts.signal.removeEventListener('abort',cancel)
   // idle/exited may be emitted synchronously by abort. They do not prove that
   // its pending cleanup has drained; retain execution ownership until it does.
   let cleanup:Promise<void>
   try{cleanup=opts.abort()}catch(e){cleanup=Promise.reject(e)}
   void cleanup.catch(e=>{error=`${reason}；停止失败：${String(e)}`}).finally(finish)
  }
  const cancel=()=>stop('任务已停止')
  const timer=setTimeout(()=>stop('Bot 任务执行超时'),opts.timeoutMs??30*60_000)
  timer.unref?.()
  detach=opts.attach(e=>{
   if(e.sessionId!==opts.sessionId)return
   if(settled)return
   if(e.kind==="output"&&!overflow&&!stopping){
    const bytes=outputBytes+Buffer.byteLength(e.data,"utf8")
    if(bytes>团队上限.maxOutputBytes){
     overflow=true;output=""
     stop(`Bot 输出超过 64 KiB 上限（已收到 ${bytes} 字节）；省略全部输出，未返回截断的回复或产物列表。`)
    }else{output+=e.data;outputBytes=bytes}
   }
   if(e.kind==="notice"&&e.failed&&!overflow&&!stopping)error=e.text
   if(e.kind==="exited"&&!stopping){error=error??"Bot 会话已退出";finish()}
   if(e.kind==="idle"&&!stopping)finish()
  })
  opts.signal.addEventListener("abort",cancel,{once:true})
  if(opts.signal.aborted){cancel();return}
  try{opts.write()}catch(e){error=e instanceof Error?e.message:String(e);finish()}
 })
}
