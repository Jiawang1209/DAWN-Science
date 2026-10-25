import {ScienceError,bounded,checkedAccession,invalid,object,text,validateQuery,type ScienceClient,type ScienceOptions,type ScienceRecord,type ScienceReport,type ScienceSearch} from './model.js'
import {eutils,ncbiRequest,parseSearch,parseSummaries} from './ncbi.js'

function mapSeries(doc:Record<string,unknown>,warnings:string[]):ScienceRecord {
  const accession=text(doc.accession),title=bounded(doc.title,warnings,'题名',2000)
  if(!accession||!/^GSE\d+$/.test(accession)||doc.entrytype!=='GSE'||!title)invalid('GEO 返回的 Series 编号、题名或类型无效')
  const samples=doc.samples==null?[]:doc.samples
  if(!Array.isArray(samples))invalid('GEO 样本列表无效')
  if(samples.length>40)warnings.push(`${accession} 样本清单仅显示前 40 条，共 ${samples.length} 条返回记录`)
  const listed=samples.slice(0,40).map(s=>{const r=object(s);if(!r||typeof r.accession!=='string'||!/^GSM\d+$/.test(r.accession))invalid('GEO 样本编号无效');return r})
  const count=doc.n_samples==null?null:Number(doc.n_samples)
  if(count!==null&&(!Number.isSafeInteger(count)||count<0))invalid('GEO 样本数量无效')
  if(count!==null&&count>samples.length)warnings.push(`${accession} 样本总数 ${count}，接口仅返回 ${samples.length} 条样本信息`)
  const platforms=typeof doc.gpl==='string'?doc.gpl.split(/[;,\s]+/).filter(Boolean).map(id=>`GPL${id.replace(/^GPL/,'')}`):[]
  return {accession,title,sourceUrl:`https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${accession}`,fields:{
    organism:bounded(doc.taxon,warnings,'物种',2000),experimentType:bounded(doc.gdstype,warnings,'实验类型',2000),summary:bounded(doc.summary,warnings,'研究摘要'),overallDesign:null,
    sampleCount:count,platforms,sampleAccessions:listed.map(s=>s.accession as string),sampleTitles:listed.map(s=>bounded(s.title,warnings,'样本名称',1000)??'未提供'),
    pubmedIds:Array.isArray(doc.pubmedids)?doc.pubmedids.map(String).filter(id=>/^\d+$/.test(id)).slice(0,40):[],bioProject:text(doc.bioproject),
  }}
}
function supplement(record:ScienceRecord,value:unknown,warnings:string[]) {
  if(typeof value!=='string')invalid('GEO SOFT brief 不是文本')
  const lines=value.split(/\r?\n/),accessions=lines.filter(l=>l.startsWith('^SERIES = ')).map(l=>l.slice(10).trim())
  if(accessions.length!==1||accessions[0]!==record.accession)throw new ScienceError('source_mismatch','GEO SOFT 返回的 Series 与请求编号不一致')
  const fields=new Map<string,string[]>()
  for(const line of lines){const m=/^!Series_(\w+) = (.*)$/.exec(line);if(m)fields.set(m[1]!,[...(fields.get(m[1]!)??[]),m[2]!])}
  record.fields.overallDesign=bounded(fields.get('overall_design')?.join('\n'),warnings,'实验设计')
  const summary=bounded(fields.get('summary')?.join('\n'),warnings,'研究摘要');if(summary)record.fields.summary=summary
  const platforms=fields.get('platform_id')?.filter(id=>/^GPL\d+$/.test(id));if(platforms?.length)record.fields.platforms=platforms.slice(0,40)
  if(!record.fields.overallDesign)warnings.push(`${record.accession} 来源未提供实验设计`)
}
export class GeoClient implements ScienceClient {
  constructor(private readonly options:ScienceOptions={}){}
  async search(input:ScienceSearch,signal?:AbortSignal):Promise<ScienceReport>{
    const {query,limit}=validateQuery(input)
    return this.query(`(${query}) AND gse[ETYP]`,{kind:'search',value:query,limit},signal)
  }
  async getByAccession(value:string,signal?:AbortSignal):Promise<ScienceReport>{
    const accession=checkedAccession(value,/^GSE\d{1,12}$/,'GSE')
    const report=await this.query(`${accession}[ACCN] AND gse[ETYP]`,{kind:'accession',value:accession,limit:1},signal)
    if(report.records.length){
      const record=report.records[0]!
      if(record.accession!==accession||report.total!==1)throw new ScienceError('source_mismatch','GEO 查询结果与请求编号不一致')
      const url=new URL('https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi')
      url.search=new URLSearchParams({acc:accession,targ:'self',form:'text',view:'brief'}).toString()
      supplement(record,await ncbiRequest('GEO',url,this.options,signal,'text'),report.warnings)
      report.requestUrls.push(url.href)
      report.retrievedAt=(this.options.now?.()??new Date()).toISOString()
    }
    return report
  }
  private async query(term:string,query:ScienceReport['query'],signal?:AbortSignal):Promise<ScienceReport>{
    const url=eutils('esearch','gds',{term,retmax:String(query.limit)})
    const {ids,total}=parseSearch(await ncbiRequest('GEO',url,this.options,signal),query.limit),requestUrls=[url.href],warnings:string[]=[]
    let records:ScienceRecord[]=[]
    if(ids.length){
      const details=eutils('esummary','gds',{id:ids.join(',')})
      records=parseSummaries(await ncbiRequest('GEO',details,this.options,signal),ids).map(d=>mapSeries(d,warnings))
      if(new Set(records.map(r=>r.accession)).size!==records.length)invalid('GEO 返回重复 Series')
      requestUrls.push(details.href)
    }
    return {source:'GEO',retrievedAt:(this.options.now?.()??new Date()).toISOString(),requestUrls,query,total,returned:records.length,records,warnings}
  }
}
