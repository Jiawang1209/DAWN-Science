/** Loopback-only whole-experiment cap. No request/response bodies or credentials are logged. */
import {createServer} from 'node:http'
import {randomBytes} from 'node:crypto'
export async function startEvaluationGate(opts:{limit:number;timeoutMs?:number;forward:(body:Buffer,path:string,signal:AbortSignal)=>Promise<Response>}){
 if(!Number.isSafeInteger(opts.limit)||opts.limit<1||opts.limit>30)throw new Error('评测请求上限须为 1..30')
 const timeoutMs=opts.timeoutMs??90000
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>90000)throw new Error('评测请求超时须为 1..90000 毫秒')
 const token=randomBytes(24).toString('hex'),active=new Set<AbortController>()
 type Partition={limit:number;reserved:number;forwarded:number;denied:number;closed:boolean;active:Set<AbortController>}
 const partitions=new Map<string,Partition>();let leased=0
 const drained:{active:Set<AbortController>;resolve:()=>void}[]=[]
 const drain=(set:Set<AbortController>)=>set.size?new Promise<void>(resolve=>drained.push({active:set,resolve})):Promise.resolve()
 let reserved=0,forwarded=0,denied=0,closed=false
 const server=createServer(async(req,res)=>{
  const credential=req.headers.authorization?.replace(/^Bearer /,''),partition=credential?partitions.get(credential):undefined
  const owned=partition?!partition.closed:leased===0&&credential===token
  if(closed||req.method!=='POST'||!owned||!['/chat/completions','/responses','/messages'].includes(req.url??'')){res.writeHead(403).end('evaluation request refused');return}
  if(reserved>=opts.limit||partition&&partition.reserved>=partition.limit){denied++;if(partition)partition.denied++;res.writeHead(429).end('evaluation request limit reached');return}
  // Reserve before the first await, including body receipt: parallel starts/retries cannot overspend.
  reserved++;if(partition)partition.reserved++
  const controller=new AbortController();active.add(controller);partition?.active.add(controller)
  controller.signal.addEventListener('abort',()=>{if(!req.complete)req.destroy()},{once:true})
  const deadline=setTimeout(()=>{controller.abort();req.destroy()},timeoutMs);deadline.unref()
  res.on('close',()=>controller.abort())
  try{
   const chunks:Buffer[]=[];let bytes=0
   for await(const chunk of req){bytes+=chunk.length;if(bytes>4*1024*1024)throw new Error('oversized');chunks.push(Buffer.from(chunk))}
   if(controller.signal.aborted||closed)throw new Error('stopped')
   forwarded++;if(partition)partition.forwarded++
   const response=await opts.forward(Buffer.concat(chunks),req.url!,controller.signal)
   res.writeHead(response.status,{'content-type':response.headers.get('content-type')??'application/json'})
   if(response.body)for await(const chunk of response.body){if(controller.signal.aborted)break;if(!res.write(chunk))await new Promise<void>(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve()};res.once('drain',done);res.once('close',done)})}
   res.end()
  }catch{if(!res.headersSent)res.writeHead(controller.signal.aborted?503:502);res.end('evaluation upstream unavailable')}
  finally{clearTimeout(deadline);controller.abort();active.delete(controller);partition?.active.delete(controller);for(let i=drained.length-1;i>=0;i--)if(!drained[i]!.active.size){drained[i]!.resolve();drained.splice(i,1)}}
 })
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
 const address=server.address();if(!address||typeof address==='string')throw new Error('评测监听失败')
 return{url:`http://127.0.0.1:${address.port}`,token,partition:(limit:number)=>{
  if(closed||!Number.isSafeInteger(limit)||limit<1||leased+limit>opts.limit)throw new Error('partition quota exceeded')
  if(!leased&&reserved)throw new Error('cannot partition after unscoped requests')
  leased+=limit;const key=randomBytes(24).toString('hex'),p:Partition={limit,reserved:0,forwarded:0,denied:0,closed:false,active:new Set()}
  partitions.set(key,p)
  return{token:key,stats:()=>({reserved:p.reserved,forwarded:p.forwarded,denied:p.denied,inFlight:p.active.size,limit:p.limit}),close:async()=>{p.closed=true;for(const c of p.active)c.abort();await drain(p.active)}}
 },stats:()=>({reserved,forwarded,denied,inFlight:active.size,limit:opts.limit}),close:async()=>{
  closed=true;for(const c of active)c.abort();server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))
  await drain(active)
 }}
}
