/** Bounded OpenAlex metadata access. No model-generated citation fields enter here. */
import { LiteratureError, normalizeDoi, safeHttpUrl as httpUrl, validateSearch, type LiteratureErrorCode, type LiteratureRecord, type LiteratureReport, type LiteratureSearch, type LiteratureClientOptions as OpenAlexOptions } from './model.js'
import { requestJson } from './request.js'
export { LiteratureError, normalizeDoi } from './model.js'
export type { LiteratureErrorCode, LiteratureRecord, LiteratureReport, LiteratureSearch, LiteratureClientOptions as OpenAlexOptions } from './model.js'
const fields = 'id,doi,title,publication_year,publication_date,authorships,primary_location,abstract_inverted_index'
const fail = (code: LiteratureErrorCode, message: string): never => { throw new LiteratureError(code, message) }
const object = (v: unknown): Record<string, unknown> | undefined => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null
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
  constructor(private readonly options: OpenAlexOptions = {}) {}
  async search(input: LiteratureSearch, signal?: AbortSignal): Promise<LiteratureReport> {
    const {query,limit}=validateSearch(input)
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
  private request(url: URL, signal?: AbortSignal, allowMissing=false): Promise<unknown> {
    return requestJson('OpenAlex',url,this.options,signal,allowMissing)
  }
}
