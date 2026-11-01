import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { 建调用, 工具清单, type 工具装配 } from '../../src/acp/tools.js'
import { loadSkillCatalog } from '../../src/skills/catalog.js'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, {recursive:true,force:true})))
function setup() {
  const dir = mkdtempSync(join(tmpdir(),'dawn-acp-skills-')); dirs.push(dir)
  const roots = ['project','global','builtin'].map(scope => ({path:join(dir,scope),scope:scope as 'project'|'global'|'builtin'}))
  roots.forEach(root => mkdirSync(root.path,{recursive:true}))
  const add = (scope:string,name:string,body:string,mode = '') => {
    const file = join(dir,scope,name,'SKILL.md'); mkdirSync(dirname(file),{recursive:true})
    writeFileSync(file,`---\nname: ${name}\ndescription: soil microbiome workflow ${scope}\n${mode}---\n${body}`)
    return file
  }
  const manifest = add('project','soil','project instruction')
  add('global','soil','shadow instruction')
  add('global','blocked','manual', 'disable-model-invocation: true\n')
  add('builtin','blocked','must remain shadowed')
  add('builtin','off','hidden','user-invocable: false\n')
  const read = vi.fn(), ledger = vi.fn()
  const options = {roots,workspace:join(dir,'project')}
  const ports: 工具装配 = {项目of:()=> 'p',列技能:async()=>[],查溯源:()=>undefined,记一笔:ledger,
    技能目录:()=>loadSkillCatalog(options),记录技能读取:read}
  return {dir,manifest,ports,read,ledger,call:建调用(ports),options}
}

describe('ACP shared Skill tools', () => {
  it('keeps existing aliases and advertises bounded paged search/read schemas', () => {
    const tools = 工具清单(false)
    expect(tools.map(tool=>tool.name)).toEqual(expect.arrayContaining(['dawn_list_skills','dawn_search_skills','dawn_use_skill']))
    expect(tools.find(tool=>tool.name==='dawn_use_skill')?.schema).toMatchObject({properties:{path:{type:'string'},limit:{maximum:4000}}})
  })
  it('uses the shared catalog for paged retrieval and filters before listing without exposing shadowed names', async () => {
    const {call,read} = setup()
    const search = JSON.parse((await call('s','dawn_search_skills',{query:'soil',limit:1})).文本)
    expect(search.items).toHaveLength(1)
    expect(search.items[0]).toMatchObject({name:'soil',scope:'project',match:{fields:expect.any(Array)}})
    expect(search.total).toBe(1)
    const list = await call('s','dawn_list_skills',{})
    expect(list.文本).toContain('soil')
    expect(list.文本).not.toMatch(/blocked|off/)
    expect(read).not.toHaveBeenCalled()
  })
  it('bounds the legacy list and directs callers to paged search for the remainder',async()=>{
    const {call,dir}=setup()
    for(let i=0;i<25;i++) {
      const file=join(dir,'global',`extra-${i}`,'SKILL.md');mkdirSync(dirname(file),{recursive:true})
      writeFileSync(file,`---\nname: extra-${i}\ndescription: extra workflow\n---\ntext`)
    }
    const response=await call('s','dawn_list_skills',{})
    expect(response.文本.split('\n').filter(line=>line.startsWith('- '))).toHaveLength(20)
    expect(response.文本).toContain('dawn_search_skills')
    expect(response.文本).toContain('20')
  })
  it('bounds diagnostics while reporting the original diagnostic count',async()=>{
    const {ports}=setup()
    ports.技能目录=()=>({skills:[],problems:Array.from({length:25},()=>({path:'x'.repeat(3000),reason:'y'.repeat(1000)}))})
    const body=JSON.parse((await 建调用(ports)('s','dawn_search_skills',{query:'soil'})).文本)
    expect(body.problems).toHaveLength(20)
    expect(body.problems[0].path.length).toBeLessThanOrEqual(2048)
    expect(body.problems[0].reason.length).toBeLessThanOrEqual(512)
    expect(body.problemsTotal).toBe(25)
    expect(body.problemsTruncated).toBe(true)
  })
  it('returns bounded text plus a typed ACP receipt, and records only successful reads', async () => {
    const {call,read,manifest,ledger} = setup()
    const response = await call('s','dawn_use_skill',{name:'soil',offset:0,limit:15})
    const body = JSON.parse(response.文本)
    expect(body.content).toHaveLength(15)
    const receipt = {name:'soil',manifestPath:manifest,resourcePath:'SKILL.md',scope:'project',via:'acp',partial:true,contentSha256:createHash('sha256').update(body.content).digest('hex')}
    expect(response.details?.skillRead).toEqual(receipt)
    expect(body.skillRead).toEqual(receipt)
    expect(read).toHaveBeenCalledWith('s',receipt,expect.any(String))
    expect(ledger).toHaveBeenCalledWith('s','acp_tool:dawn_use_skill',expect.objectContaining({出错:false,skillRead:receipt,toolCallId:expect.any(String)}))
  })
  it.each(['blocked','off','absent'])('does not read or issue a receipt for %s', async name => {
    const {call,read} = setup()
    expect((await call('s','dawn_use_skill',{name})).出错).toBe(true)
    expect(read).not.toHaveBeenCalled()
  })
  it('keeps package reference reads bounded and never accepts traversal or untyped arguments', async () => {
    const {call,manifest,read} = setup()
    mkdirSync(join(dirname(manifest),'references'))
    writeFileSync(join(dirname(manifest),'references','guide.md'),'A reference guide')
    expect(JSON.parse((await call('s','dawn_use_skill',{name:'soil',path:'references/guide.md'})).文本).skillRead).toMatchObject({resourcePath:'references/guide.md',via:'acp',partial:false})
    read.mockClear()
    for(const params of [{name:'soil',path:'../SKILL.md'},{name:'soil',limit:4001},{name:'soil',offset:-1},{name:'soil',allowManual:true}]) {
      expect((await call('s','dawn_use_skill',params)).出错).toBe(true)
    }
    expect(read).not.toHaveBeenCalled()
    expect((await call('s','dawn_search_skills',{query:'soil',limit:21})).出错).toBe(true)
  })
  it('consults authorization on every read and records no success when the gate denies', async () => {
    const {ports,options,manifest,read} = setup()
    let denied = false
    const catalog = loadSkillCatalog({...options,authorize:(_tool,params)=>denied && params.path===manifest ? 'gate denied' : undefined})
    ports.技能目录 = () => catalog
    const call = 建调用(ports)
    expect((await call('s','dawn_use_skill',{name:'soil'})).出错).toBeUndefined()
    read.mockClear(); denied = true
    expect((await call('s','dawn_use_skill',{name:'soil'})).出错).toBe(true)
    expect(read).not.toHaveBeenCalled()
  })
  it('does not fall back to legacy arbitrary manifest reads if no shared catalog was wired', async () => {
    const {ports,manifest,read} = setup()
    delete ports.技能目录
    ports.列技能 = async()=>[{name:'soil',description:'legacy',filePath:manifest}]
    expect((await 建调用(ports)('s','dawn_use_skill',{name:'soil'})).出错).toBe(true)
    expect(read).not.toHaveBeenCalled()
  })
})
