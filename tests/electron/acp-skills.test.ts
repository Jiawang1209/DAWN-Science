import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import type { 网关装配 } from '../../src/acp/gateway.js'
const captured = vi.hoisted(()=>({gateway:undefined as 网关装配 | undefined}))
vi.mock('../../src/acp/gateway.js',()=>({开网关:(ports: 网关装配)=>{captured.gateway=ports;return {地址:{path:'/unused',token:'test-only'},关掉:()=>{}}}}))
import { createWorkbench, type Workbench } from '../../src/electron/wiring.js'
import { ProjectStore } from '../../src/store/projects.js'
import { SessionStore } from '../../src/store/sessions.js'
import { SettingsStore } from '../../src/store/settings.js'
import { RunStore } from '../../src/store/runs.js'
import { memoryCredentials } from '../helpers/credentials.js'

let dirs: string[] = [], workbenches: Workbench[] = []
beforeEach(()=>{captured.gateway=undefined})
afterEach(()=>{workbenches.splice(0).forEach(wb=>wb.close());dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true}))})
function setup() {
  const dir=mkdtempSync(join(tmpdir(),'dawn-acp-wiring-'));dirs.push(dir)
  const project=join(dir,'project'),global=join(dir,'global'),builtin=join(dir,'builtin')
  for(const path of [project,global,builtin]) mkdirSync(path,{recursive:true})
  const add=(root:string,name:string,body:string)=>{const file=join(root,name,'SKILL.md');mkdirSync(dirname(file),{recursive:true});writeFileSync(file,`---\nname: ${name}\ndescription: soil workflow ${body}\nmetadata:\n  tags: [package-tag]\n---\n${body}`);return file}
  const manifest=add(join(project,'.dawn','skills'),'soil','project')
  add(global,'soil','global');add(global,'global-only','global');add(builtin,'builtin-only','builtin')
  const configPath=join(dir,'providers.yaml'),dbPath=join(dir,'state.db')
  writeFileSync(configPath,'agents:\n  external:\n    kind: acp\n    command: never-launch\n    args: []\n    capabilities: [chat]\n')
  const wb=createWorkbench({configPath,dbPath,credentials:memoryCredentials(),skillsDir:global,builtinSkillsDir:builtin,memoriesDir:join(dir,'memories'),scratchRoot:join(dir,'scratch'),agentsDir:join(dir,'agents'),dawnMcpEntry:'/never-launched.mjs'})
  workbenches.push(wb)
  new ProjectStore(wb.db).insert({projectId:'p',name:'isolated',workspace:project,createdAt:new Date().toISOString()})
  new SessionStore(wb.db).insert({id:'s',agentId:'external',workspace:project,sessionDir:join(dir,'session'),state:'alive',projectId:'p',createdAt:new Date().toISOString()})
  wb.events.track('s','acp');wb.events.subscribe('s')
  return {wb,dir,manifest,project,builtin,dbPath,settings:new SettingsStore(wb.db),gateway:captured.gateway!}
}

describe('desktop ACP Skill wiring',()=>{
  it('uses session roots, builtin modes and the same personal tag callback as native',async()=>{
    const {wb,manifest,settings,gateway}=setup()
    settings.set(`skill.tags.${resolve(manifest)}`,JSON.stringify(['my-personal-soil']),new Date().toISOString())
    settings.set('skill.mode.builtin-only','off',new Date().toISOString())
    const search=JSON.parse((await gateway.调用('s','dawn_search_skills',{query:'my-personal-soil'})).文本)
    expect(search.items[0]).toMatchObject({name:'soil',scope:'project',tags:['my-personal-soil']})
    const all=JSON.parse((await gateway.调用('s','dawn_search_skills',{query:''})).文本)
    expect(all.items.map((entry:{name:string})=>entry.name)).toEqual(['soil','global-only'])
    const skills=(wb.nativeRuntime as unknown as {opts:{skills:{tagOverride:(path:string)=>unknown}}}).opts.skills
    expect(skills.tagOverride(manifest)).toEqual(['my-personal-soil'])
    settings.set(`skill.tags.${resolve(manifest)}`,'[]',new Date().toISOString())
    expect(skills.tagOverride(manifest)).toEqual([])
    settings.set(`skill.tags.${resolve(manifest)}`,'invalid',new Date().toISOString())
    expect(skills.tagOverride(manifest)).toBeUndefined()
  })
  it('publishes a typed host read record and keeps its receipt in the existing durable ACP ledger',async()=>{
    const {wb,gateway,dbPath}=setup()
    const response=await gateway.调用('s','dawn_use_skill',{name:'soil'})
    const body=JSON.parse(response.文本)
    expect(body.skillRead).toMatchObject({name:'soil',via:'acp',scope:'project'})
    expect(wb.events.subscribe('s').items).toEqual(expect.arrayContaining([expect.objectContaining({type:'tool',name:'acp_skill_read',status:'ok',skillRead:body.skillRead})]))
    const records=new RunStore(wb.db).listByProject('p',{sessionId:'s'})
    const read=records.find(run=>run.requestType==='acp_tool:dawn_use_skill')!
    expect(JSON.parse(read.terminalReason!)).toMatchObject({skillRead:body.skillRead})
    expect(read.filesRead).toHaveLength(1)
    wb.close();workbenches=workbenches.filter(item=>item!==wb)
    const db=new Database(dbPath)
    try {expect(JSON.parse(new RunStore(db).get(read.runId)!.terminalReason!)).toMatchObject({skillRead:body.skillRead})} finally {db.close()}
  })
  it('never interprets the remote session workspace as a local project Skill root',async()=>{
    const {wb,gateway}=setup()
    wb.db.prepare("UPDATE sessions SET connection_id = 'remote-server' WHERE id = 's'").run()
    const result=JSON.parse((await gateway.调用('s','dawn_search_skills',{query:'soil'})).文本)
    expect(result.items.find((entry:{name:string})=>entry.name==='soil')).toMatchObject({scope:'global'})
    expect(result.items.some((entry:{scope:string})=>entry.scope==='project')).toBe(false)
  })
})
