import {LiteratureError,normalizeDoi,safeHttpUrl,validateSearch,type LiteratureClientOptions,type LiteratureRecord,type LiteratureReport,type LiteratureSearch} from './model.js'
import {requestJson,serialRequests,type RequestScheduler} from './request.js'

const scheduleCrossref=serialRequests(1000)
const fields='DOI,title,author,published,issued,container-title,URL,abstract'
const object=(value:unknown):Record<string,unknown>|undefined=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null
const firstText=(value:unknown)=>Array.isArray(value)?value.map(text).find(v=>v!==null)??null:null
const invalid=(message:string):never=>{throw new LiteratureError('invalid_response',`Crossref ${message}`)}

function abstract(value:unknown):Pick<LiteratureRecord,'abstract'|'abstractStatus'> {
  if(value==null)return {abstract:null,abstractStatus:'missing'}
  if(typeof value!=='string')return {abstract:null,abstractStatus:'invalid'}
  const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}
  // A plain-text conversion only; XML declarations/entities are never evaluated.
  const plain=value.replace(/<[^<>]*>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(whole,key:string)=>{
    if(key.startsWith('#')){
      const point=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10)
      return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):'�'
    }
    return entities[key.toLowerCase()]??whole
  }).replace(/\s+/g,' ').trim()
  if(!plain)return {abstract:null,abstractStatus:'missing'}
  return plain.length>2000?{abstract:plain.slice(0,2000).replace(/[\uD800-\uDBFF]$/,''),abstractStatus:'truncated'}:{abstract:plain,abstractStatus:'available'}
}
function publicationDate(work:Record<string,unknown>) {
  const date=object(work.published)??object(work.issued)
  const parts=Array.isArray(date?.['date-parts'])?(date!['date-parts'] as unknown[])[0]:undefined
  if(!Array.isArray(parts)||!Number.isInteger(parts[0])||parts[0]<1000||parts[0]>2100)return {year:null,date:null}
  const year=parts[0] as number
  if(parts.length<3||!parts.every(Number.isInteger))return {year,date:null}
  const candidate=new Date(Date.UTC(year,parts[1]-1,parts[2]))
  return {year,date:candidate.getUTCFullYear()===year&&candidate.getUTCMonth()===parts[1]-1&&candidate.getUTCDate()===parts[2]?candidate.toISOString().slice(0,10):null}
}
function record(raw:unknown):LiteratureRecord {
  const work=object(raw),title=firstText(work?.title)
  if(!work||!title)return invalid('返回的题名无效')
  let doi:string
  try{doi=normalizeDoi(work.DOI as string)}catch{return invalid('返回的 DOI 无效')}
  const authors=Array.isArray(work.author)?work.author:[]
  return {
    id:'https://doi.org/'+doi,title,doi:'https://doi.org/'+doi,
    authors:authors.slice(0,40).map(raw=>{const a=object(raw);return text(a?.name)??text([text(a?.given),text(a?.family)].filter(Boolean).join(' '))}).filter((name):name is string=>name!==null),
    authorsTruncated:authors.length>40,...publicationDate(work),journal:firstText(work['container-title']),
    ...abstract(work.abstract),sourceUrl:'https://api.crossref.org/works/'+encodeURIComponent(doi),landingPageUrl:safeHttpUrl(work.URL),
  }
}

export interface CrossrefOptions extends LiteratureClientOptions {schedule?:RequestScheduler}
export class CrossrefClient {
  constructor(private readonly options:CrossrefOptions={}){}
  private request(url:URL,signal?:AbortSignal,missing=false) {
    return (this.options.schedule??scheduleCrossref)(()=>requestJson('Crossref',url,this.options,signal,missing),signal)
  }
  private report(url:URL,query:LiteratureReport['query'],total:number,records:LiteratureRecord[],warnings:string[]=[]):LiteratureReport {
    return {source:'Crossref',retrievedAt:(this.options.now?.()??new Date()).toISOString(),requestUrl:url.href,query,total,returned:records.length,records,warnings:[...warnings,'登记元数据仅用于核对引用；不表示已阅读全文或科学结论已获验证。']}
  }
  async search(input:LiteratureSearch,signal?:AbortSignal):Promise<LiteratureReport> {
    const {query,limit}=validateSearch(input),url=new URL('https://api.crossref.org/works')
    url.searchParams.set('query.bibliographic',query);url.searchParams.set('rows',String(limit));url.searchParams.set('select',fields)
    url.searchParams.set('filter',['type:journal-article',...(input.fromYear!==undefined?[`from-pub-date:${input.fromYear}-01-01`]:[]),...(input.toYear!==undefined?[`until-pub-date:${input.toYear}-12-31`]:[])].join(','))
    const body=object(await this.request(url,signal)),message=object(body?.message),items=message?.items,total=message?.['total-results']
    if(body?.status!=='ok'||!Array.isArray(items)||items.length>limit||!Number.isInteger(total)||Number(total)<items.length)return invalid('返回的检索结果格式无效')
    return this.report(url,{kind:'search',value:query,limit,...(input.fromYear!==undefined?{fromYear:input.fromYear}:{}),...(input.toYear!==undefined?{toYear:input.toYear}:{})},Number(total),items.map(record))
  }
  async getByDoi(value:string,signal?:AbortSignal):Promise<LiteratureReport> {
    const doi=normalizeDoi(value),url=new URL('https://api.crossref.org/works/'+encodeURIComponent(doi)),raw=await this.request(url,signal,true)
    if(raw===null)return this.report(url,{kind:'doi',value:doi,limit:1},0,[],['Crossref 未登记或未查到该 DOI；不能据此认定论文不存在。'])
    const body=object(raw)
    if(body?.status!=='ok')return invalid('返回的单条记录格式无效')
    const found=record(body.message)
    if(found.doi!=='https://doi.org/'+doi)throw new LiteratureError('source_mismatch','Crossref 返回的 DOI 与请求不一致，未完成核对')
    return this.report(url,{kind:'doi',value:doi,limit:1},1,[found])
  }
}
