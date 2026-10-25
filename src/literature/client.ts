/** Bounded OpenAlex metadata access. No model-generated citation fields enter here. */
export type LiteratureErrorCode = 'invalid_input' | 'invalid_response' | 'source_mismatch' | 'rate_limited' | 'access_denied' | 'service_error' | 'response_too_large' | 'cancelled' | 'timeout' | 'network_error'
export class LiteratureError extends Error {
  constructor(readonly code: LiteratureErrorCode, message: string) { super(message); this.name = 'LiteratureError' }
}
export interface LiteratureRecord {
  id: string; title: string; authors: string[]; authorsTruncated: boolean
  year: number | null; date: string | null; journal: string | null; doi: string | null
  abstract: string | null; abstractStatus: 'available' | 'missing' | 'invalid' | 'truncated'
  sourceUrl: string; landingPageUrl: string | null
}
export interface LiteratureReport {
  source: 'OpenAlex'; retrievedAt: string; requestUrl: string
  query: { kind: 'search' | 'doi'; value: string; fromYear?: number; toYear?: number; limit: number }
  total: number; returned: number; records: LiteratureRecord[]; warnings: string[]
}
export interface LiteratureSearch { query: string; fromYear?: number | undefined; toYear?: number | undefined; limit?: number | undefined }
export interface OpenAlexOptions { fetch?: typeof fetch; now?: () => Date; timeoutMs?: number; maxBytes?: number }
const fields = 'id,doi,title,publication_year,publication_date,authorships,primary_location,abstract_inverted_index'
const fail = (code: LiteratureErrorCode, message: string): never => { throw new LiteratureError(code, message) }
const object = (v: unknown): Record<string, unknown> | undefined => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null
function httpUrl(v: unknown): string | null {
  try { const u = new URL(String(v)); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null } catch { return null }
}
export function normalizeDoi(value: string): string {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) return fail('invalid_input', 'DOI 格式无效')
  const doi = value.trim().replace(/^doi:\s*/i, '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').toLowerCase()
  if (!/^10\.\d{4,9}\/[^\s]+$/.test(doi) || doi.length > 500) return fail('invalid_input', '请输入 DOI 或 doi.org 链接')
  return doi
}
function abstract(value: unknown): Pick<LiteratureRecord, 'abstract' | 'abstractStatus'> {
  if (value == null) return {abstract:null,abstractStatus:'missing'}
  const source = object(value), words = new Map<number,string>()
  if (!source || Object.keys(source).length > 5000) return {abstract:null,abstractStatus:'invalid'}
  for (const [word,positions] of Object.entries(source)) {
    if (!Array.isArray(positions) || positions.length > 5000) return {abstract:null,abstractStatus:'invalid'}
    for (const position of positions) {
      if (!Number.isInteger(position) || position < 0 || position >= 5000 || words.has(position)) return {abstract:null,abstractStatus:'invalid'}
      words.set(position,word)
    }
  }
  const ordered = [...words.entries()].sort((a,b)=>a[0]-b[0])
  if (!ordered.length || ordered.some(([p],i)=>p!==i)) return {abstract:null,abstractStatus:'invalid'}
  // Bound the expanded text too: one long token can occupy thousands of positions.
  let full = ''
  for(const [,word] of ordered){
    const fragment=(full?' ':'')+word.slice(0,2001)
    if(full.length+fragment.length>2000)return {abstract:(full+fragment).slice(0,2000).replace(/[\uD800-\uDBFF]$/, ''),abstractStatus:'truncated'}
    full+=fragment
  }
  return {abstract:full,abstractStatus:'available'}
}
function record(raw: unknown): LiteratureRecord {
  const w=object(raw), id=text(w?.id), title=text(w?.title)
  if (!w || !id || !/^https:\/\/openalex\.org\/W\d+$/.test(id) || !title) return fail('invalid_response','OpenAlex 返回的文献身份或题名无效')
  const authorships=Array.isArray(w.authorships) ? w.authorships : []
  const location=object(w.primary_location), source=object(location?.source)
  let doi: string | null = null
  if (w.doi != null) { try { doi='https://doi.org/'+normalizeDoi(String(w.doi)) } catch { return fail('invalid_response','OpenAlex 返回了无效 DOI') } }
  return {id,title,authors:authorships.slice(0,40).map(a=>text(object(object(a)?.author)?.display_name)).filter((x):x is string=>x!==null),authorsTruncated:authorships.length>40,
    year: typeof w.publication_year==='number' && Number.isInteger(w.publication_year) ? w.publication_year : null,
    date: typeof w.publication_date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(w.publication_date) ? w.publication_date : null,
    journal:text(source?.display_name),doi,...abstract(w.abstract_inverted_index),sourceUrl:id,landingPageUrl:httpUrl(location?.landing_page_url)}
}

