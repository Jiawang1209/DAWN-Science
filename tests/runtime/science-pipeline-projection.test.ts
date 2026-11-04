import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {completedVersionedPipeline} from '../helpers/versioned-science.js'
import {projectPipelineRoute} from '../../src/runtime/science-pipeline-route.js'
import {SciencePipelineProjection} from '../../src/runtime/science-pipeline-projection.js'
import {sharedTaskOutputLocks,outputLockScope} from '../../src/bot/output-locks.js'
const roots:string[]=[];afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function root(){const path=mkdtempSync(join(tmpdir(),'dawn-projection-'));roots.push(path);return path}
it('refuses changed same-path output before projecting delivered and retains the route revision',async()=>{
 const workspace=root(),{team,book}=await completedVersionedPipeline(workspace);writeFileSync(join(workspace,'out.csv'),'n\n2\n')
 expect(await projectPipelineRoute(book,team,{workspace})).toBe('conflict');expect(book.read()?.revision).toBe(1)
})
it('requires the owning context to remain current through asynchronous version verification',async()=>{
 const workspace=root(),{team,book}=await completedVersionedPipeline(workspace)
 expect(await projectPipelineRoute(book,team,{workspace,isCurrent:()=>false})).toBe('pending');expect(book.read()?.revision).toBe(1)
 expect(await projectPipelineRoute(book,team,{workspace})).toBe('applied');expect(book.read()?.steps[0]?.deliverables[0]?.note).toContain('sha256:')
})
it('closing the projection owner cancels a queued reservation and prevents any late route writes',async()=>{
 const workspace=root(),{team,book}=await completedVersionedPipeline(workspace),release=await sharedTaskOutputLocks.acquire(outputLockScope(workspace),undefined,new AbortController().signal)
 let updates=0
 const projection=new SciencePipelineProjection({workspace,read:()=>team,book:()=>book,alive:()=>true,settle:()=>{updates++},notice:()=>{}})
 try{projection.schedule(team);await projection.close();expect(updates).toBe(0);expect(book.read()?.revision).toBe(1)}finally{release();await projection.close()}
})
it('suspends scheduling during cancellation even if an onChange notification arrives synchronously',async()=>{
 const workspace=root(),{team,book}=await completedVersionedPipeline(workspace),release=await sharedTaskOutputLocks.acquire(outputLockScope(workspace),undefined,new AbortController().signal)
 Reflect.deleteProperty(team.pipeline!.definition,'initialVersions') // Legacy path has no I/O; late CAS would run before setImmediate.
 let updates=0;const projection=new SciencePipelineProjection({workspace,read:()=>team,book:()=>book,alive:()=>true,settle:()=>{updates++},notice:()=>{}})
 try{projection.schedule(team);const drained=projection.cancelPending();projection.schedule(team);await drained;release();await new Promise<void>(done=>setImmediate(done));expect(updates).toBe(0);expect(book.read()?.revision).toBe(1)}finally{release();await projection.close()}
})
