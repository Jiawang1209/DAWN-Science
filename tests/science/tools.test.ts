import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync,readFileSync,symlinkSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {geoTools,sraTools,uniprotTools} from '../../src/science/tools.js'
import {插件册,pluginEnabled} from '../../src/tools/plugins.js'
import {NativeRuntime} from '../../src/runtime/native.js'
import {方案期判} from '../../src/policy/plan-mode.js'
const dirs:string[]=[]
const ws=()=>{const d=mkdtempSync(join(tmpdir(),'dawn-science-data-'));dirs.push(d);return d}
afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true})})
const flags={off:false,read:true,save:true}
const report={source:'GEO' as const,retrievedAt:'2026-10-25T00:00:00Z',requestUrls:['https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gds&id=1'],query:{kind:'search' as const,value:'drought',limit:2},total:1,returned:1,warnings:[],records:[{accession:'GSE123',title:'Title [unsafe](https://evil.invalid)',sourceUrl:'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE123',fields:{organism:'plant',summary:null}}]}
const client=()=>({search:vi.fn(async()=>structuredClone(report)),getByAccession:vi.fn(async()=>structuredClone(report))})
const data=(result:any)=>JSON.parse(result.content[0].text)
const call=async(ts:any[],name:string,args:unknown)=>ts.find(t=>t.name===name)!.execute('t',args)
it('科研插件默认开启；明确关闭仍保留，GEO 独立三个工具',()=>{
 for(const id of ['literature','crossref','geo']){
  expect(pluginEnabled(id,undefined)).toBe(true);expect(pluginEnabled(id,'1')).toBe(false)
 }
 expect(插件册.find(p=>p.id==='geo')!.族们().flatMap(f=>f.tools).map(t=>t.name)).toEqual(['geo_search','geo_get_series','geo_save'])
 expect(geoTools(ws(),{...flags,off:true})).toEqual([])
 expect(geoTools(ws(),flags,{remote:true}).map(t=>t.name)).toEqual(['geo_search','geo_get_series'])
})
it('只保存本会话真实记录，不能伪造字段或跨会话；新目录不覆盖',async()=>{
 const root=ws(),ts=geoTools(root,flags,{client:client()}),queried=data(await call(ts,'geo_search',{query:'drought'}))
 const p={record_ids:[queried.records[0].recordId],directory:'outputs/datasets'}
 const saved=data(await call(ts,'geo_save',p)),again=data(await call(ts,'geo_save',p))
 expect(saved.paths).not.toEqual(again.paths)
 const record=JSON.parse(readFileSync(join(root,saved.paths[0]),'utf8'))
 expect(record.records[0]).toMatchObject({record:report.records[0],origin:{source:'GEO',query:{value:'drought'}}})
 expect(readFileSync(join(root,saved.paths[1]),'utf8')).toContain('Title \\[unsafe\\]')
 expect(await call(ts,'geo_save',{...p,record_ids:['invented']})).toMatchObject({isError:true})
 expect(await call(geoTools(root,flags,{client:client()}),'geo_save',p)).toMatchObject({isError:true})
})
it('保存拒绝越界路径和符号链接，不写外部目录',async()=>{
 const root=ws(),outside=ws(),ts=geoTools(root,flags,{client:client()}),r=data(await call(ts,'geo_search',{query:'x'}))
 for(const directory of ['../outside','outputs/datasets/../../else','/tmp/evil','outputs/datasets\\evil'])expect(await call(ts,'geo_save',{record_ids:[r.records[0].recordId],directory})).toMatchObject({isError:true})
 symlinkSync(outside,join(root,'outputs'))
 expect(await call(ts,'geo_save',{record_ids:[r.records[0].recordId],directory:'outputs/datasets'})).toMatchObject({isError:true});expect(readdirSync(outside)).toEqual([])
})
it('NativeRuntime 装配复用写门，方案期允许检索并拒绝保存',async()=>{
 const root=ws(),gate=vi.fn(()=>({kind:'deny' as const,reason:'GEO 保存被拒绝'}))
 const runtime=new NativeRuntime({provenance:false,gate,geoEnable:()=>flags,geoClient:client})
 const ts=(runtime as any).toolsFor({sessionId:'s',workspace:root,sessionDir:join(root,'.dawn/s')})
 const r=data(await call(ts,'geo_search',{query:'x'}))
 expect(await call(ts,'geo_save',{record_ids:[r.records[0].recordId],directory:'outputs/datasets'})).toMatchObject({isError:true})
 expect(gate).toHaveBeenCalledWith('write',{path:'outputs/datasets'},expect.objectContaining({workspace:root}))
 expect(readdirSync(root)).toEqual([])
 const context:any={workspace:root,sessionId:'s',方案期:true,已批准:[]}
 expect(方案期判('geo_search',{},context).kind).toBe('allow')
 expect(方案期判('geo_get_series',{},context).kind).toBe('allow')
 expect(方案期判('geo_save',{},context).kind).toBe('deny')
})

