import {serialRequests} from '../literature/request.js'
import {scienceRequest} from './request.js'
import {ScienceError,bounded,checkedAccession,invalid,object,text,validateQuery,type ScienceClient,type ScienceOptions,type ScienceRecord,type ScienceReport,type ScienceSearch} from './model.js'
const scheduleUniProt=serialRequests(500)
const ACCESSION=/^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})$/
const FIELDS='accession,id,reviewed,protein_name,gene_names,organism_name,organism_id,length,cc_function,sequence'
function protein(value:unknown,warnings:string[]):ScienceRecord {
  const doc=object(value),id=text(doc?.primaryAccession)
  if(!doc||!id||!ACCESSION.test(id))invalid('UniProt 返回无效的主编号')
  const description=object(doc.proteinDescription),recommended=object(description?.recommendedName)
  const submissions=Array.isArray(description?.submissionNames)?description.submissionNames:[]
  const name=bounded(object(recommended?.fullName)?.value??object(object(submissions[0])?.fullName)?.value,warnings,'蛋白名称',2000)
  const entryId=bounded(doc.uniProtkbId,warnings,'条目名',2000),organism=object(doc.organism)
  if(doc.genes!=null&&!Array.isArray(doc.genes)||doc.comments!=null&&!Array.isArray(doc.comments))invalid('UniProt 基因或注释列表无效')
  const geneNames=(Array.isArray(doc.genes)?doc.genes:[]).map(g=>bounded(object(object(g)?.geneName)?.value,warnings,'基因名称',500)).filter((g):g is string=>!!g)
  if(geneNames.length>40)warnings.push(`${id} 基因名称仅显示前 40 项`)
  const functions:string[]=[],references:string[]=[]
  for(const item of Array.isArray(doc.comments)?doc.comments:[]){
    const comment=object(item)
    if(comment?.commentType!=='FUNCTION')continue
    if(!Array.isArray(comment.texts))invalid('UniProt FUNCTION 文本无效')
    for(const item of comment.texts){
      const annotation=object(item),value=text(annotation?.value)
      if(value)functions.push(value)
      for(const e of Array.isArray(annotation?.evidences)?annotation.evidences:[]){
        const evidence=object(e),source=text(evidence?.source),ref=text(evidence?.id)
        if(source&&ref&&source.length<100&&ref.length<200)references.push(`${source}:${ref}`)
      }
    }
  }
  const refs=[...new Set(references)]
  if(refs.length>40)warnings.push(`${id} 功能参考标识仅显示前 40 项`)
  const seq=object(doc.sequence),raw=seq?.value,length=seq?.length
  if(length!=null&&(!Number.isSafeInteger(length)||Number(length)<1))invalid('UniProt 序列长度无效')
  let sequence:string|undefined,sequenceStatus='missing'
  if(raw!=null){
    if(typeof raw!=='string'||!raw||!/^[A-Z]+$/.test(raw)||length!=null&&length!==raw.length)invalid('UniProt 序列字符或长度与来源不一致')
    if(raw.length>100000){sequenceStatus='omitted_too_large';warnings.push(`${id} 序列超过 100000 残基，仅保留元数据，不生成截断 FASTA`)}
    else {sequence=raw;sequenceStatus='available'}
  }
  const entryType=text(doc.entryType),reviewStatus=entryType==='UniProtKB reviewed (Swiss-Prot)'?'reviewed':entryType==='UniProtKB unreviewed (TrEMBL)'?'unreviewed':null
  return {accession:id,title:name??entryId??id,sourceUrl:`https://www.uniprot.org/uniprotkb/${id}/entry`,fields:{
    proteinName:name,entryId,geneNames:geneNames.slice(0,40),organism:bounded(organism?.scientificName,warnings,'物种',2000),taxonId:typeof organism?.taxonId==='number'&&Number.isSafeInteger(organism.taxonId)?organism.taxonId:null,
    reviewStatus,functionAnnotation:bounded(functions.join('\n'),warnings,'功能注释'),functionReferences:refs.slice(0,40),sequenceLength:length==null?(typeof raw==='string'?raw.length:null):Number(length),sequenceStatus,
  },...(sequence?{sequence}:{})}
}
export class UniProtClient implements ScienceClient {
  constructor(private readonly options:ScienceOptions={}){}
  async search(input:ScienceSearch,signal?:AbortSignal):Promise<ScienceReport>{
    const {query,limit}=validateQuery(input)
    return this.query(query,{kind:'search',value:query,limit},signal)
  }
  async getByAccession(value:string,signal?:AbortSignal):Promise<ScienceReport>{
    const id=checkedAccession(value,ACCESSION,'UniProt 主')
    return this.query(`accession:${id}`,{kind:'accession',value:id,limit:1},signal,id)
  }
  private async query(term:string,query:ScienceReport['query'],signal?:AbortSignal,requested?:string):Promise<ScienceReport>{
    const url=new URL('https://rest.uniprot.org/uniprotkb/search')
    url.search=new URLSearchParams({query:term,format:'json',size:String(query.limit),fields:FIELDS}).toString()
    let count:string|null=null
    const network=this.options.fetch??globalThis.fetch
    const options={...this.options,fetch:async(input:string|URL|Request,init?:RequestInit)=>{
      const response=await network(input,init);count=response.headers.get('x-total-results');return response
    }}
    let value:unknown
    try{value=await(this.options.schedule??scheduleUniProt)(()=>scienceRequest('UniProt',url,options,signal),signal)}
    catch(error){if(signal?.aborted)throw new ScienceError('cancelled','科研查询已取消');throw error}
    const total=Number(count),body=object(value),results=body?.results,warnings:string[]=[]
    if(count===null||!/^\d+$/.test(count)||!Number.isSafeInteger(total)||!Array.isArray(results)||body?.messages||results.length!==Math.min(query.limit,total))invalid('UniProt 总量、记录数或 JSON 信封无效')
    const records=results.map(r=>protein(r,warnings))
    if(new Set(records.map(r=>r.accession)).size!==records.length)invalid('UniProt 返回重复主编号')
    if(requested&&(total>1||records.some(r=>r.accession!==requested)))throw new ScienceError('source_mismatch','UniProt 返回的主编号与请求不同；请先检索核对是否为旧编号或次级编号')
    if(total>records.length)warnings.push(`共匹配 ${total} 个条目，本次仅返回 ${records.length} 个，未自动翻页`)
    return {source:'UniProt',retrievedAt:(this.options.now?.()??new Date()).toISOString(),requestUrls:[url.href],query,total,returned:records.length,records,warnings}
  }
}
