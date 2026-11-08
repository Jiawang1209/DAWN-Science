import {MAX_RESEARCH_REQUESTS} from '../src/evaluation/research-budget.js'
/** Loopback-only whole-experiment cap. No request/response bodies or credentials are logged. */
import {createServer} from 'node:http'
import {randomBytes} from 'node:crypto'
export interface EvaluationQuota {
 token:string
 stats:()=>{reserved:number;forwarded:number;denied:number;inFlight:number;limit:number}
 setRequestGuidance:(label:string)=>void
 partition:(limit:number)=>EvaluationQuota
 close:()=>Promise<void>
}
export async function startEvaluationGate(opts:{limit:number;timeoutMs?:number;forward:(body:Buffer,path:string,signal:AbortSignal)=>Promise<Response>}){
 if(!Number.isSafeInteger(opts.limit)||opts.limit<1||opts.limit>MAX_RESEARCH_REQUESTS)throw new Error('评测请求上限须为 1..300')
 const timeoutMs=opts.timeoutMs??90000
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>90000)throw new Error('评测请求超时须为 1..90000 毫秒')
 const token=randomBytes(24).toString('hex'),active=new Set<AbortController>()
 type Partition={limit:number;reserved:number;forwarded:number;denied:number;closed:boolean;active:Set<AbortController>;parent?:Partition;leased:number;guidance?:string}
 const partitions=new Map<string,Partition>();let leased=0
 const drained:{active:Set<AbortController>;resolve:()=>void}[]=[]
 const drain=(set:Set<AbortController>)=>set.size?new Promise<void>(resolve=>drained.push({active:set,resolve})):Promise.resolve()
 let reserved=0,forwarded=0,denied=0,closed=false
 const server=createServer(async(req,res)=>{
  const credential=req.headers.authorization?.replace(/^Bearer /,''),partition=credential?partitions.get(credential):undefined
  const lineage:Partition[]=[]
  for(let p=partition;p;p=p.parent)lineage.push(p)
  const owned=partition?!lineage.some(p=>p.closed)&&partition.leased===0:leased===0&&credential===token
  if(closed||req.method!=='POST'||!owned||!['/chat/completions','/responses','/messages'].includes(req.url??'')){res.writeHead(403).end('evaluation request refused');return}
  if(reserved>=opts.limit||lineage.some(p=>p.reserved>=p.limit)){denied++;for(const p of lineage)p.denied++;res.writeHead(429).end('evaluation request limit reached');return}
  // Reserve before the first await, including body receipt: parallel starts/retries cannot overspend.
  reserved++;for(const p of lineage)p.reserved++
  const requestNumber=partition?.reserved??reserved
  const controller=new AbortController();active.add(controller);for(const p of lineage)p.active.add(controller)
  const abortTransport=()=>{if(!req.complete)req.destroy();res.destroy()}
  controller.signal.addEventListener('abort',abortTransport,{once:true})
  const deadline=setTimeout(()=>{controller.abort();req.destroy()},timeoutMs);deadline.unref()
  res.on('close',()=>controller.abort())
  try{
   const chunks:Buffer[]=[];let bytes=0
   for await(const chunk of req){bytes+=chunk.length;if(bytes>4*1024*1024)throw new Error('oversized');chunks.push(Buffer.from(chunk))}
   if(controller.signal.aborted||closed)throw new Error('stopped')
   const body=Buffer.concat(chunks),forwardBody=partition?.guidance?requestBudgetBody(body,req.url!,{label:partition.guidance,requestNumber,limit:partition.limit,reserved:partition.reserved}):body
   forwarded++;for(const p of lineage)p.forwarded++
   const response=await opts.forward(forwardBody,req.url!,controller.signal)
   res.writeHead(response.status,{'content-type':response.headers.get('content-type')??'application/json'})
   if(response.body)for await(const chunk of response.body){if(controller.signal.aborted)break;if(!res.write(chunk))await new Promise<void>(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve()};res.once('drain',done);res.once('close',done)})}
   res.end()
  }catch{if(!res.headersSent)res.writeHead(controller.signal.aborted?503:502);res.end('evaluation upstream unavailable')}
  finally{clearTimeout(deadline);controller.signal.removeEventListener('abort',abortTransport);controller.abort();active.delete(controller);for(const p of lineage)p.active.delete(controller);for(let i=drained.length-1;i>=0;i--)if(!drained[i]!.active.size){drained[i]!.resolve();drained.splice(i,1)}}
 })
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
 const address=server.address();if(!address||typeof address==='string')throw new Error('评测监听失败')
 const partition=(limit:number,parent?:Partition):EvaluationQuota=>{
  if(closed||parent?.closed||!Number.isSafeInteger(limit)||limit<1||(parent?parent.leased:leased)+limit>(parent?.limit??opts.limit))throw new Error('partition quota exceeded')
  if(parent?parent.reserved>0:!leased&&reserved>0)throw new Error('cannot partition after unscoped requests')
  if(parent)parent.leased+=limit;else leased+=limit
  const key=randomBytes(24).toString('hex'),p:Partition={limit,reserved:0,forwarded:0,denied:0,closed:false,active:new Set(),leased:0,...(parent?{parent}:{})}
  partitions.set(key,p)
  return{token:key,setRequestGuidance:(label:string)=>{
   if(closed||p.closed)throw new Error('评测分区已关闭')
   if(p.reserved||p.leased)throw new Error('评测分区已开始或已划分，不能更改请求提示')
   if(typeof label!=='string'||!label.trim()||label.length>80||/[\r\n\u0000]/.test(label))throw new Error('评测请求提示标签无效')
   p.guidance=label.trim()
  },stats:()=>({reserved:p.reserved,forwarded:p.forwarded,denied:p.denied,inFlight:p.active.size,limit:p.limit}),partition:limit=>partition(limit,p),close:async()=>{p.closed=true;for(const c of p.active)c.abort();await drain(p.active)}}
 }
 return{url:`http://127.0.0.1:${address.port}`,token,partition:(limit:number)=>partition(limit),stats:()=>({reserved,forwarded,denied,inFlight:active.size,limit:opts.limit}),close:async()=>{
  closed=true;for(const c of active)c.abort();server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))
  await drain(active)
 }}
}