it('SRA 独立默认开、来源缓存隔离，Run 元数据随真实记录保存',async()=>{
 const root=ws(),source={...structuredClone(report),source:'NCBI SRA' as const,records:[{accession:'SRX123',title:'RNA sequencing',sourceUrl:'https://www.ncbi.nlm.nih.gov/sra/SRX123',fields:{libraryStrategy:'RNA-Seq'},runs:[{accession:'SRR123',spots:'10',bases:'50',public:true}]}]}
 const api={search:async()=>structuredClone(source),getByAccession:async()=>structuredClone(source)}
 const geo=geoTools(root,flags,{client:client()}),sra=sraTools(root,flags,{client:api})
 expect(pluginEnabled('sra',undefined)).toBe(true);expect(pluginEnabled('sra','1')).toBe(false)
 expect(sraTools(root,flags,{client:api,remote:true}).map(t=>t.name)).toEqual(['sra_search','sra_get_accession'])
 const a=data(await call(geo,'geo_search',{query:'x'})),b=data(await call(sra,'sra_get_accession',{accession:'SRR123'}))
 expect(await call(sra,'sra_save',{record_ids:[a.records[0].recordId],directory:'outputs/datasets'})).toMatchObject({isError:true})
 expect(await call(geo,'geo_save',{record_ids:[b.records[0].recordId],directory:'outputs/datasets'})).toMatchObject({isError:true})
 const saved=data(await call(sra,'sra_save',{record_ids:[b.records[0].recordId],directory:'outputs/datasets'}))
 expect(JSON.parse(readFileSync(join(root,saved.paths[0]),'utf8')).records[0]).toMatchObject({origin:{source:'NCBI SRA'},record:{accession:'SRX123',runs:[{accession:'SRR123'}]}})
 expect(readFileSync(join(root,saved.paths[1]),'utf8')).toContain('测序运行（Run）')
})
it('SRA 接入 NativeRuntime 写门，查询通过方案名单，保存拒绝',async()=>{
 const root=ws(),gate=vi.fn(()=>({kind:'deny' as const,reason:'SRA denied'}))
 const api={search:async()=>({...structuredClone(report),source:'NCBI SRA' as const}),getByAccession:async()=>({...structuredClone(report),source:'NCBI SRA' as const})}
 const runtime=new NativeRuntime({provenance:false,gate,sraEnable:()=>flags,sraClient:()=>api})
 const ts=(runtime as any).toolsFor({sessionId:'s',workspace:root,sessionDir:join(root,'.dawn/s')}),r=data(await call(ts,'sra_search',{query:'x'}))
 expect(await call(ts,'sra_save',{record_ids:[r.records[0].recordId],directory:'outputs/datasets'})).toMatchObject({isError:true})
 expect(gate).toHaveBeenCalledWith('write',{path:'outputs/datasets'},expect.objectContaining({workspace:root}))
 const context:any={workspace:root,sessionId:'s',方案期:true,已批准:[]}
 for(const name of ['sra_search','sra_get_accession'])expect(方案期判(name,{},context).kind).toBe('allow')
 expect(方案期判('sra_save',{},context).kind).toBe('deny')
})

