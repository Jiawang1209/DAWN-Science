import {expect,it,vi} from 'vitest'
import {UniProtClient} from '../../src/science/uniprot.js'
const immediate=async(task:()=>Promise<unknown>)=>task()
const protein={primaryAccession:'P04637',uniProtkbId:'P53_HUMAN',entryType:'UniProtKB reviewed (Swiss-Prot)',organism:{scientificName:'Homo sapiens',taxonId:9606},proteinDescription:{recommendedName:{fullName:{value:'Cellular tumor antigen p53'}}},genes:[{geneName:{value:'TP53'}}],comments:[{commentType:'FUNCTION',texts:[{value:'Synthetic function annotation.',evidences:[{source:'PubMed',id:'123'}]}]}],sequence:{value:'ACDEFG',length:6}}
function setup(items:unknown[]=[protein],total:string|null=String(items.length)){
 const network=vi.fn(async(_u:unknown,_init?:RequestInit)=>Response.json({results:items},{headers:total===null?{}:{'x-total-results':total}}))
 return {network,client:new UniProtClient({fetch:network,schedule:immediate,now:()=>new Date('2026-10-25T00:00:00Z')})}
}
it('官方字段检索，保留头部总量、实际序列、功能与来源，不把第一页当全部',async()=>{
 const {client,network}=setup([protein],'1000'),r=await client.search({query:'gene_exact:TP53 AND organism_id:9606',limit:1})
 expect(r).toMatchObject({source:'UniProt',total:1000,returned:1,retrievedAt:'2026-10-25T00:00:00.000Z'})
 expect(r.records[0]).toMatchObject({accession:'P04637',title:'Cellular tumor antigen p53',sequence:'ACDEFG',fields:{entryId:'P53_HUMAN',geneNames:['TP53'],organism:'Homo sapiens',reviewStatus:'reviewed',functionAnnotation:'Synthetic function annotation.',functionReferences:['PubMed:123'],sequenceLength:6,sequenceStatus:'available'}})
 const [url,init]=network.mock.calls[0]! as unknown as [URL,RequestInit]
 expect(url.origin).toBe('https://rest.uniprot.org');expect(url.pathname).toBe('/uniprotkb/search');expect(url.searchParams.get('size')).toBe('1')
 expect(url.searchParams.get('query')).toBe('gene_exact:TP53 AND organism_id:9606')
 expect(url.searchParams.get('fields')).toContain('cc_function');expect(new Headers(init.headers).has('authorization')).toBe(false);expect(init.redirect).toBe('error')
 expect(network).toHaveBeenCalledOnce();expect(r.warnings.join('')).toContain('1000')
})
it('主编号精确核验，大写规范化，不把次级编号映射当同一编号',async()=>{
 expect((await setup().client.getByAccession('p04637')).records[0]?.accession).toBe('P04637')
 await expect(setup().client.getByAccession('P12345')).rejects.toMatchObject({code:'source_mismatch'})
 expect(await setup([]).client.getByAccession('P04637')).toMatchObject({total:0,returned:0})
})
it('缺失注释和序列保留为空，unreviewed 不被 reviewed 子串误判',async()=>{
 const r=await setup([{primaryAccession:'A0A024RBG1',uniProtkbId:'A0A024RBG1_HUMAN',entryType:'UniProtKB unreviewed (TrEMBL)'}]).client.search({query:'x'})
 expect(r.records[0]).toMatchObject({fields:{proteinName:null,organism:null,reviewStatus:'unreviewed',functionAnnotation:null,sequenceStatus:'missing',sequenceLength:null}})
 expect(r.records[0]?.sequence).toBeUndefined()
})
it.each([{value:'ACD$EF',length:6},{value:'ACDEFG',length:5},{value:'ACDEFG',length:1.5}])('无效或长度不符序列不输出 %j',async sequence=>{
 await expect(setup([{...protein,sequence}]).client.search({query:'x'})).rejects.toMatchObject({code:'invalid_response'})
})
it('超长序列明确未纳入，不能把截断序列当完整序列导出',async()=>{
 const r=await setup([{...protein,sequence:{value:'A'.repeat(100001),length:100001}}]).client.search({query:'x'})
 expect(r.records[0]?.sequence).toBeUndefined();expect(r.records[0]?.fields.sequenceStatus).toBe('omitted_too_large');expect(r.warnings.join('')).toContain('100000')
})
it('功能注释与参考有界，忽略非 FUNCTION 注释',async()=>{
 const comments=[{commentType:'FUNCTION',texts:[{value:'x'.repeat(10001),evidences:Array.from({length:42},(_,i)=>({source:'PubMed',id:String(i+1)}))}]},{commentType:'DISEASE',texts:[{value:'Do not present as function.'}]}]
 const r=await setup([{...protein,comments}]).client.search({query:'x'})
 expect(r.records[0]?.fields.functionAnnotation).toHaveLength(10000);expect(r.records[0]?.fields.functionReferences).toHaveLength(40);expect(r.warnings.length).toBeGreaterThan(1)
})
it('头总量、记录数、主编号与 JSON 信封错误明确失败',async()=>{
 await expect(setup([protein],null).client.search({query:'x'})).rejects.toMatchObject({code:'invalid_response'})
 await expect(setup([protein],'0').client.search({query:'x'})).rejects.toMatchObject({code:'invalid_response'})
 await expect(setup([protein,protein]).client.search({query:'x'})).rejects.toMatchObject({code:'invalid_response'})
 await expect(new UniProtClient({schedule:immediate,fetch:async()=>Response.json({messages:['bad query']},{headers:{'x-total-results':'0'}})}).search({query:'x'})).rejects.toMatchObject({code:'invalid_response'})
})
it.each(['','P04637-2','../P04637','P04637&x=1'])('坏编号不发请求 %s',async value=>{
 const {client,network}=setup();await expect(client.getByAccession(value)).rejects.toMatchObject({code:'invalid_input'});expect(network).not.toHaveBeenCalled()
})
it('限流和取消不充当未查到',async()=>{
 const client=new UniProtClient({schedule:immediate,fetch:async()=>new Response('',{status:429})})
 await expect(client.search({query:'x'})).rejects.toMatchObject({code:'rate_limited'})
 const abort=new AbortController();abort.abort();await expect(client.search({query:'x'},abort.signal)).rejects.toMatchObject({code:'cancelled'})
})