/** Per-request hint projected from the same admission counter. No body is retained or logged. */
function requestBudgetBody(body:Buffer,path:string,budget:{label:string;requestNumber:number;limit:number;reserved:number}):Buffer {
 const value:unknown=JSON.parse(body.toString())
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('评测请求正文无效')
 const request=value as Record<string,unknown>
 const note=`[evaluation_request_budget] ${budget.label}：本次为本分区第 ${budget.requestNumber} 次，最多 ${budget.limit} 次；当前已预占 ${budget.reserved} 次，本次之后最多还能接纳 ${Math.max(0,budget.limit-budget.reserved)} 次（并发调用也会预占）。这是请求网关额度，不是 token 或产品执行轮次。预算不会自动追加；任务证据满足后及时正式提交，未解决问题如实阻塞。`
 if(path==='/chat/completions'){
  if(!Array.isArray(request.messages))throw new Error('评测 chat messages 无效')
  const messages=request.messages as Record<string,unknown>[],index=messages.findIndex(message=>message?.role==='system')
  if(index<0)request.messages=[{role:'system',content:note},...messages]
  else{
   const system=messages[index]!,content=system.content
   if(typeof content!=='string'&&!Array.isArray(content))throw new Error('评测 system content 无效')
   request.messages=messages.map((message,i)=>i===index?{...message,content:typeof content==='string'?content+'\n\n'+note:[...content,{type:'text',text:note}]}:message)
  }
 }else if(path==='/responses'){
  if(request.instructions!==undefined&&typeof request.instructions!=='string')throw new Error('评测 instructions 无效')
  request.instructions=[request.instructions,note].filter(Boolean).join('\n\n')
 }else{
  if(Array.isArray(request.system))request.system=[...request.system,{type:'text',text:note}]
  else if(request.system===undefined||typeof request.system==='string')request.system=[request.system,note].filter(Boolean).join('\n\n')
  else throw new Error('评测 system 无效')
 }
 return Buffer.from(JSON.stringify(request))
}
