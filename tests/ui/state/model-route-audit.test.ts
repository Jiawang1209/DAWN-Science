import {beforeEach,expect,it} from 'vitest'
import {$sessionModels,$contextUsage,setSessionModel} from '../../../src/ui/state/catalog.js'
import {$activeSessionId} from '../../../src/ui/state/view.js'
import {loadContextUsage} from '../../../src/ui/state/sync.js'
beforeEach(()=>{$sessionModels.set({});$contextUsage.set(undefined);$activeSessionId.set('owner')})
it('restores the model pill from the current runtime rather than original agent configuration',async()=>{
 await loadContextUsage({get:async()=>({model:'deepseek-fixture',provider:'deepseek',bytes:{system:0,tools:0,history:0}})} as never,'owner')
 expect($sessionModels.get().owner).toEqual({model:'deepseek-fixture',provider:'deepseek'})
})
it.each(['switch','same-select','navigate'])('ignores a late usage sample after %s',async action=>{
 if(action==='same-select')setSessionModel('owner','deepseek-fixture','deepseek')
 let resolve!:(value:any)=>void
 const pending=loadContextUsage({get:()=>new Promise(r=>{resolve=r})} as never,'owner')
 if(action!=='navigate')setSessionModel('owner','deepseek-fixture','deepseek')
 else $activeSessionId.set('other')
 resolve({model:'kimi-fixture',provider:'moonshotai-cn',bytes:{system:0,tools:0,history:0}});await pending
 expect($sessionModels.get().owner).toEqual(action!=='navigate'?{model:'deepseek-fixture',provider:'deepseek'}:undefined)
 expect($sessionModels.get().other).toBeUndefined()
 expect($contextUsage.get()).toBeUndefined()
})
it('a late provider catalog cannot replace the order refreshed after an explicit model choice',async()=>{
 const {loadProviders}=await import('../../../src/ui/state/sync.js')
 const {$providers}=await import('../../../src/ui/state/catalog.js')
 let resolve!:(value:any)=>void
 const older=loadProviders({get:()=>new Promise(r=>{resolve=r})} as never)
 await loadProviders({get:async()=>({agents:[{agentId:'ds',kind:'native',provider:'deepseek',model:'ds'}],providers:[]})} as never)
 resolve({agents:[{agentId:'kimi',kind:'native',provider:'moonshotai-cn',model:'kimi'}],providers:[]});await older
 expect($providers.get().agents[0]?.provider).toBe('deepseek')
})
it('a passive model observation does not invalidate the overview reading the same session',async()=>{
 const {sessionModelSnapshotWriter}=await import('../../../src/ui/state/catalog.js')
 let resolve!:(value:any)=>void
 const pending=loadContextUsage({get:()=>new Promise(r=>{resolve=r})} as never,'owner')
 sessionModelSnapshotWriter('owner')({model:'deepseek-fixture',provider:'deepseek'})
 const usage={model:'deepseek-fixture',provider:'deepseek',bytes:{system:1,tools:2,history:7}}
 resolve(usage);await pending
 expect($contextUsage.get()).toEqual(usage)
 expect($sessionModels.get().owner).toEqual({model:'deepseek-fixture',provider:'deepseek'})
})
