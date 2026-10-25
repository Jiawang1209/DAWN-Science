export type ScienceSource = 'GEO'
export class ScienceError extends Error {
  constructor(readonly code:string,message:string){super(message);this.name='ScienceError'}
}
export interface ScienceRecord {
  accession:string; title:string; sourceUrl:string
  fields:Record<string,string|number|null|string[]>
  sequence?:string
}
export interface ScienceReport {
  source:ScienceSource; retrievedAt:string; requestUrls:string[]
  query:{kind:'search'|'accession';value:string;limit:number}
  total:number; returned:number; records:ScienceRecord[]; warnings:string[]
}
export interface ScienceSearch {query:string;limit?:number|undefined}
export interface ScienceClient {
  search(input:ScienceSearch,signal?:AbortSignal):Promise<ScienceReport>
  getByAccession(accession:string,signal?:AbortSignal):Promise<ScienceReport>
}
export interface ScienceOptions {fetch?:typeof fetch;now?:()=>Date;timeoutMs?:number;maxBytes?:number;schedule?:(task:()=>Promise<unknown>,signal?:AbortSignal)=>Promise<unknown>}
export const object=(v:unknown):Record<string,unknown>|undefined=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:undefined
export const text=(v:unknown):string|null=>typeof v==='string'&&v.trim()?v.trim():null
export function invalid(message:string):never{throw new ScienceError('invalid_response',message)}
export function validateQuery(input:ScienceSearch){
  const query=typeof input.query==='string'?input.query.trim():'',limit=input.limit??10
  if(!query||query.length>300||/[\x00-\x1f\x7f]/.test(query)||!Number.isInteger(limit)||limit<1||limit>20)throw new ScienceError('invalid_input','检索词需为 1–300 字，数量需为 1–20 的整数')
  return {query,limit}
}
export function checkedAccession(value:unknown,pattern:RegExp,label:string):string {
  const result=typeof value==='string'?value.trim().toUpperCase():''
  if(!pattern.test(result))throw new ScienceError('invalid_input',`请输入有效的 ${label} 编号`)
  return result
}
export function bounded(value:unknown,warnings:string[],label:string,max=10000):string|null {
  const s=text(value)
  if(s&&s.length>max){warnings.push(`${label} 超过 ${max} 字，已截断`);return s.slice(0,max)}
  return s
}
