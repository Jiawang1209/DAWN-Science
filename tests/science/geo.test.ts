import {describe,expect,it,vi} from 'vitest'
import {GeoClient} from '../../src/science/geo.js'
import {scienceRequest} from '../../src/science/request.js'
const immediate=async(task:()=>Promise<unknown>)=>task()
const summary={uid:'200000123',accession:'GSE123',entrytype:'GSE',title:'Synthetic drought experiment',summary:'Plant transcriptome',taxon:'Arabidopsis thaliana',gdstype:'RNA-seq',n_samples:2,gpl:'1234',samples:[{accession:'GSM1',title:'Control'},{accession:'GSM2',title:'Drought'}],pubmedids:['123'],bioproject:'PRJNA123'}
const soft='^SERIES = GSE123\n!Series_title = Synthetic drought experiment\n!Series_overall_design = Three biological replicates.\n!Series_summary = Plant transcriptome\n!Series_sample_id = GSM1\n!Series_sample_id = GSM2\n!Series_platform_id = GPL1234\n'
function setup(options:{count?:number;docs?:unknown[];soft?:string}={}) {
 const docs=options.docs??[summary]
 const network=vi.fn(async(input:URL)=>{
  const url=new URL(String(input))
  if(url.pathname.endsWith('esearch.fcgi'))return Response.json({esearchresult:{count:String(options.count??docs.length),idlist:docs.map((_:unknown,i:number)=>String(200000123+i))}})
  if(url.pathname.endsWith('esummary.fcgi'))return Response.json({result:{uids:docs.map((_:unknown,i:number)=>String(200000123+i)),...Object.fromEntries(docs.map((d,i)=>[String(200000123+i),d]))}})
  return new Response(options.soft??soft)
 })
 return {network,client:new GeoClient({fetch:network as typeof fetch,schedule:immediate,now:()=>new Date('2026-10-25T00:00:00Z')})}
}
describe('GEO 官方元数据',()=>{
 it('强制 Series 单页检索，保留来源和未返回的总量，不取数据文件',async()=>{
  const {client,network}=setup({count:300})
  const r=await client.search({query:'drought',limit:1})
  expect(r).toMatchObject({source:'GEO',total:300,returned:1,retrievedAt:'2026-10-25T00:00:00.000Z',query:{kind:'search',value:'drought',limit:1}})
  expect(r.records[0]).toMatchObject({accession:'GSE123',title:summary.title,fields:{organism:summary.taxon,sampleCount:2,sampleAccessions:['GSM1','GSM2'],overallDesign:null}})
  const urls=network.mock.calls.map(c=>new URL(String(c[0])))
  expect(urls).toHaveLength(2);expect(urls[0]!.origin).toBe('https://eutils.ncbi.nlm.nih.gov')
  expect(urls[0]!.searchParams.get('term')).toBe('(drought) AND gse[ETYP]')
  expect(urls[0]!.searchParams.get('retmax')).toBe('1')
  expect(urls[0]!.searchParams.has('api_key')).toBe(false)
 })
 it('精确 GSE 核对，并从 SOFT brief 提取真实设计，不推测样本分组',async()=>{
  const {client,network}=setup(),r=await client.getByAccession('gse123')
  expect(r.records[0]?.fields.overallDesign).toBe('Three biological replicates.')
  expect(r.records[0]?.fields.platforms).toEqual(['GPL1234'])
  expect(r.requestUrls).toHaveLength(3)
  expect(new URL(String(network.mock.calls[2]![0])).searchParams.get('view')).toBe('brief')
  await expect(setup({soft:soft.replaceAll('GSE123','GSE124')}).client.getByAccession('GSE123')).rejects.toMatchObject({code:'source_mismatch'})
  await expect(setup({docs:[{...summary,accession:'GSE124'}]}).client.getByAccession('GSE123')).rejects.toMatchObject({code:'source_mismatch'})
 })
 it('没有结果不做后续请求；缺失字段为空，样本清单有界且明确告知',async()=>{
  const a=setup({docs:[]});expect(await a.client.search({query:'none'})).toMatchObject({total:0,records:[]});expect(a.network).toHaveBeenCalledTimes(1)
  const b=setup({docs:[{uid:'200000123',accession:'GSE123',title:'Partial',entrytype:'GSE'}]})
  expect((await b.client.search({query:'x'})).records[0]?.fields).toMatchObject({organism:null,sampleCount:null,summary:null,overallDesign:null})
  const c=setup({docs:[{...summary,samples:Array.from({length:42},(_,i)=>({accession:`GSM${i+1}`,title:`Sample ${i}`})),n_samples:42}]})
  const r=await c.client.search({query:'x'});expect(r.records[0]?.fields.sampleAccessions).toHaveLength(40);expect(r.warnings.join('')).toContain('40')
 })
 it.each(['','../GSE1','GSM123','GSE1&x=2'])('坏编号不发请求 %s',async value=>{
  const {client,network}=setup();await expect(client.getByAccession(value)).rejects.toMatchObject({code:'invalid_input'});expect(network).not.toHaveBeenCalled()
 })
 it.each([{query:''},{query:'x',limit:21},{query:'x',limit:1.5}])('坏查询不发请求 %j',async input=>{
  const {client,network}=setup();await expect(client.search(input)).rejects.toMatchObject({code:'invalid_input'});expect(network).not.toHaveBeenCalled()
 })
 it('错误信封、缺失记录、非 Series 不充当零结果',async()=>{
  for(const body of [{error:'bad'},{esearchresult:{count:'1',idlist:[]}},{esearchresult:{count:'0',idlist:[],ERROR:'bad query'}}]) {
   await expect(new GeoClient({fetch:async()=>Response.json(body),schedule:immediate}).search({query:'x'})).rejects.toMatchObject({code:'invalid_response'})
  }
  await expect(setup({docs:[{...summary,entrytype:'GSM'}]}).client.search({query:'x'})).rejects.toMatchObject({code:'invalid_response'})
 })
})
describe('科研请求预算和错误',()=>{
 it.each([[429,'rate_limited'],[403,'access_denied'],[500,'service_error']])('HTTP %s 明确失败',async(status,code)=>{
  await expect(scienceRequest('GEO',new URL('https://example.org'),{fetch:async()=>new Response('',{status:Number(status)})})).rejects.toMatchObject({code})
 })
 it('响应超限释放流、拒绝坏 JSON/UTF8；传输失败不当作无结果',async()=>{
  const cancel=vi.fn()
  await expect(scienceRequest('GEO',new URL('https://example.org'),{maxBytes:5,fetch:async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(10))},cancel}))})).rejects.toMatchObject({code:'response_too_large'})
  expect(cancel).toHaveBeenCalled()
  for(const value of ['<html>bad</html>',new Uint8Array([0xff])])await expect(scienceRequest('GEO',new URL('https://example.org'),{fetch:async()=>new Response(value)})).rejects.toMatchObject({code:'invalid_response'})
  await expect(scienceRequest('GEO',new URL('https://example.org'),{fetch:async()=>{throw Error('offline')}})).rejects.toMatchObject({code:'network_error'})
 })
 it('预先取消和请求超时有独立错误，取消优先于 HTTP 状态',async()=>{
  const abort=new AbortController();abort.abort();const network=vi.fn()
  await expect(scienceRequest('GEO',new URL('https://example.org'),{fetch:network},abort.signal)).rejects.toMatchObject({code:'cancelled'});expect(network).not.toHaveBeenCalled()
  await expect(scienceRequest('GEO',new URL('https://example.org'),{timeoutMs:5,fetch:async(_u,init)=>new Promise((_r,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('abort'))))})).rejects.toMatchObject({code:'timeout'})
  const later=new AbortController()
  await expect(scienceRequest('GEO',new URL('https://example.org'),{fetch:async()=>{later.abort();return new Response('',{status:429})}},later.signal)).rejects.toMatchObject({code:'cancelled'})
 })
})
