import {expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {WorkbenchServer,type WorkbenchBackend} from '../../src/workbench/server.js'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
it('the real protocol exposes revision conflicts as user errors while unexpected storage failures stay private',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-budget-error-')),store=new OrchestrationStore(root,'p'),service=new OrchestrationService(store),internal=vi.fn()
 const backend={setRunBudget:async({limits,expectedRevision}:Parameters<WorkbenchBackend['setRunBudget']>[0])=>service.configureBudget(limits,expectedRevision)} as WorkbenchBackend
 const server=new WorkbenchServer(backend,{onInternalError:internal})
 try{
  await server.handle('setRunBudget',{sessionId:'p',expectedRevision:0,limits:{maxRuns:2}})
  const conflict=await server.handle('setRunBudget',{sessionId:'p',expectedRevision:0,limits:{maxRuns:3}})
  expect(conflict).toMatchObject({ok:false,error:{code:'invalid_request',message:expect.stringContaining('版本')}})
  expect(internal).not.toHaveBeenCalled()
  vi.spyOn(store,'configureBudget').mockImplementation(()=>{throw new Error('private storage payload')})
  const failure=await server.handle('setRunBudget',{sessionId:'p',expectedRevision:1,limits:{}})
  expect(failure).toMatchObject({ok:false,error:{code:'internal_error'}})
  expect(JSON.stringify(failure)).not.toContain('private storage payload')
 }finally{await service.close();rmSync(root,{recursive:true,force:true})}
})