export class OpenAlexClient {
  private readonly network: typeof fetch
  constructor(private readonly options: OpenAlexOptions = {}) { this.network = options.fetch ?? globalThis.fetch }
  async search(input: LiteratureSearch, signal?: AbortSignal): Promise<LiteratureReport> {
    const query=typeof input.query==='string' ? input.query.trim() : '', limit=input.limit ?? 10
    if (!query || query.length>300 || /[\x00-\x1f\x7f]/.test(query) || !Number.isInteger(limit) || limit<1 || limit>25) return fail('invalid_input','检索词需为 1–300 字，数量需为 1–25 的整数')
    const years=[input.fromYear,input.toYear].filter((y):y is number=>y!==undefined)
    if (years.some(y=>!Number.isInteger(y)||y<1000||y>2100) || (input.fromYear!==undefined && input.toYear!==undefined && input.fromYear>input.toYear)) return fail('invalid_input','年份范围无效')
    const url=new URL('https://api.openalex.org/works')
    url.searchParams.set('search',query);url.searchParams.set('per_page',String(limit));url.searchParams.set('select',fields)
    const filters=[...(input.fromYear!==undefined?[`from_publication_date:${input.fromYear}-01-01`]:[]),...(input.toYear!==undefined?[`to_publication_date:${input.toYear}-12-31`]:[])]
    if(filters.length)url.searchParams.set('filter',filters.join(','))
    const body=object(await this.request(url,signal)), meta=object(body?.meta)
    if(!Array.isArray(body?.results) || body.results.length>limit || !Number.isInteger(meta?.count) || Number(meta?.count)<body.results.length) return fail('invalid_response','OpenAlex 返回的检索结果格式无效')
    return this.report(url,{kind:'search',value:query,limit,...(input.fromYear!==undefined?{fromYear:input.fromYear}:{}),...(input.toYear!==undefined?{toYear:input.toYear}:{})},Number(meta?.count),body.results.map(record))
  }
  async getByDoi(value: string, signal?: AbortSignal): Promise<LiteratureReport> {
    const doi=normalizeDoi(value), url=new URL('https://api.openalex.org/works/'+encodeURIComponent('https://doi.org/'+doi))
    url.searchParams.set('select',fields)
    const body=await this.request(url,signal,true)
    if(body===null)return this.report(url,{kind:'doi',value:doi,limit:1},0,[],['OpenAlex 未收录或未查到该 DOI；不能据此认定论文不存在。'])
    const found=record(body)
    if(found.doi!==`https://doi.org/${doi}`)return fail('source_mismatch','OpenAlex 返回的 DOI 与请求不一致，未完成核对')
    return this.report(url,{kind:'doi',value:doi,limit:1},1,[found])
  }
  private report(url: URL, query: LiteratureReport['query'], total: number, records: LiteratureRecord[], warnings: string[] = []): LiteratureReport {
    return {source:'OpenAlex',retrievedAt:(this.options.now?.()??new Date()).toISOString(),requestUrl:url.href,query,total,returned:records.length,records,warnings:[...warnings,'索引元数据仅用于核对引用；不表示已阅读全文或科学结论已获验证。']}
  }
  private async request(url: URL, signal?: AbortSignal, allowMissing=false): Promise<unknown> {
    if(signal?.aborted)return fail('cancelled','文献查询已取消')
    const timeout=AbortSignal.timeout(this.options.timeoutMs??20_000), combined=signal?AbortSignal.any([signal,timeout]):timeout
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let body: ReadableStream<Uint8Array> | null = null
    try {
      const response=await this.network(url,{signal:combined,redirect:'error',headers:{accept:'application/json','user-agent':'DAWN-Science/Literature'}})
      body=response.body
      if(allowMissing && response.status===404)return null
      if(response.status===429)return fail('rate_limited','OpenAlex 请求过于频繁或匿名额度已用尽，请稍后重试')
      if(response.status===401 || response.status===403)return fail('access_denied','OpenAlex 拒绝访问，请检查服务的访问条件')
      if(!response.ok)return fail('service_error',`OpenAlex 服务请求失败（HTTP ${response.status}）`)
      const max=this.options.maxBytes??2*1024*1024
      if(Number(response.headers.get('content-length'))>max)return fail('response_too_large','OpenAlex 响应超过读取预算，请减少查询数量')
      reader=response.body?.getReader()
      if(!reader)return fail('invalid_response','OpenAlex 返回了空响应')
      const chunks:Uint8Array[]=[];let size=0
      for(;;){if(combined.aborted)throw new Error('aborted');const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>max)return fail('response_too_large','OpenAlex 响应超过读取预算，请减少查询数量');chunks.push(chunk.value)}
      const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength}
      try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all))}catch{return fail('invalid_response','OpenAlex 返回的内容不是有效 JSON')}
    } catch(error) {
      if(signal?.aborted)return fail('cancelled','文献查询已取消')
      if(timeout.aborted)return fail('timeout','OpenAlex 查询超时，请稍后重试')
      if(error instanceof LiteratureError)throw error
      return fail('network_error','无法连接 OpenAlex，请检查网络后重试')
    } finally {
      if(reader){await reader.cancel().catch(()=>{});reader.releaseLock()}
      else await body?.cancel().catch(()=>{})
    }
  }
}
