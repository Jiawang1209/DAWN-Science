import {describe,expect,it,vi} from 'vitest'
import {CrossrefClient} from '../../src/literature/crossref.js'
import {serialRequests} from '../../src/literature/request.js'
import {crossrefWork} from './crossref-fixtures.js'
const list=(items:unknown[]=[crossrefWork])=>({status:'ok',message:{'total-results':items.length,items}})
const single=(message:unknown)=>({status:'ok',message})
const immediate=async(task:()=>Promise<unknown>)=>task()
function client(body:unknown=list(),status=200){
  const network=vi.fn(async()=>Response.json(body,{status}))
  return {network,api:new CrossrefClient({fetch:network,schedule:immediate,now:()=>new Date('2026-10-25T00:00:00Z')})}
}
describe('Crossref 匿名客户端',()=>{
  it('收到 404 时若已停止，应返回取消而非未查到',async()=>{
    const abort=new AbortController()
    const api=new CrossrefClient({schedule:immediate,fetch:async()=>{abort.abort();return Response.json({},{status:404})}})
    await expect(api.getByDoi('10.1234/example',abort.signal)).rejects.toMatchObject({code:'cancelled'})
  })
  it('仅官方 URL，关键词/年份/期刊论文/条数，无任何认证或邮箱参数',async()=>{
    const {api,network}=client()
    const r=await api.search({query:'soil warming',fromYear:2020,toYear:2025,limit:5})
    const [input,init]=network.mock.calls[0] as unknown as [URL,RequestInit]
    const u=new URL(String(input))
    expect(u.origin).toBe('https://api.crossref.org')
    expect(u.searchParams.get('query.bibliographic')).toBe('soil warming')
    expect(u.searchParams.get('filter')).toBe('type:journal-article,from-pub-date:2020-01-01,until-pub-date:2025-12-31')
    expect(u.searchParams.get('rows')).toBe('5')
    expect(u.searchParams.has('mailto')).toBe(false)
    expect(new Headers(init.headers).has('authorization')).toBe(false)
    expect(init.redirect).toBe('error')
    expect(r).toMatchObject({source:'Crossref',retrievedAt:'2026-10-25T00:00:00.000Z',requestUrl:u.href,total:1,returned:1})
    expect(r.records[0]).toMatchObject({id:'https://doi.org/10.1234/example',doi:'https://doi.org/10.1234/example',authors:['A. Researcher','Soil Research Group'],title:crossrefWork.title[0],year:2024,date:'2024-05-10',journal:'Ecology Example',abstract:'Soil & microbial diversity changes.',abstractStatus:'available'})
    expect(r.records[0]?.sourceUrl).toBe('https://api.crossref.org/works/10.1234%2Fexample')
  })
  it('来源只有年份，不补造月日；缺失字段明确为空',async()=>{
    const {api}=client(list([{DOI:crossrefWork.DOI,title:['Partial metadata'],issued:{'date-parts':[[2024]]}}]))
    expect((await api.search({query:'soil'})).records[0]).toMatchObject({year:2024,date:null,authors:[],journal:null,abstract:null,abstractStatus:'missing',landingPageUrl:null})
  })
  it('摘要实体、标记和长度有界，不执行或展开外部实体',async()=>{
    const {api}=client(list([{...crossrefWork,abstract:'<p>&#x1F331; &lt;math&gt; &unknown; '+ 'x'.repeat(3000)+'</p>'}]))
    const r=(await api.search({query:'soil'})).records[0]!
    expect(r.abstractStatus).toBe('truncated');expect(r.abstract!.length).toBeLessThanOrEqual(2000)
    expect(r.abstract).toContain('🌱 <math> &unknown;')
  })
  it('单页保留总量，数量超预算或缺失 DOI/题名拒绝',async()=>{
    const c=client({...list(),message:{'total-results':2000,items:[crossrefWork]}})
    expect(await c.api.search({query:'soil',limit:1})).toMatchObject({total:2000,returned:1})
    expect(c.network).toHaveBeenCalledTimes(1)
    await expect(client(list([crossrefWork,crossrefWork])).api.search({query:'soil',limit:1})).rejects.toMatchObject({code:'invalid_response'})
    await expect(client(list([{title:['No DOI']}])).api.search({query:'soil'})).rejects.toMatchObject({code:'invalid_response'})
  })
  it('DOI 规范化后精确匹配；不同 DOI 不冒充核对成功',async()=>{
    expect(await client(single(crossrefWork)).api.getByDoi('DOI:10.1234/EXAMPLE')).toMatchObject({source:'Crossref',returned:1,query:{kind:'doi',value:'10.1234/example'}})
    await expect(client(single(crossrefWork)).api.getByDoi('10.1234/other')).rejects.toMatchObject({code:'source_mismatch'})
    expect(await client({},404).api.getByDoi('10.1234/missing')).toMatchObject({returned:0,records:[]})
  })
  it.each([{query:''},{query:'x',limit:26},{query:'x',fromYear:2025,toYear:2020},{query:'x',limit:1.5}])('坏参数不发请求：%j',async input=>{
    const {api,network}=client();await expect(api.search(input)).rejects.toMatchObject({code:'invalid_input'});expect(network).not.toHaveBeenCalled()
  })
  it.each([[429,'rate_limited'],[403,'access_denied'],[500,'service_error']])('HTTP %s 不当作零结果',async(status,code)=>{
    await expect(client({},Number(status)).api.search({query:'soil'})).rejects.toMatchObject({code})
  })
  it('非 JSON、错误信封和字节超限明确拒绝，释放响应体',async()=>{
    const cancel=vi.fn()
    const api=new CrossrefClient({schedule:immediate,fetch:async()=>new Response(new ReadableStream({cancel}),{headers:{'content-length':'9999999'}})})
    await expect(api.search({query:'soil'})).rejects.toMatchObject({code:'response_too_large'});expect(cancel).toHaveBeenCalledOnce()
    await expect(client({status:'error',message:{items:[],'total-results':0}}).api.search({query:'soil'})).rejects.toMatchObject({code:'invalid_response'})
    await expect(new CrossrefClient({schedule:immediate,fetch:async()=>new Response('<html>bad</html>')}).search({query:'soil'})).rejects.toMatchObject({code:'invalid_response'})
  })
  it('请求前取消与超时有独立错误',async()=>{
    const {api,network}=client(),abort=new AbortController();abort.abort()
    await expect(api.search({query:'soil'},abort.signal)).rejects.toMatchObject({code:'cancelled'});expect(network).not.toHaveBeenCalled()
    const hanging=new CrossrefClient({schedule:immediate,timeoutMs:5,fetch:async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('abort')),{once:true}))})
    await expect(hanging.search({query:'soil'})).rejects.toMatchObject({code:'timeout'})
  })
  it('多个客户端共用串行调度，等待中的请求可取消且不打断前一个请求',async()=>{
    const schedule=serialRequests(5),order:string[]=[]
    let release!:()=>void
    const first=schedule(async()=>{order.push('first');await new Promise<void>(r=>release=r);return 1})
    await vi.waitFor(()=>expect(order).toEqual(['first']))
    const abort=new AbortController(),second=schedule(async()=>{order.push('cancelled');return 2},abort.signal)
    abort.abort();await expect(second).rejects.toMatchObject({code:'cancelled'})
    const third=schedule(async()=>{order.push('third');return 3})
    expect(order).toEqual(['first']);release();expect(await first).toBe(1);expect(await third).toBe(3)
    expect(order).toEqual(['first','third'])
  })
  it('默认客户端共享请求间隔，跨会话也不突发并行请求',async()=>{
    const starts:number[]=[]
    const network:typeof fetch=async()=>{starts.push(Date.now());return Response.json(list())}
    await Promise.all([new CrossrefClient({fetch:network}).search({query:'a'}),new CrossrefClient({fetch:network}).search({query:'b'})])
    expect(starts[1]!-starts[0]!).toBeGreaterThanOrEqual(900)
  })
})
