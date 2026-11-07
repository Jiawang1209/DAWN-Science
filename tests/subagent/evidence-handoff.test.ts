import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {captureEvidenceHandoff,handoffSources} from '../../src/subagent/handoff-sources.js'
import {childIdentity,OrchestrationStore} from '../../src/orchestration/store.js'
import {freezeHandoff,readHandoff} from '../../src/subagent/context-handoff.js'
import {prepareSubagentTask,type SubagentToolOptions} from '../../src/subagent/tool.js'
const roots:string[]=[]
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
const branch=[{id:'old',type:'message',message:{role:'user',content:'批准均值；mg/g；不要按降雨筛选'}},...Array.from({length:12},(_,i)=>({id:'later-'+i,type:'message',message:{role:'user',content:'later'}})),{id:'secret',type:'message',message:{role:'assistant',stopReason:'toolUse',content:[{type:'thinking',thinking:'secret'},{type:'text',text:'unfinished'}]}}]
const file={path:'out.json',sha256:'a'.repeat(64),bytes:10}
const childId=childIdentity('subagent',['call','0'],'p')
const child={id:childId,ownerSessionId:'p',kind:'subagent',state:'completed',epoch:1,label:'worker',address:['call','0'],updatedAt:1,result:{ok:true,output:'do not copy reasoning',receipt:{version:1,state:'accepted',summary:'historical',deliverables:[],versions:{version:1,inputs:[],outputs:[file]}}}}
it('selects early completed messages and historical host versions without inheriting intermediate reasoning',()=>{
 const capsule=captureEvidenceHandoff('p',branch,{recentMessages:1,messageIds:['old'],acceptedChildIds:[childId]},{children:[child] as never})
 expect(capsule.version).toBe(2);expect(capsule.entries[0]!.id).toBe('old')
 expect(JSON.stringify(capsule)).toContain(file.sha256)
 expect(JSON.stringify(capsule)).not.toMatch(/unfinished|secret|do not copy reasoning/)
 expect(handoffSources('p',branch,{children:[child] as never}).messages.some(m=>m.id==='old')).toBe(true)
})
it('rejects foreign, missing, active, incomplete or unsupported sources before freezing',()=>{
 for(const source of [{...child,id:childIdentity('subagent',['call','0'],'q')},{...child,state:'running'},{...child,result:{...child.result,receipt:{...child.result.receipt,versions:undefined}}}]){
  expect(()=>captureEvidenceHandoff('p',branch,{recentMessages:1,messageIds:['old'],acceptedChildIds:[childId]},{children:[source] as never})).toThrow()
 }
 for(const id of ['secret','missing'])expect(()=>captureEvidenceHandoff('p',branch,{recentMessages:1,messageIds:[id]},{})).toThrow()
 expect(()=>captureEvidenceHandoff('p',branch,{recentMessages:1,routeStepId:'missing'},{})).toThrow()
})
it('freezes selection and references across reads and detects reference or timestamp tampering',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dawn-evidence-handoff-'));roots.push(dir)
 const capsule=captureEvidenceHandoff('p',branch,{recentMessages:1,messageIds:['old'],acceptedChildIds:[childId]},{children:[child] as never})
 freezeHandoff(dir,capsule);expect(readHandoff(dir,'p')).toEqual(capsule)
 const raw=readFileSync(join(dir,'handoff.json'),'utf8')
 for(const mutate of [(v:any)=>v.createdAt++,(v:any)=>v.references[0].versions.outputs[0].sha256='b'.repeat(64)]){
  const v=JSON.parse(raw);mutate(v);writeFileSync(join(dir,'handoff.json'),JSON.stringify(v));expect(()=>readHandoff(dir,'p')).toThrow()
 }
})
it('uses the original child binding on retry and does not recapture newer parent facts or change permissions',()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-evidence-binding-'));roots.push(root)
 let captures=0
 const opts:SubagentToolOptions={sessionId:'p',projectRoot:root,taskStore:new OrchestrationStore(root,'p'),taskPolicy:()=> 'deny-risky',emit:()=>{},childOf:()=>({command:process.execPath,args:[]}),context:{cwd:root,provider:'fixture',model:'fixture',agentDirOf:()=>join(root,'run')},captureHandoff:s=>{captures++;return captureEvidenceHandoff('p',branch,s,{})}}
 const selection={recentMessages:1,messageIds:['old']}
 const first=prepareSubagentTask(opts,'call',0,{agent:'reader',handoff:selection},['read'])
 const before=readFileSync(join(root,'run','handoff.json'),'utf8')
 expect(prepareSubagentTask(opts,'call',0,{agent:'reader',handoff:selection},['read'])).toEqual(first)
 expect(captures).toBe(1);expect(readFileSync(join(root,'run','handoff.json'),'utf8')).toBe(before)
 expect(()=>prepareSubagentTask(opts,'call',0,{agent:'reader',handoff:{recentMessages:1,messageIds:['later-1']}},['read'])).toThrow(/冻结/)
 expect(()=>prepareSubagentTask(opts,'call',0,{agent:'reader',contract:{version:1,inputs:[],outputs:[],access:'read-only',requireExecution:false,requireReview:false}},['read'])).toThrow(/科研/)
 expect(first!.scope.tools).toEqual(['read']);expect(first!.scope.tier).toBe('deny-risky')
})
it('counts UTF-8 bytes exactly and refuses oversized text or envelopes without truncating evidence',()=>{
 const make=(text:string)=>[{id:'u',type:'message',message:{role:'user',content:text}}]
 const exact=captureEvidenceHandoff('p',make('中'.repeat(5461)+'x'),{recentMessages:1,messageIds:['u']},{})
 expect(exact.bytes).toBe(16384)
 expect(()=>captureEvidenceHandoff('p',make('中'.repeat(5462)),{recentMessages:1,messageIds:['u']},{})).toThrow(/上限/)
 const selection={recentMessages:1,messageIds:['old'],acceptedChildIds:[childId]}
 const base=captureEvidenceHandoff('p',branch,selection,{children:[child] as never})
 if(base.version!==2)throw new Error('expected v2')
 const expanded=structuredClone(child),pathLength=file.path.length+65536-base.envelopeBytes-(String(65536).length-String(base.envelopeBytes).length)
 expanded.result.receipt.versions.outputs[0]!.path='x'.repeat(pathLength)
 const full=captureEvidenceHandoff('p',branch,selection,{children:[expanded] as never})
 expect(full.version===2&&full.envelopeBytes).toBe(65536)
 const dir=mkdtempSync(join(tmpdir(),'dawn-handoff-boundary-'));roots.push(dir)
 freezeHandoff(dir,full);expect(readHandoff(dir,'p')).toEqual(full)
 expanded.result.receipt.versions.outputs[0]!.path+='x'
 expect(()=>captureEvidenceHandoff('p',branch,selection,{children:[expanded] as never})).toThrow()
})
