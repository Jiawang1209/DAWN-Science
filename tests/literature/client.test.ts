import { describe, expect, it, vi } from 'vitest'
import { OpenAlexClient } from '../../src/literature/client.js'
import { work } from './fixtures.js'
const list = (results: unknown[] = [work]) => ({meta:{count:results.length},results})
function client(body: unknown = list(), status = 200) {
  const network = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(body,{status}))
  return {network, api:new OpenAlexClient({fetch:network,now:()=>new Date('2026-10-25T00:00:00Z')})}
}

describe('OpenAlex 客户端',()=>{
  it('HTTP 错误和过大响应头都取消未读取的响应体',async()=>{
    for(const status of [429,500,200]){
      const cancel=vi.fn()
      const body=new ReadableStream<Uint8Array>({cancel})
      const api=new OpenAlexClient({fetch:vi.fn(async()=>new Response(body,{status,headers:status===200?{'content-length':'9999999'}:{}}))})
      await expect(api.search({query:'soil'})).rejects.toBeInstanceOf(Error)
      expect(cancel).toHaveBeenCalledTimes(1)
    }
  })
  it('请求已开始后取消，不返回成功记录',async()=>{
    const controller=new AbortController()
    const api=new OpenAlexClient({fetch:vi.fn(async()=>{controller.abort();return Response.json(list())})})
    await expect(api.search({query:'soil'},controller.signal)).rejects.toMatchObject({code:'cancelled'})
  })
  it('精确发送关键词、年份、数量；只请求官方服务并记录来源',async()=>{
    const {api,network}=client()
    const r=await api.search({query:'soil warming',fromYear:2020,toYear:2025,limit:5})
    const u=new URL(String(network.mock.calls[0]![0]))
    expect(u.origin).toBe('https://api.openalex.org')
    expect(u.searchParams.get('search')).toBe('soil warming')
    expect(u.searchParams.get('filter')).toBe('from_publication_date:2020-01-01,to_publication_date:2025-12-31')
    expect(u.searchParams.get('per_page')).toBe('5')
    expect(network.mock.calls[0]![1]?.redirect).toBe('error')
    expect(r).toMatchObject({source:'OpenAlex',retrievedAt:'2026-10-25T00:00:00.000Z',total:1,returned:1,requestUrl:u.href})
    expect(r.records[0]).toMatchObject({id:work.id,title:work.title,year:2024,authors:['A. Researcher','B. Scientist'],journal:'Ecology Example',abstract:'Soil diversity changes',abstractStatus:'available',doi:work.doi,sourceUrl:work.id})
  })
  it('有界单页查询不自动翻页，保留总量和返回条数的区别',async()=>{
    const {api,network}=client({...list(),meta:{count:3000}})
    expect(await api.search({query:'soil',limit:1})).toMatchObject({total:3000,returned:1})
    expect(network).toHaveBeenCalledTimes(1)
  })
  it('未提供摘要、年份、期刊和 DOI 时明确为空',async()=>{
    const {api}=client(list([{id:work.id,title:'No abstract',doi:null,publication_year:null,authorships:[],primary_location:null,abstract_inverted_index:null}]))
    expect((await api.search({query:'soil'})).records[0]).toMatchObject({doi:null,year:null,journal:null,abstract:null,abstractStatus:'missing'})
  })
  it('摘要位置冲突不能拼造原文',async()=>{
    const {api}=client(list([{...work,abstract_inverted_index:{A:[0],B:[0]}}]))
    expect((await api.search({query:'soil'})).records[0]).toMatchObject({abstract:null,abstractStatus:'invalid'})
  })
  it('过长摘要明确截断',async()=>{
    const {api}=client(list([{...work,abstract_inverted_index:{['x'.repeat(3000)]:[0]}}]))
    const record=(await api.search({query:'soil'})).records[0]!
    expect(record.abstractStatus).toBe('truncated')
    expect(record.abstract!.length).toBeLessThanOrEqual(2000)
  })
  it('DOI 规范化后核对服务返回身份',async()=>{
    const {api,network}=client(work)
    const r=await api.getByDoi(' DOI:10.1234/EXAMPLE ')
    expect(r.query).toMatchObject({kind:'doi',value:'10.1234/example'})
    expect(decodeURIComponent(new URL(String(network.mock.calls[0]![0])).pathname)).toContain('https://doi.org/10.1234/example')
    expect(r.records[0]?.doi).toBe(work.doi)
  })
  it('DOI 404 为未查到，不能表述为该论文不存在',async()=>{
    const {api}=client({error:'not found'},404)
    expect(await api.getByDoi('https://doi.org/10.1234/missing')).toMatchObject({returned:0,total:0,records:[]})
  })
  it('服务返回其他 DOI 时拒绝冒充核验成功',async()=>{
    const {api}=client(work)
    await expect(api.getByDoi('10.1234/other')).rejects.toMatchObject({code:'source_mismatch'})
  })
  it.each([{query:''},{query:'x',limit:26},{query:'x',fromYear:2025,toYear:2020},{query:'x',limit:1.5},{query:'x'.repeat(301)}])('不合法搜索参数不发请求：%j',async args=>{
    const {api,network}=client()
    await expect(api.search(args)).rejects.toMatchObject({code:'invalid_input'})
    expect(network).not.toHaveBeenCalled()
  })
  it.each(['https://evil.example/10.1234/x','not-a-doi','10.1234/x\nsecret'])('非法 DOI 不发请求：%s',async doi=>{
    const {api,network}=client()
    await expect(api.getByDoi(doi)).rejects.toMatchObject({code:'invalid_input'})
    expect(network).not.toHaveBeenCalled()
  })
  it.each([[429,'rate_limited'],[403,'access_denied'],[500,'service_error']])('HTTP %s 与无结果区分',async(status,code)=>{
    const {api}=client({error:'upstream'},Number(status))
    await expect(api.search({query:'soil'})).rejects.toMatchObject({code})
  })
  it('坏响应和非 JSON 不被当成空结果',async()=>{
    await expect(client({results:[{id:work.id}]}).api.search({query:'soil'})).rejects.toMatchObject({code:'invalid_response'})
    const api=new OpenAlexClient({fetch:async()=>new Response('<html>error</html>')})
    await expect(api.search({query:'soil'})).rejects.toMatchObject({code:'invalid_response'})
  })
  it('响应字节预算超出后终止',async()=>{
    const api=new OpenAlexClient({maxBytes:80,fetch:async()=>Response.json(list())})
    await expect(api.search({query:'soil'})).rejects.toMatchObject({code:'response_too_large'})
  })
  it('已取消的查询不会发请求',async()=>{
    const {api,network}=client();const controller=new AbortController();controller.abort()
    await expect(api.search({query:'soil'},controller.signal)).rejects.toMatchObject({code:'cancelled'})
    expect(network).not.toHaveBeenCalled()
  })
  it('超时错误有独立状态',async()=>{
    const api=new OpenAlexClient({timeoutMs:5,fetch:async(_url,init)=>new Promise((_resolve,reject)=>{
      init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})
    })})
    await expect(api.search({query:'soil'})).rejects.toMatchObject({code:'timeout'})
  })
  it('结果链接只接受 HTTP(S)，不保留脚本地址',async()=>{
    const {api}=client(list([{...work,primary_location:{source:{display_name:'Journal'},landing_page_url:'javascript:alert(1)'}}]))
    expect((await api.search({query:'soil'})).records[0]?.landingPageUrl).toBeNull()
  })
})
