import {serialRequests} from '../literature/request.js'
import {scienceRequest} from './request.js'
import {ScienceError,invalid,object,type ScienceOptions,type ScienceSource} from './model.js'

// Shared by all NCBI data clients in this process: less than 3 starts/second.
export const scheduleNcbi=serialRequests(500)
export async function ncbiRequest(source:ScienceSource,url:URL,options:ScienceOptions,signal?:AbortSignal,format:'json'|'text'='json') {
  try{return await(options.schedule??scheduleNcbi)(()=>scienceRequest(source,url,options,signal,format),signal)}
  catch(error){if(signal?.aborted)throw new ScienceError('cancelled','科研查询已取消');throw error}
}
export function eutils(name:'esearch'|'esummary',db:string,params:Record<string,string>):URL {
  const url=new URL(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/${name}.fcgi`)
  url.search=new URLSearchParams({db,retmode:'json',tool:'DAWN-Science',...params}).toString()
  return url
}
export function parseSearch(value:unknown,limit:number):{ids:string[];total:number} {
  const body=object(value),result=object(body?.esearchresult)
  if(!result||body?.error||result.ERROR||result.error||result.errorlist)invalid('NCBI 检索返回错误或无效信封')
  const total=Number(result.count),ids=result.idlist
  if(typeof result.count!=='string'||!/^\d+$/.test(result.count)||!Number.isSafeInteger(total)||!Array.isArray(ids)||ids.length>limit||ids.length>total||ids.length!==Math.min(limit,total)||ids.some(id=>typeof id!=='string'||!/^\d+$/.test(id))||new Set(ids).size!==ids.length)invalid('NCBI 检索总量或编号列表无效')
  return {ids:ids as string[],total}
}
export function parseSummaries(value:unknown,ids:string[]):Record<string,unknown>[] {
  const body=object(value),result=object(body?.result),uids=result?.uids
  if(!result||body?.error||!Array.isArray(uids)||uids.length!==ids.length||uids.some(id=>!ids.includes(String(id)))||new Set(uids).size!==uids.length)invalid('NCBI 摘要编号与检索结果不一致')
  return ids.map(id=>{
    const record=object(result[id])
    if(!record||record.error||String(record.uid)!==id)invalid('NCBI 摘要记录缺失或编号不一致')
    return record
  })
}
