import {DOMParser} from '@xmldom/xmldom'
import {ScienceError,bounded,checkedAccession,invalid,text,validateQuery,type ScienceClient,type ScienceOptions,type ScienceRecord,type ScienceReport,type ScienceSearch,type ScienceRun} from './model.js'
import {eutils,ncbiRequest,parseSearch,parseSummaries} from './ncbi.js'

function xml(value:unknown):Document {
  if(typeof value!=='string'||value.length>2*1024*1024||/<!\s*(?:DOCTYPE|ENTITY)/i.test(value))invalid('SRA XML 缺失、超限或包含不支持的声明')
  let failed=false
  try {
    const doc=new DOMParser({errorHandler:()=>{failed=true}}).parseFromString(`<root>${value}</root>`,'application/xml')
    if(failed||!doc.documentElement||doc.documentElement.tagName!=='root')invalid('SRA XML 格式无效')
    return doc
  } catch {return invalid('SRA XML 格式无效')}
}
function single(doc:Document,tag:string):Element|null {
  const nodes=doc.getElementsByTagName(tag)
  if(nodes.length>1)invalid(`SRA ${tag} 字段重复`)
  return nodes.item(0)
}
function accession(node:Element|null,pattern:RegExp,label:string):string|null {
  if(!node)return null
  const value=node.getAttribute('acc')
  if(!value||!pattern.test(value))invalid(`SRA ${label} 编号无效`)
  return value
}
function integer(value:string|null|undefined,label:string):string|null {
  if(!value)return null
  if(!/^\d+$/.test(value))invalid(`SRA ${label} 数量无效`)
  return value // Preserve source precision; totals can exceed Number.MAX_SAFE_INTEGER.
}
function mapExperiment(doc:Record<string,unknown>,warnings:string[],requested?:string):ScienceRecord {
  const info=xml(doc.expxml),runDoc=xml(doc.runs??'')
  const experiment=single(info,'Experiment'),id=accession(experiment,/^[SED]RX\d+$/,'实验')
  const title=bounded(single(info,'Title')?.textContent,warnings,'实验题名',2000)
  if(!id||!title)invalid('SRA 缺少实验编号或题名')
  const study=single(info,'Study'),sample=single(info,'Sample'),organism=single(info,'Organism'),platform=single(info,'Platform'),stats=single(info,'Statistics')
  const studyId=accession(study,/^[SED]RP\d+$/,'研究'),sampleId=accession(sample,/^[SED]RS\d+$/,'样本')
  const allRuns:ScienceRun[]=Array.from(runDoc.getElementsByTagName('Run')).map(node=>{
    const acc=accession(node,/^[SED]RR\d+$/,'运行')!
    const publicText=node.getAttribute('is_public')
    if(publicText&&!['true','false'].includes(publicText))invalid('SRA Run 公开状态无效')
    return {accession:acc,spots:integer(node.getAttribute('total_spots'),'spots'),bases:integer(node.getAttribute('total_bases'),'bases'),public:publicText?publicText==='true':null}
  })
  if(new Set(allRuns.map(r=>r.accession)).size!==allRuns.length)invalid('SRA 返回重复 Run')
  if(requested){
    const matches=requested[2]==='X'?id===requested:requested[2]==='P'?studyId===requested:requested[2]==='S'?sampleId===requested:allRuns.some(r=>r.accession===requested)
    if(!matches)throw new ScienceError('source_mismatch','SRA 返回实验不属于请求编号')
  }
  const runCount=integer(stats?.getAttribute('total_runs'),'运行')
  if(runCount!==null&&(!Number.isSafeInteger(Number(runCount))||Number(runCount)<allRuns.length))invalid('SRA 运行总量与清单不一致')
  if(runCount!==null&&Number(runCount)>allRuns.length)warnings.push(`${id} 来源报告 ${runCount} 个 Run，本次仅返回 ${allRuns.length} 个 Run 元数据`)
  let runs=allRuns.slice(0,40)
  if(allRuns.length>40){
    warnings.push(`${id} 运行清单仅显示 40 项，共 ${allRuns.length} 项返回记录`)
    const target=allRuns.find(r=>r.accession===requested)
    if(target&&!runs.some(r=>r.accession===requested))runs=[...runs.slice(0,39),target]
  }
  if(allRuns.some(r=>r.public===false))warnings.push(`${id} 包含受限 Run；元数据可见不表示已获数据访问权限`)
  const layout=single(info,'LIBRARY_LAYOUT')
  const paired=!!layout?.getElementsByTagName('PAIRED').length,singleEnd=!!layout?.getElementsByTagName('SINGLE').length
  if(paired&&singleEnd)invalid('SRA 文库布局自相矛盾')
  return {accession:id,title,sourceUrl:`https://www.ncbi.nlm.nih.gov/sra/${id}`,fields:{
    studyAccession:studyId,studyTitle:bounded(study?.getAttribute('name'),warnings,'研究名称',2000),sampleAccession:sampleId,
    organism:bounded(organism?.getAttribute('ScientificName'),warnings,'物种',2000),taxonId:integer(organism?.getAttribute('taxid'),'物种'),
    platform:bounded(platform?.textContent,warnings,'测序平台',1000),instrument:bounded(platform?.getAttribute('instrument_model'),warnings,'测序仪器',1000),
    libraryStrategy:bounded(single(info,'LIBRARY_STRATEGY')?.textContent,warnings,'文库策略',1000),librarySource:bounded(single(info,'LIBRARY_SOURCE')?.textContent,warnings,'文库来源',1000),librarySelection:bounded(single(info,'LIBRARY_SELECTION')?.textContent,warnings,'文库选择',1000),libraryLayout:paired?'PAIRED':singleEnd?'SINGLE':null,
    bioProject:text(single(info,'Bioproject')?.textContent),bioSample:text(single(info,'Biosample')?.textContent),
    runCount:runCount===null?null:Number(runCount),totalSpots:integer(stats?.getAttribute('total_spots'),'spots'),totalBases:integer(stats?.getAttribute('total_bases'),'bases'),archiveSizeBytes:integer(stats?.getAttribute('total_size'),'归档大小'),
  },runs}
}
export class SraClient implements ScienceClient {
  constructor(private readonly options:ScienceOptions={}){}
  async search(input:ScienceSearch,signal?:AbortSignal):Promise<ScienceReport>{
    const {query,limit}=validateQuery(input)
    return this.query(query,{kind:'search',value:query,limit},signal)
  }
  async getByAccession(value:string,signal?:AbortSignal):Promise<ScienceReport>{
    const id=checkedAccession(value,/^[SED]R[PSXR]\d{1,12}$/,'SRA Study/Sample/Experiment/Run')
    const exact=['X','R'].includes(id[2]!)
    return this.query(`${id}[ACCN]`,{kind:'accession',value:id,limit:exact?1:20},signal,id)
  }
  private async query(term:string,query:ScienceReport['query'],signal?:AbortSignal,requested?:string):Promise<ScienceReport>{
    const url=eutils('esearch','sra',{term,retmax:String(query.limit)}),requestUrls=[url.href],warnings:string[]=[]
    const {ids,total}=parseSearch(await ncbiRequest('NCBI SRA',url,this.options,signal),query.limit)
    if(requested&&['X','R'].includes(requested[2]!)&&total>1)throw new ScienceError('source_mismatch','SRA 精确实验或 Run 编号匹配到多个实验')
    let records:ScienceRecord[]=[]
    if(ids.length){
      const detail=eutils('esummary','sra',{id:ids.join(',')})
      records=parseSummaries(await ncbiRequest('NCBI SRA',detail,this.options,signal),ids).map(d=>mapExperiment(d,warnings,requested))
      if(new Set(records.map(r=>r.accession)).size!==records.length)invalid('SRA 返回重复实验')
      requestUrls.push(detail.href)
    }
    warnings.unshift('SRA 检索数量以实验（Experiment）为单位；Run 数量不等于生物学样本量')
    if(total>records.length)warnings.push(`共匹配 ${total} 个实验，本次仅返回 ${records.length} 个，未自动翻页`)
    return {source:'NCBI SRA',retrievedAt:(this.options.now?.()??new Date()).toISOString(),requestUrls,query,total,returned:records.length,records,warnings}
  }
}
