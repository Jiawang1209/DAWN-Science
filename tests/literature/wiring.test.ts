import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NativeRuntime} from '../../src/runtime/native.js'
import {OpenAlexClient} from '../../src/literature/client.js'
import {插件册,pluginEnabled} from '../../src/tools/plugins.js'
import {work} from './fixtures.js'
const dirs:string[]=[]
afterEach(()=>{for(const p of dirs.splice(0))rmSync(p,{recursive:true,force:true})})
it('科研文献默认开启，明确关闭和已有插件状态保留',()=>{
  expect(pluginEnabled('literature',undefined)).toBe(true)
  expect(pluginEnabled('literature','')).toBe(true)
  expect(pluginEnabled('literature','0')).toBe(true)
  expect(pluginEnabled('literature','1')).toBe(false)
  for(const id of ['office','browser','memory'])expect(pluginEnabled(id,undefined)).toBe(true)
  expect(插件册.find(p=>p.id==='literature')!.族们().flatMap(f=>f.tools).map(t=>t.name)).toEqual(['openalex_search','openalex_lookup_doi','literature_save'])
})
it('真实 NativeRuntime 装配接通，保存经过原写权限门',async()=>{
  const ws=mkdtempSync(join(tmpdir(),'dawn-literature-runtime-'));dirs.push(ws)
  const gate=vi.fn(()=>({kind:'deny' as const,reason:'禁止保存测试'}))
  const runtime=new NativeRuntime({provenance:false,gate,literatureEnable:()=>({off:false,read:true,save:true}),literatureClient:()=>new OpenAlexClient({fetch:async()=>Response.json({meta:{count:1},results:[work]})})})
  const ts=(runtime as unknown as {toolsFor:(s:unknown)=>{name:string;execute:(id:string,args:unknown)=>Promise<any>}[]}).toolsFor({sessionId:'s',workspace:ws,sessionDir:join(ws,'.dawn/s')})
  const queried=await ts.find(t=>t.name==='openalex_search')!.execute('q',{query:'soil'})
  const result=JSON.parse(queried.content[0].text)
  const saved=await ts.find(t=>t.name==='literature_save')!.execute('save',{directory:'outputs/literature',record_ids:[result.records[0].recordId]})
  expect(saved).toMatchObject({isError:true})
  expect(saved.content[0].text).toContain('禁止保存测试')
  expect(gate).toHaveBeenCalledWith('write',{path:'outputs/literature'},expect.objectContaining({workspace:ws,sessionId:'s'}))
  expect(readdirSync(ws)).toEqual([])
})
