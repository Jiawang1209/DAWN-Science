import {afterEach,describe,expect,it} from 'vitest'
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,symlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {literatureTools} from '../../src/literature/tools.js'
import {OpenAlexClient} from '../../src/literature/client.js'
import {方案期判} from '../../src/policy/plan-mode.js'
import {work} from './fixtures.js'
const dirs:string[]=[]
afterEach(()=>{for(const p of dirs.splice(0))rmSync(p,{recursive:true,force:true})})
const workspace=()=>{const p=mkdtempSync(join(tmpdir(),'dawn-literature-'));dirs.push(p);return p}
const flags={off:false,read:true,save:true}
function tools(ws=workspace(),remote=false){return literatureTools(ws,flags,{remote,client:new OpenAlexClient({fetch:async url=>Response.json(new URL(String(url)).searchParams.has('search')?{meta:{count:1},results:[work]}:work)})})}
async function call(ts:ReturnType<typeof tools>,name:string,args:Record<string,unknown>,signal?:AbortSignal){return ts.find(t=>t.name===name)!.execute('call',args,signal)}
const data=(r:Awaited<ReturnType<typeof call>>)=>JSON.parse(r.content[0]!.text)

describe('文献工具与保存',()=>{
  it('开关控制工具可见性，远端只读，不产生本地写入工具',()=>{
    expect(tools().map(t=>t.name)).toEqual(['openalex_search','openalex_lookup_doi','literature_save'])
    expect(literatureTools(workspace(),{...flags,off:true})).toEqual([])
    expect(literatureTools(workspace(),{...flags,save:false}).map(t=>t.name)).toEqual(['openalex_search','openalex_lookup_doi'])
    expect(tools(workspace(),true).map(t=>t.name)).toEqual(['openalex_search','openalex_lookup_doi'])
  })
  it('只有实际查到的所选记录可以保存，保留来源和全部原始检索条件',async()=>{
    const ws=workspace(),ts=tools(ws),report=data(await call(ts,'openalex_search',{query:'soil warming',from_year:2020,to_year:2025,limit:2}))
    report.records[0].title='invented replacement'
    report.records[0].authors.push('invented author')
    const saved=data(await call(ts,'literature_save',{record_ids:[report.records[0].recordId],directory:'outputs/literature'}))
    expect(saved.paths).toHaveLength(2)
    const json=JSON.parse(readFileSync(join(ws,saved.paths[0]),'utf8'))
    expect(json.records[0]).toMatchObject({record:{id:work.id,title:work.title},origin:{source:'OpenAlex',query:{kind:'search',value:'soil warming',fromYear:2020,toYear:2025,limit:2}}})
    expect(json.records[0].record.authors).not.toContain('invented author')
    const md=readFileSync(join(ws,saved.paths[1]),'utf8')
    expect(md).toContain(work.title);expect(md).toContain(work.id);expect(md).toContain('10.1234/example')
  })
  it('未经本会话查询的身份不能保存，且失败不写任何文件',async()=>{
    const ws=workspace(),ts=tools(ws)
    expect(await call(ts,'literature_save',{record_ids:['invented'],directory:'outputs/literature'})).toMatchObject({isError:true})
    expect(readdirSync(ws)).toEqual([])
  })
  it('两个会话的记录不能互相使用',async()=>{
    const ws=workspace(),a=tools(ws),b=tools(ws),r=data(await call(a,'openalex_search',{query:'soil'}))
    expect(await call(b,'literature_save',{record_ids:[r.records[0].recordId],directory:'outputs/literature'})).toMatchObject({isError:true})
  })
  it('连续保存创建不同目录，既有文件不覆盖',async()=>{
    const ws=workspace(),ts=tools(ws),r=data(await call(ts,'openalex_search',{query:'soil'}))
    const first=data(await call(ts,'literature_save',{record_ids:[r.records[0].recordId],directory:'outputs/literature'}))
    writeFileSync(join(ws,first.paths[0]),'user edit')
    const second=data(await call(ts,'literature_save',{record_ids:[r.records[0].recordId],directory:'outputs/literature'}))
    expect(second.paths).not.toEqual(first.paths)
    expect(readFileSync(join(ws,first.paths[0]),'utf8')).toBe('user edit')
  })
  it.each(['../escape','/tmp/escape','data/raw','outputs/literature/../../escape','outputs\\literature\\..\\escape'])('危险保存目录拒绝：%s',async directory=>{
    const ws=workspace(),ts=tools(ws),r=data(await call(ts,'openalex_search',{query:'soil'}))
    expect(await call(ts,'literature_save',{record_ids:[r.records[0].recordId],directory})).toMatchObject({isError:true})
    expect(readdirSync(ws)).toEqual([])
  })
  it('已有父目录符号链接拒绝，在外部不创建文件',async()=>{
    const ws=workspace(),outside=workspace(),ts=tools(ws),r=data(await call(ts,'openalex_search',{query:'soil'}))
    symlinkSync(outside,join(ws,'outputs'))
    expect(await call(ts,'literature_save',{record_ids:[r.records[0].recordId],directory:'outputs/literature'})).toMatchObject({isError:true})
    expect(readdirSync(outside)).toEqual([])
  })
  it('已停止的保存不写文件',async()=>{
    const ws=workspace(),ts=tools(ws),r=data(await call(ts,'openalex_search',{query:'soil'})),abort=new AbortController();abort.abort()
    expect(await call(ts,'literature_save',{record_ids:[r.records[0].recordId],directory:'outputs/literature'},abort.signal)).toMatchObject({isError:true})
    expect(readdirSync(ws)).toEqual([])
  })
  it('缓存有界，旧记录过期后不冒充仍可保存',async()=>{
    const ts=tools();let first=''
    for(let i=0;i<101;i++){const r=data(await call(ts,'openalex_search',{query:`soil ${i}`}));if(!i)first=r.records[0].recordId}
    expect(await call(ts,'literature_save',{record_ids:[first],directory:'outputs/literature'})).toMatchObject({isError:true})
  })
  it('方案期查询可用，保存仍被拒绝',()=>{
    const context={方案期:true,已批准:[],workspace:workspace()}
    expect(方案期判('openalex_search',{},context).kind).toBe('allow')
    expect(方案期判('openalex_lookup_doi',{},context).kind).toBe('allow')
    expect(方案期判('literature_save',{directory:'outputs/literature'},context).kind).toBe('deny')
  })
  it('网络错误作为工具失败返回，不能变为空结果',async()=>{
    const ts=literatureTools(workspace(),flags,{client:new OpenAlexClient({fetch:async()=>{throw Error('network')}})})
    expect(await call(ts,'openalex_search',{query:'soil'})).toMatchObject({isError:true})
  })
})
