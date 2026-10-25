import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {crossrefTools,literatureTools} from '../../src/literature/tools.js'
import {CrossrefClient} from '../../src/literature/crossref.js'
import {OpenAlexClient} from '../../src/literature/client.js'
import {NativeRuntime} from '../../src/runtime/native.js'
import {pluginEnabled} from '../../src/tools/plugins.js'
import {方案期判} from '../../src/policy/plan-mode.js'
import {crossrefWork} from './crossref-fixtures.js'
import {work} from './fixtures.js'
const dirs:string[]=[]
afterEach(()=>{for(const p of dirs.splice(0))rmSync(p,{recursive:true,force:true})})
function workspace(){const p=mkdtempSync(join(tmpdir(),'dawn-crossref-'));dirs.push(p);return p}
const flags={off:false,read:true,save:true}
const client=()=>new CrossrefClient({schedule:async task=>task(),fetch:async url=>Response.json({status:'ok',message:new URL(String(url)).searchParams.has('rows')?{'total-results':1,items:[crossrefWork]}:crossrefWork})})
const tools=(ws=workspace())=>crossrefTools(ws,flags,{client:client()})
const data=(result:any)=>JSON.parse(result.content[0].text)
const call=(ts:any[],name:string,args:Record<string,unknown>)=>ts.find(t=>t.name===name)!.execute('test',args)
it('新插件默认开启，启用后工具名和族独立，远端无保存',()=>{
  expect(pluginEnabled('crossref',undefined)).toBe(true)
  expect(tools().map(t=>t.name)).toEqual(['crossref_search','crossref_lookup_doi','crossref_save'])
  expect(crossrefTools(workspace(),{...flags,off:true})).toEqual([])
  expect(crossrefTools(workspace(),flags,{client:client(),remote:true}).map(t=>t.name)).toEqual(['crossref_search','crossref_lookup_doi'])
})
it('实际所选记录保存为 Crossref 来源，未伪装成 OpenAlex',async()=>{
  const ws=workspace(),ts=tools(ws),r=data(await call(ts,'crossref_search',{query:'soil',from_year:2020,limit:2}))
  const saved=data(await call(ts,'crossref_save',{record_ids:[r.records[0].recordId],directory:'outputs/literature'}))
  const json=JSON.parse(readFileSync(join(ws,saved.paths[0]),'utf8')),md=readFileSync(join(ws,saved.paths[1]),'utf8')
  expect(json.records[0]).toMatchObject({origin:{source:'Crossref',query:{value:'soil',fromYear:2020}},record:{doi:'https://doi.org/10.1234/example'}})
  expect(md).toContain('Crossref 索引');expect(md).toContain('[Crossref API]');expect(md).not.toContain('OpenAlex')
})
it('双源与不同会话不能互借 UUID，失败不创建目录',async()=>{
  const ws=workspace(),a=literatureTools(ws,flags,{client:new OpenAlexClient({fetch:async()=>Response.json({meta:{count:1},results:[work]})})}),b=tools(ws),c=tools(ws)
  const ar=data(await call(a,'openalex_search',{query:'soil'})),br=data(await call(b,'crossref_search',{query:'soil'}))
  expect(await call(b,'crossref_save',{record_ids:[ar.records[0].recordId],directory:'outputs/literature'})).toMatchObject({isError:true})
  expect(await call(c,'crossref_save',{record_ids:[br.records[0].recordId],directory:'outputs/literature'})).toMatchObject({isError:true})
  expect(await call(b,'crossref_save',{record_ids:[br.records[0].recordId],directory:'../escape'})).toMatchObject({isError:true})
  expect(readdirSync(ws)).toEqual([])
})
it('真实 NativeRuntime 安装三项工具，保存调用原 write 门',async()=>{
  const ws=workspace(),gate=vi.fn(()=>({kind:'deny' as const,reason:'拒绝写入物证'}))
  const runtime=new NativeRuntime({provenance:false,gate,crossrefEnable:()=>flags,crossrefClient:client})
  const ts=(runtime as any).toolsFor({sessionId:'crossref-s',workspace:ws,sessionDir:join(ws,'.dawn/s')})
  expect(ts.find((t:any)=>t.name==='crossref_search')).toBeDefined()
  const r=data(await call(ts,'crossref_search',{query:'soil'}))
  expect(await call(ts,'crossref_save',{record_ids:[r.records[0].recordId],directory:'outputs/literature'})).toMatchObject({isError:true})
  expect(gate).toHaveBeenCalledWith('write',{path:'outputs/literature'},expect.objectContaining({workspace:ws,sessionId:'crossref-s'}))
  expect(readdirSync(ws)).toEqual([])
})
it('方案期放行查询，保存仍拒绝',()=>{
  const context={方案期:true,已批准:[],workspace:workspace()}
  expect(方案期判('crossref_search',{},context).kind).toBe('allow')
  expect(方案期判('crossref_lookup_doi',{},context).kind).toBe('allow')
  expect(方案期判('crossref_save',{directory:'outputs/literature'},context).kind).toBe('deny')
})
