import {expect,it,vi} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path'
import {NativeRuntime} from '../../src/runtime/native.js'
import type {团队调度器} from '../../src/team/scheduler.js'
import type {团队} from '../../src/team/types.js'
import type {AnalysisRouteBook} from '../../src/runtime/analysis-route-book.js'
// @ts-expect-error deterministic localhost provider
import {startMockInferenceServer,mockModelsJson} from '../../scripts/mock-inference-server.mjs'
// @ts-expect-error deterministic localhost scenario
import {scienceTemplateScenario} from '../../scripts/mock-science-template.mjs'
it('derives a failed real-Pi batch, preserves source, reruns only failures, invalidates changed content and performs zero-request repeat adoption',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-incremental-pi-')),wrong=['other.csv'],server=await startMockInferenceServer({scenario:scienceTemplateScenario({wrongInputs:wrong})}),modelsPath=join(root,'models.json')
 writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)));for(const path of ['in.csv','other.csv'])writeFileSync(join(root,path),'x\n1\n2\n3\n4\n5\n')
 mkdirSync(join(root,'.dawn','agents'),{recursive:true});for(const name of ['check','analyze','review'])writeFileSync(join(root,'.dawn','agents',name+'.md'),`---\nname: ${name}\ndescription: fixture\ntools: read, write, bash\n---\nUse frozen contract.`)
 const runtime=new NativeRuntime({modelsPath,credentials:{read:async()=>({type:'api_key',key:'offline-mock'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},subagentChildEntry:resolve('dist/electron/subagent-child.js')})
 const internal=runtime as unknown as {botTeams:Map<string,{current:{id:string};scheduler:团队调度器}>;sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,args:unknown):Promise<{isError?:boolean;content:{text?:string}[]}>}}}>;routeBooks:Map<string,{book:AnalysisRouteBook}>}
 try{
 await runtime.start({sessionId:'p',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}})
 const book=internal.routeBooks.get('p')!.book,route=book.replace(0,{title:'fixture',goal:'mean',dataContext:[],steps:[{id:'s',title:'mean',purpose:'approved mean',inputs:['in.csv','other.csv'],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
 const start=internal.sessions.get('p')!.session.getToolDefinition('start_science_batch'),args={routeId:route.routeId,revision:route.revision,stepId:'s',executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'approved mean',template:{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block',validation:{version:1,column:'x',metric:'mean',unit:'m',missing:'block',absoluteTolerance:1e-9}},items:[{id:'a',label:'A',inputs:['in.csv'],dataPath:'in.csv'},{id:'b',label:'B',inputs:['other.csv'],dataPath:'other.csv'}],outputRoot:'results',maxRevisions:1}
 const launch=async(call:string,extra:Record<string,unknown>={},status='completed')=>{const result=await start.execute(call,{...args,revision:book.read()!.revision,...extra});expect(result.isError,JSON.stringify(result)).not.toBe(true);const c=internal.botTeams.get('p')!;await vi.waitFor(()=>expect(c.scheduler.读(c.current.id).scienceBatch?.status,JSON.stringify(c.scheduler.读(c.current.id).tasks)).toBe(status),{timeout:35000});await vi.waitFor(()=>expect(c.scheduler.hasActiveTeam(c.current.id)).toBe(false));if(status==='completed')await vi.waitFor(()=>expect(c.scheduler.读(c.current.id).pipeline?.routeSync).toBe('applied'));return c.scheduler.读(c.current.id)}
 const source=await launch('source',{},'blocked'),sourceFile=join(root,'session/teams',source.id,'team.json'),sourceBytes=readFileSync(sourceFile,'utf8')
 expect(source.scienceBatch?.items[0]?.completed?.status).toBe('completed');expect(source.tasks.find(t=>t.contract?.resultType==='model-metrics')?.receipt?.acceptance?.environment).toMatchObject({state:'known',executionBound:true})
 wrong.splice(0);const before=server.requests.length
 const derived=await launch('derived',{reuseFrom:{teamId:source.id,stateRevision:source.scienceBatch!.stateRevision}})
 expect(derived.scienceBatch?.items.map(i=>i.reuse?.mode),JSON.stringify(derived.scienceBatch?.items.map(i=>i.reuse))).toEqual(['reused','rerun']);expect(derived.tasks.filter(t=>!t.reusedFrom&&t.contract?.resultType==='model-metrics')).toHaveLength(1);expect(readFileSync(sourceFile,'utf8')).toBe(sourceBytes)
 const recoveryRequests=server.requests.length-before;expect(recoveryRequests).toBeGreaterThan(0);const newOutputs=derived.scienceBatch!.items[1]!.definition.outputs;expect(newOutputs.every(p=>p.includes(derived.id))).toBe(true);expect(derived.scienceBatch!.items[0]!.definition.outputs).toEqual(source.scienceBatch!.items[0]!.definition.outputs)
 const summary=JSON.parse(readFileSync(join(root,derived.scienceBatch!.summaryOutputs[0]!),'utf8'));expect(summary.items[0].reuse.mode).toBe('reused');expect(summary.items.every((i:any)=>i.data.metrics.mean===3)).toBe(true)
 const repeatBefore=server.requests.length,repeat=await launch('repeat',{reuseFrom:{teamId:derived.id,stateRevision:derived.scienceBatch!.stateRevision}})
 expect(repeat.scienceBatch?.items.map(i=>i.reuse?.mode)).toEqual(['reused','reused']);expect(server.requests.length).toBe(repeatBefore);expect(repeat.tasks.filter(t=>!t.reusedFrom)).toHaveLength(1)
 writeFileSync(join(root,'in.csv'),'x\n5\n4\n3\n2\n1\n');const changed=await launch('changed',{reuseFrom:{teamId:repeat.id,stateRevision:repeat.scienceBatch!.stateRevision}})
 expect(changed.scienceBatch?.items.map(i=>i.reuse?.mode),JSON.stringify({reuse:changed.scienceBatch?.items.map(i=>i.reuse),oldRoute:repeat.scienceBatch?.items[1]?.definition.route,newRoute:changed.scienceBatch?.items[1]?.definition.route})).toEqual(['rerun','reused']);expect(changed.scienceBatch?.items[0]?.reuse?.reason).toContain('已变化')
 }finally{await runtime.stop('p');await server.close();rmSync(root,{recursive:true,force:true})}
},120000)
