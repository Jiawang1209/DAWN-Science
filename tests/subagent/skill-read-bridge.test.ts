import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import { SubagentExecutor } from '../../src/subagent/executor.js'
import { createResourceTools } from '../../src/subagent/resource-tools.js'
import { 翻成子事件 } from '../../src/subagent/child-events.js'
import * as childProtocol from '../../src/subagent/protocol.js'
import { 读子转录 } from '../../src/subagent/run-dir.js'
import { 还原成条目 } from '../../src/workbench/restored-items.js'
import { SessionTranscripts } from '../../src/workbench/events.js'
import { 子转录id } from '../../src/protocol/subagent-id.js'
import { receipt as base } from '../fixtures/skill-read.js'

const receipt={...base,via:'resource' as const}
const dirs:string[]=[]
afterEach(()=>dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})))

describe('child Skill read evidence bridge',()=>{
  it('carries an actual resource tool result into the parent-owned child transcript',async()=>{
    const tools=createResourceTools(async()=>JSON.stringify({kind:'skill',content:'instruction text',skillRead:receipt}))
    const result=await tools.find(tool=>tool.name==='resource_read')!.execute('r',{id:'skill:soil'})
    const event=翻成子事件({type:'tool_execution_end',toolCallId:'r',toolName:'resource_read',result})!
    expect(event).toMatchObject({kind:'tool_end',skillRead:receipt})
    const hub=new SessionTranscripts({terminalMaxChars:1000})
    hub.track('parent','native')
    hub.ingest('parent',{kind:'subagent_start',sessionId:'parent',toolCallId:'delegation',index:0,agent:'scout',task:'Read the workflow'})
    hub.ingest('parent',{kind:'subagent_event',sessionId:'parent',toolCallId:'delegation',index:0,event})
    expect(hub.subscribe(子转录id('parent','delegation',0)).items).toEqual(expect.arrayContaining([expect.objectContaining({type:'tool',name:'resource_read',status:'ok',skillRead:receipt})]))
  })
  it.each([
    {isError:true}, {result:{isError:true,content:[],details:{skillRead:receipt}}}, {interrupted:true},
    {result:{content:[],details:{skillRead:{...receipt,contentSha256:'bad'}}}}, {toolName:'bash'},
  ])('does not forward an invalid or unsuccessful read receipt: %o',change=>{
    const event=翻成子事件({type:'tool_execution_end',toolCallId:'r',toolName:'resource_read',result:{content:[{text:'instructions'}],details:{skillRead:receipt}},...change})
    expect(event).not.toHaveProperty('skillRead')
  })
  it('preserves child interruption state without calling it a successful read',()=>{
    expect(翻成子事件({type:'tool_execution_end',toolCallId:'r',toolName:'resource_read',interrupted:true,result:{content:[],details:{skillRead:receipt}}})).toMatchObject({interrupted:true,isError:true})
  })
  it('strictly validates the child wire event contract, including receipt success state',()=>{
    expect(childProtocol).toHaveProperty('子事件Schema')
    const schema=(childProtocol as unknown as {子事件Schema:{safeParse:(v:unknown)=>{success:boolean}}}).子事件Schema
    const event={kind:'tool_end',toolCallId:'r',toolName:'resource_read',isError:false,text:'instructions',truncated:false,bytes:12,skillRead:receipt}
    expect(schema.safeParse(event).success).toBe(true)
    for(const change of [{unexpected:true},{skillRead:{...receipt,extra:true}},{isError:true},{interrupted:true},{toolName:'bash'}]) expect(schema.safeParse({...event,...change}).success).toBe(false)
    expect(schema.safeParse({kind:'tool_start',toolCallId:'r',toolName:'resource_read',input:undefined}).success).toBe(true)
  })
  it('validates receipts across the actual child stdout event boundary',async()=>{
    const valid={kind:'tool_end',toolCallId:'r',toolName:'resource_read',isError:false,text:'instructions',truncated:false,bytes:12,skillRead:receipt}
    const events=[valid,{...valid,toolCallId:'bad',skillRead:{...receipt,contentSha256:'bad'}},{...valid,toolCallId:'failed',isError:true}]
    const seen:unknown[]=[]
    const executor=new SubagentExecutor({
      context:{provider:'offline',model:'mock',cwd:'/tmp',agentDirOf:()=>'/tmp/unused-child-receipt'},
      childOf:()=>({command:process.execPath,args:['-e',`process.stdin.resume();process.stdin.on('end',()=>{for(const event of ${JSON.stringify(events)})process.stdout.write(JSON.stringify({type:'event',event})+'\\n');process.stdout.write(JSON.stringify({type:'done',ok:true,output:'done'})+'\\n')})`]}),
      onProgress:progress=>{if(progress.type==='event')seen.push(progress.event)},
    })
    await executor.run({mode:'single',agent:'scout',task:'read'},[{name:'scout',description:'read workflow',systemPrompt:'Read workflow',source:'builtin'}] as never)
    expect(seen).toEqual([valid])
  })
  it('restores an SDK-persisted resource receipt into the same ToolItem metadata',()=>{
    const dir=mkdtempSync(join(tmpdir(),'dawn-child-skill-history-'));dirs.push(dir)
    const manager=SessionManager.create(dir,join(dir,'transcript'))
    manager.appendMessage({role:'assistant',content:[{type:'toolCall',id:'r',name:'resource_read',arguments:{id:'skill:soil'}}],api:'openai-completions',provider:'offline',model:'mock',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'toolUse',timestamp:1} as never)
    manager.appendMessage({role:'toolResult',toolCallId:'r',toolName:'resource_read',content:[{type:'text',text:'instruction text'}],details:{skillRead:receipt},isError:false,timestamp:2} as never)
    const items=读子转录(dir)!.map(还原成条目)
    expect(items[0]).toMatchObject({type:'tool',id:'r',status:'ok',skillRead:receipt})
  })
})