it('UniProt 仅导出真实完整序列，FASTA 80列且头不注入新记录，缺失序列不伪造',async()=>{
 const root=ws(),sequence='A'.repeat(181),source={...structuredClone(report),source:'UniProt' as const,records:[{accession:'P04637',title:'Protein\n>badHeader',sourceUrl:'https://www.uniprot.org/uniprotkb/P04637/entry',fields:{sequenceStatus:'available'},sequence},{accession:'P12345',title:'Missing sequence',sourceUrl:'https://www.uniprot.org/uniprotkb/P12345/entry',fields:{sequenceStatus:'missing'}}]}
 const api={search:async()=>structuredClone(source),getByAccession:async()=>structuredClone(source)}
 const ts=uniprotTools(root,flags,{client:api}),r=data(await call(ts,'uniprot_search',{query:'x'}))
 expect(pluginEnabled('uniprot',undefined)).toBe(true);expect(pluginEnabled('uniprot','1')).toBe(false)
 expect(uniprotTools(root,flags,{remote:true}).map(t=>t.name)).toEqual(['uniprot_search','uniprot_get_accession'])
 const p={record_ids:r.records.map((r:any)=>r.recordId),directory:'outputs/proteins',sequence:'INVENTED'}
 expect(await call(ts,'uniprot_save',{...p,directory:'outputs/datasets'})).toMatchObject({isError:true})
 expect(await call(ts,'uniprot_save',{...p,directory:'outputs/proteins/../../other'})).toMatchObject({isError:true})
 const saved=data(await call(ts,'uniprot_save',p));expect(saved).toMatchObject({saved:2,sequencesSaved:1,sequencesUnavailable:1});expect(saved.paths).toHaveLength(3)
 const fasta=readFileSync(join(root,saved.paths.find((p:string)=>p.endsWith('.fasta'))),'utf8')
 expect(fasta).toBe('>P04637 Protein >badHeader\n'+'A'.repeat(80)+'\n'+'A'.repeat(80)+'\n'+'A'.repeat(21)+'\n')
 expect(fasta).not.toContain('P12345');expect(fasta).not.toContain('INVENTED')
 expect(JSON.parse(readFileSync(join(root,saved.paths[0]),'utf8')).records[0].record.sequence).toBe(sequence)
 const onlyMissing=data(await call(ts,'uniprot_save',{record_ids:[r.records[1].recordId],directory:'outputs/proteins'}))
 expect(onlyMissing.paths).toHaveLength(2);expect(onlyMissing.sequencesSaved).toBe(0)
 const geo=geoTools(root,flags,{client:client()})
 expect(await call(geo,'geo_save',{record_ids:[r.records[0].recordId],directory:'outputs/datasets'})).toMatchObject({isError:true})
})
it('UniProt 装配仍走写门，方案只查且拒绝跨会话记录',async()=>{
 const root=ws(),gate=vi.fn(()=>({kind:'deny' as const,reason:'UniProt denied'}))
 const api={search:async()=>({...structuredClone(report),source:'UniProt' as const}),getByAccession:async()=>({...structuredClone(report),source:'UniProt' as const})}
 const runtime=new NativeRuntime({provenance:false,gate,uniprotEnable:()=>flags,uniprotClient:()=>api})
 const ts=(runtime as any).toolsFor({sessionId:'s',workspace:root,sessionDir:join(root,'.dawn/s')}),r=data(await call(ts,'uniprot_search',{query:'x'}))
 expect(await call(ts,'uniprot_save',{record_ids:[r.records[0].recordId],directory:'outputs/proteins'})).toMatchObject({isError:true})
 expect(gate).toHaveBeenCalledWith('write',{path:'outputs/proteins'},expect.objectContaining({workspace:root}))
 const context:any={workspace:root,sessionId:'s',方案期:true,已批准:[]}
 for(const name of ['uniprot_search','uniprot_get_accession'])expect(方案期判(name,{},context).kind).toBe('allow')
 expect(方案期判('uniprot_save',{},context).kind).toBe('deny')
})
