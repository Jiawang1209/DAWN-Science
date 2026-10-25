import {expect,it,vi} from 'vitest'
import {SraClient} from '../../src/science/sra.js'
import {GeoClient} from '../../src/science/geo.js'
const immediate=async(task:()=>Promise<unknown>)=>task()
const expxml='<Summary><Title>RNA &amp; DNA experiment</Title><Platform instrument_model="NovaSeq">ILLUMINA</Platform><Statistics total_runs="2" total_spots="10" total_bases="9007199254740993" total_size="55"/></Summary><Experiment acc="SRX123"/><Study acc="SRP123" name="Soil study"/><Sample acc="SRS123"/><Organism taxid="9606" ScientificName="Homo sapiens"/><Library_descriptor><LIBRARY_STRATEGY>RNA-Seq</LIBRARY_STRATEGY><LIBRARY_SOURCE>TRANSCRIPTOMIC</LIBRARY_SOURCE><LIBRARY_SELECTION>cDNA</LIBRARY_SELECTION><LIBRARY_LAYOUT><PAIRED/></LIBRARY_LAYOUT></Library_descriptor><Bioproject>PRJNA123</Bioproject><Biosample>SAMN123</Biosample>'
const runs='<Run acc="SRR123" total_spots="4" total_bases="8" is_public="true"/><Run acc="SRR124" total_spots="6" total_bases="12" is_public="false"/>'
function setup(options:{xml?:string;runs?:string;count?:number;empty?:boolean}={}){
 const network=vi.fn(async(input:URL)=>{
  const u=new URL(String(input))
  return u.pathname.endsWith('esearch.fcgi')?Response.json({esearchresult:{count:String(options.empty?0:options.count??1),idlist:options.empty?[]:['123']}}):Response.json({result:{uids:['123'],'123':{uid:'123',expxml:options.xml??expxml,runs:options.runs??runs}}})
 })
 return {network,client:new SraClient({fetch:network as typeof fetch,schedule:immediate,now:()=>new Date('2026-10-25T00:00:00Z')})}
}
it('SRA 以实验为查询单位，保留实际文库、运行和大整数，不把 spots 当 reads',async()=>{
 const {client,network}=setup(),r=await client.search({query:'soil',limit:1})
 expect(r).toMatchObject({source:'NCBI SRA',total:1,returned:1,query:{kind:'search',value:'soil'}})
 expect(r.records[0]).toMatchObject({accession:'SRX123',title:'RNA & DNA experiment',fields:{studyAccession:'SRP123',sampleAccession:'SRS123',platform:'ILLUMINA',instrument:'NovaSeq',libraryStrategy:'RNA-Seq',libraryLayout:'PAIRED',totalSpots:'10',totalBases:'9007199254740993'},runs:[{accession:'SRR123',spots:'4',bases:'8',public:true},{accession:'SRR124',public:false}]})
 expect(r.warnings.join('')).toContain('受限')
 expect(new URL(String(network.mock.calls[0]![0])).searchParams.get('db')).toBe('sra')
 expect(network).toHaveBeenCalledTimes(2)
})
it.each(['SRR123','SRX123','SRP123','SRS123'])('编号核验必须属于返回实验 %s',async accession=>{
 expect((await setup().client.getByAccession(accession)).records[0]?.accession).toBe('SRX123')
 await expect(setup().client.getByAccession(accession.replace('123','999'))).rejects.toMatchObject({code:'source_mismatch'})
})
it('Study 查询有界且明确显示总量；精确实验不能匹配多个实验',async()=>{
 const {client}=setup({count:100})
 // A single returned record cannot pretend a complete 20-record page.
 await expect(client.getByAccession('SRP123')).rejects.toMatchObject({code:'invalid_response'})
 await expect(setup({count:2}).client.getByAccession('SRX123')).rejects.toMatchObject({code:'source_mismatch'})
})
it('Run 列表截断必须告知，指定 Run 即使超过第40项也保留',async()=>{
 const many=Array.from({length:45},(_,i)=>`<Run acc="SRR${i+1}" is_public="true"/>`).join('')
 const {client}=setup({runs:many,xml:expxml.replace('total_runs="2"','total_runs="45"')})
 const r=await client.getByAccession('SRR45')
 expect(r.records[0]?.runs).toHaveLength(40)
 expect(r.records[0]?.runs?.some(r=>r.accession==='SRR45')).toBe(true)
 expect(r.warnings.join('')).toContain('40')
})
it('空结果不取摘要；缺失字段保留空值而不是造出平台或分组',async()=>{
 const a=setup({empty:true});expect(await a.client.search({query:'none'})).toMatchObject({returned:0,records:[]});expect(a.network).toHaveBeenCalledOnce()
 const r=await setup({xml:'<Summary><Title>Partial</Title></Summary><Experiment acc="SRX123"/>',runs:''}).client.search({query:'x'})
 expect(r.records[0]?.fields).toMatchObject({organism:null,platform:null,libraryLayout:null,totalSpots:null})
})
it.each(['<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x/>','<Summary><Title>bad</Summary>','<Experiment acc="SRX123"/><Experiment acc="SRX124"/>','<Summary><Title>X</Title></Summary><Experiment acc="bad"/>'])('无效 XML 或错误编号明确失败',async xml=>{
 await expect(setup({xml}).client.search({query:'x'})).rejects.toMatchObject({code:'invalid_response'})
})
it.each(['','SRR1&x=2','GSE123','PRJNA123','SRX../1'])('坏精确编号不发请求 %s',async value=>{
 const {client,network}=setup();await expect(client.getByAccession(value)).rejects.toMatchObject({code:'invalid_input'});expect(network).not.toHaveBeenCalled()
})
it('GEO 和 SRA 默认客户端共用 NCBI 串行限流，等待可取消',async()=>{
 const starts:number[]=[]
 const network:typeof fetch=async()=>{starts.push(Date.now());return Response.json({esearchresult:{count:'0',idlist:[]}})}
 const a=new GeoClient({fetch:network}).search({query:'x'})
 const abort=new AbortController(),cancelled=new SraClient({fetch:network}).search({query:'y'},abort.signal)
 abort.abort();await expect(cancelled).rejects.toMatchObject({code:'cancelled'})
 await a;await new SraClient({fetch:network}).search({query:'z'})
 expect(starts).toHaveLength(2);expect(starts[1]!-starts[0]!).toBeGreaterThanOrEqual(450)
})
