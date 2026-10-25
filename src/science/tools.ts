import {SraClient} from './sra.js'
import {randomUUID} from 'node:crypto'
import {Type} from 'typebox'
import {GeoClient} from './geo.js'
import {ScienceError,type ScienceClient,type ScienceReport,type ScienceSource} from './model.js'
import {saveScienceRecords,type ObservedScienceRecord} from './save.js'
export interface ScienceFlags {off:boolean;read:boolean;save:boolean}
export const GEO_FAMILIES=[
  {key:'read',name:'数据集与实验信息',tools:[
    {name:'geo_search',description:'查询 NCBI GEO 的公开 Series 数据集，支持关键词或 Entrez 检索表达式。返回真实元数据、来源与时间，不下载数据。'},
    {name:'geo_get_series',description:'按 GSE 编号精确查询 GEO 研究摘要、实验设计、平台和有界样本清单。缺失信息明确标注，不推断分组。'},
  ]},
  {key:'save',name:'保存数据清单',tools:[{name:'geo_save',description:'仅保存本会话实际查询到且选定的 GEO recordId，输出 records.json 与数据清单.md，不下载原始数据。'}]},
] as const
export const SRA_FAMILIES=[
  {key:'read',name:'数据集与实验信息',tools:[
    {name:'sra_search',description:'检索 NCBI SRA 公开元数据，支持关键词/Entrez 表达式。返回实验记录和文库/测序 Run 信息；数量以 Experiment 为单位，不等于生物学样本量。'},
    {name:'sra_get_accession',description:'按 SRA Study/Sample/Experiment/Run 编号查询并核对所属实验。支持 SR/ER/DR 编号；研究最多返回20个实验，运行列表有界，不下载测序数据。'},
  ]},
  {key:'save',name:'保存数据清单',tools:[{name:'sra_save',description:'仅保存本会话实际从 NCBI SRA 查到的 recordId，生成实验与 Run 元数据 JSON/Markdown 清单；不下载 FASTQ/SRA，不获取受控数据权限。'}]},
] as const
export function sraTools(workspace:string,flags:ScienceFlags,options:Options={}){
  return scienceTools(workspace,flags,options.client??new SraClient(),SRA_FAMILIES,'NCBI SRA',options.remote)
}
type Families=readonly {key:string;name:string;tools:readonly {name:string;description:string}[]}[]
type Options={client?:ScienceClient;remote?:boolean}
export function geoTools(workspace:string,flags:ScienceFlags,options:Options={}){
  return scienceTools(workspace,flags,options.client??new GeoClient(),GEO_FAMILIES,'GEO',options.remote)
}
const output=(value:unknown,isError=false)=>({content:[{type:'text' as const,text:JSON.stringify(value)}],...(isError?{isError:true}:{}),details:undefined})
export function scienceTools(workspace:string,flags:ScienceFlags,client:ScienceClient,families:Families,source:ScienceSource,remote=false){
  if(flags.off)return []
  const cache=new Map<string,ObservedScienceRecord>()
  const observe=(report:ScienceReport,signal?:AbortSignal)=>{
    if(signal?.aborted)throw new ScienceError('cancelled','科研查询已取消')
    if(report.source!==source)throw new ScienceError('source_mismatch','科研查询来源与当前插件不一致')
    const {records,total:_total,returned:_returned,...origin}=report
    return {...report,records:records.map(record=>{
      const entry={recordId:randomUUID(),record:structuredClone(record),origin:structuredClone(origin)}
      cache.set(entry.recordId,entry);while(cache.size>100)cache.delete(cache.keys().next().value!)
      return {...record,recordId:entry.recordId}
    })}
  }
  const tool=(definition:{name:string;description:string},parameters:unknown,run:(p:Record<string,unknown>,signal?:AbortSignal)=>Promise<unknown>)=>({
    ...definition,label:definition.name,parameters,
    async execute(_callId:string,args:Record<string,unknown>,signal?:AbortSignal){
      try{if(signal?.aborted)throw new ScienceError('cancelled','科研操作已取消');return output(await run(args,signal))}
      catch(error){return output({error:{code:error instanceof ScienceError?error.code:'operation_failed',message:error instanceof Error?error.message:'科研操作失败'}},true)}
    },
  })
  return [
    ...(flags.read?[
      tool(families[0]!.tools[0]!,Type.Object({query:Type.String({minLength:1,maxLength:300}),limit:Type.Optional(Type.Integer({minimum:1,maximum:20}))},{additionalProperties:false}),async(p,signal)=>observe(await client.search({query:p.query as string,limit:p.limit as number|undefined},signal),signal)),
      tool(families[0]!.tools[1]!,Type.Object({accession:Type.String({minLength:1,maxLength:30})},{additionalProperties:false}),async(p,signal)=>observe(await client.getByAccession(p.accession as string,signal),signal)),
    ]:[]),
    ...(flags.save&&!remote?[
      tool(families[1]!.tools[0]!,Type.Object({record_ids:Type.Array(Type.String(),{minItems:1,maxItems:20,uniqueItems:true}),directory:Type.String({description:'使用工作区 outputs/datasets，每次新建独立子目录，不覆盖。'})},{additionalProperties:false}),async(p,signal)=>{
        if(!Array.isArray(p.record_ids)||!p.record_ids.length||p.record_ids.length>20||p.record_ids.some(id=>typeof id!=='string'||!cache.has(id)))throw new ScienceError('invalid_input','包含未查询、已过期或其他会话的记录，请使用实际返回的 recordId')
        return saveScienceRecords(workspace,p.directory as string,[...new Set(p.record_ids as string[])].map(id=>cache.get(id)!),signal)
      }),
    ]:[]),
  ]
}
