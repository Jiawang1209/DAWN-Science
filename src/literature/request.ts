import {LiteratureError,type LiteratureClientOptions,type LiteratureSource} from './model.js'

/** Read JSON with the same cancellation, byte and timeout bounds for both sources. */
export async function requestJson(source: LiteratureSource, url: URL, options: LiteratureClientOptions, signal?: AbortSignal, allowMissing=false): Promise<unknown> {
  const fail=(code: ConstructorParameters<typeof LiteratureError>[0],message:string):never=>{throw new LiteratureError(code,message)}
  if(signal?.aborted)return fail('cancelled','文献查询已取消')
  const timeout=AbortSignal.timeout(options.timeoutMs??20_000),combined=signal?AbortSignal.any([signal,timeout]):timeout
  let reader: ReadableStreamDefaultReader<Uint8Array>|undefined
  let body: ReadableStream<Uint8Array>|null=null
  try {
    const response=await (options.fetch??globalThis.fetch)(url,{signal:combined,redirect:'error',headers:{accept:'application/json','user-agent':'DAWN-Science/Literature'}})
    body=response.body
    if(combined.aborted)throw Error('aborted')
    if(allowMissing&&response.status===404)return null
    if(response.status===429)return fail('rate_limited',`${source} 请求过于频繁或匿名额度已用尽，请稍后重试`)
    if(response.status===401||response.status===403)return fail('access_denied',`${source} 拒绝访问，请检查服务的访问条件`)
    if(!response.ok)return fail('service_error',`${source} 服务请求失败（HTTP ${response.status}）`)
    const max=options.maxBytes??2*1024*1024
    if(Number(response.headers.get('content-length'))>max)return fail('response_too_large',`${source} 响应超过读取预算，请减少查询数量`)
    reader=body?.getReader()
    if(!reader)return fail('invalid_response',`${source} 返回了空响应`)
    const chunks: Uint8Array[]=[]
    let size=0
    for(;;){
      if(combined.aborted)throw Error('aborted')
      const chunk=await reader.read()
      if(chunk.done)break
      size+=chunk.value.byteLength
      if(size>max)return fail('response_too_large',`${source} 响应超过读取预算，请减少查询数量`)
      chunks.push(chunk.value)
    }
    const all=new Uint8Array(size)
    let offset=0
    for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all))}
    catch{return fail('invalid_response',`${source} 返回的内容不是有效 JSON`)}
  } catch(error) {
    if(signal?.aborted)return fail('cancelled','文献查询已取消')
    if(timeout.aborted)return fail('timeout',`${source} 查询超时，请稍后重试`)
    if(error instanceof LiteratureError)throw error
    return fail('network_error',`无法连接 ${source}，请检查网络后重试`)
  } finally {
    if(reader){await reader.cancel().catch(()=>{});reader.releaseLock()}
    else await body?.cancel().catch(()=>{})
  }
}

export type RequestScheduler=(task:()=>Promise<unknown>,signal?:AbortSignal)=>Promise<unknown>
function abortable(promise:Promise<unknown>,signal?:AbortSignal):Promise<unknown> {
  if(signal?.aborted)return Promise.reject(new LiteratureError('cancelled','文献查询已取消'))
  if(!signal)return promise
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(new LiteratureError('cancelled','文献查询已取消'))}
    const cleanup=()=>signal.removeEventListener('abort',abort)
    signal.addEventListener('abort',abort,{once:true})
    promise.then(value=>{cleanup();resolve(value)},error=>{cleanup();reject(error)})
  })
}
/** One queue per provider process; a cancelled waiter never releases another active slot. */
export function serialRequests(intervalMs:number):RequestScheduler {
  let tail=Promise.resolve(),nextStart=0
  return async(task,signal)=>{
    if(signal?.aborted)throw new LiteratureError('cancelled','文献查询已取消')
    const previous=tail
    let release!:()=>void
    const slot=new Promise<void>(resolve=>release=resolve)
    tail=previous.then(()=>slot)
    let timer:ReturnType<typeof setTimeout>|undefined
    try {
      await abortable(previous,signal)
      const delay=Math.max(0,nextStart-Date.now())
      if(delay)await abortable(new Promise(resolve=>timer=setTimeout(resolve,delay)),signal)
      if(signal?.aborted)throw new LiteratureError('cancelled','文献查询已取消')
      nextStart=Date.now()+intervalMs
      return await task()
    } finally {if(timer)clearTimeout(timer);release()}
  }
}
