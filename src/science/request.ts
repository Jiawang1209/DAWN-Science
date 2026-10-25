import {ScienceError,type ScienceOptions,type ScienceSource} from './model.js'

/** Both JSON and plain metadata have the same byte, timeout and cancellation limits. */
export async function scienceRequest(source:ScienceSource,url:URL,options:ScienceOptions={},signal?:AbortSignal,format:'json'|'text'='json'):Promise<unknown> {
  if(signal?.aborted)throw new ScienceError('cancelled','科研查询已取消')
  const timeout=AbortSignal.timeout(options.timeoutMs??20000),combined=signal?AbortSignal.any([signal,timeout]):timeout
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,body:ReadableStream<Uint8Array>|null=null
  try {
    const response=await(options.fetch??globalThis.fetch)(url,{signal:combined,redirect:'error',headers:{accept:format==='json'?'application/json':'text/plain','user-agent':'DAWN-Science/Research-Data'}})
    body=response.body
    if(combined.aborted)throw Error('aborted')
    if(response.status===429)throw new ScienceError('rate_limited',`${source} 请求过于频繁，请稍后重试`)
    if(response.status===401||response.status===403)throw new ScienceError('access_denied',`${source} 拒绝访问，请检查公开访问条件`)
    if(!response.ok)throw new ScienceError('service_error',`${source} 服务请求失败（HTTP ${response.status}）`)
    const max=options.maxBytes??2*1024*1024
    if(Number(response.headers.get('content-length'))>max)throw new ScienceError('response_too_large',`${source} 响应超过读取预算，请缩小查询范围`)
    reader=body?.getReader()
    if(!reader)throw new ScienceError('invalid_response',`${source} 返回空响应`)
    const chunks:Uint8Array[]=[];let size=0
    for(;;){
      if(combined.aborted)throw Error('aborted')
      const chunk=await reader.read();if(chunk.done)break
      size+=chunk.value.byteLength
      if(size>max)throw new ScienceError('response_too_large',`${source} 响应超过读取预算，请缩小查询范围`)
      chunks.push(chunk.value)
    }
    if(combined.aborted)throw Error('aborted')
    const all=new Uint8Array(size);let offset=0
    for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}
    try{const value=new TextDecoder('utf-8',{fatal:true}).decode(all);return format==='json'?JSON.parse(value):value}
    catch{throw new ScienceError('invalid_response',`${source} 返回的 ${format==='json'?'JSON':'文本'} 格式无效`)}
  } catch(error){
    if(signal?.aborted)throw new ScienceError('cancelled','科研查询已取消')
    if(timeout.aborted)throw new ScienceError('timeout',`${source} 查询超时，请稍后重试`)
    if(error instanceof ScienceError)throw error
    throw new ScienceError('network_error',`无法连接 ${source}，请检查网络后重试`)
  } finally {
    if(reader){await reader.cancel().catch(()=>{});reader.releaseLock()}
    else await body?.cancel().catch(()=>{})
  }
}
