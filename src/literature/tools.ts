import { randomUUID } from 'node:crypto'
import { Type } from 'typebox'
import { LiteratureError, OpenAlexClient, type LiteratureReport } from './client.js'
import { saveReferences, type ObservedReference } from './save.js'
export interface LiteratureFlags { off: boolean; read: boolean; save: boolean }
export const LITERATURE_FAMILIES = [
  {key:'read',name:'文献检索与核验',tools:[
    {name:'openalex_search',description:'查询 OpenAlex 文献索引，可按关键词和年份检索；返回实际元数据、来源链接与查询时间，不代表已阅读全文。'},
    {name:'openalex_lookup_doi',description:'按 DOI 精确核对 OpenAlex 索引元数据；未查到不能认定论文不存在。'},
  ]},
  {key:'save',name:'保存文献清单',tools:[{name:'literature_save',description:'仅保存本会话实际查到且选定的记录，生成 references.json 与文献清单.md；不接受模型编造的引用字段。'}]},
] as const
const output=(value:unknown,isError=false)=>({content:[{type:'text' as const,text:JSON.stringify(value)}],...(isError?{isError:true}:{}),details:undefined})
export function literatureTools(workspace: string, flags: LiteratureFlags, options: {client?:OpenAlexClient;remote?:boolean}={}) {
  if(flags.off)return []
  const client=options.client??new OpenAlexClient(), cache=new Map<string,ObservedReference>()
  const observe=(report:LiteratureReport,signal?:AbortSignal)=>{
    if(signal?.aborted)throw Error('文献查询已取消')
    const {records,total:_total,returned:_returned,warnings:_warnings,...origin}=report
    const observed=records.map(record=>{const entry:ObservedReference={recordId:randomUUID(),record:structuredClone(record),origin:structuredClone(origin)};cache.set(entry.recordId,entry);while(cache.size>100)cache.delete(cache.keys().next().value!);return {...record,recordId:entry.recordId}})
    return {...report,records:observed}
  }
  const tool=(name:string,parameters:unknown,run:(args:Record<string,unknown>,signal?:AbortSignal)=>Promise<unknown>)=>({
    name,label:name,description:LITERATURE_FAMILIES.flatMap(f=>[...f.tools]).find(t=>t.name===name)!.description,
    parameters,
    async execute(_callId:string,args:Record<string,unknown>,signal?:AbortSignal){
      try{if(signal?.aborted)throw Error('文献操作已取消');return output(await run(args,signal))}
      catch(error){return output({error:{code:error instanceof LiteratureError?error.code:'operation_failed',message:error instanceof Error?error.message:'文献操作失败'}},true)}
    },
  })
  return [
    ...(flags.read?[
      tool('openalex_search',Type.Object({query:Type.String({minLength:1,maxLength:300}),from_year:Type.Optional(Type.Integer({minimum:1000,maximum:2100})),to_year:Type.Optional(Type.Integer({minimum:1000,maximum:2100})),limit:Type.Optional(Type.Integer({minimum:1,maximum:25}))},{additionalProperties:false}),async(p,signal)=>observe(await client.search({query:p.query as string,fromYear:p.from_year as number|undefined,toYear:p.to_year as number|undefined,limit:p.limit as number|undefined},signal),signal)),
      tool('openalex_lookup_doi',Type.Object({doi:Type.String({minLength:1,maxLength:600})},{additionalProperties:false}),async(p,signal)=>observe(await client.getByDoi(p.doi as string,signal),signal)),
    ]:[]),
    ...(flags.save&&!options.remote?[
      tool('literature_save',Type.Object({record_ids:Type.Array(Type.String(),{minItems:1,maxItems:25,uniqueItems:true}),directory:Type.String({description:'工作区内保存目录，使用 outputs/literature；每次新建独立子目录，不覆盖。'})},{additionalProperties:false}),async(p,signal)=>{
        if(!Array.isArray(p.record_ids)||!p.record_ids.length||p.record_ids.length>25||p.record_ids.some(id=>typeof id!=='string'||!cache.has(id)))throw Error('包含未查询、已过期或不属于本会话的记录，请先检索并选择实际返回的 recordId')
        const selected=[...new Set(p.record_ids as string[])].map(id=>cache.get(id)!)
        return saveReferences(workspace,p.directory as string,selected,signal)
      }),
    ]:[]),
  ]
}
