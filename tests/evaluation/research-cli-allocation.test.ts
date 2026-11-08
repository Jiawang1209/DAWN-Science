import {beforeEach,expect,it,vi} from 'vitest'
import {build} from 'esbuild'
import {runCurrentApiResearch} from '../../scripts/research-cli.js'
vi.mock('esbuild',()=>({build:vi.fn(async()=>{throw new Error('HOST_BUILD_REACHED')})}))
beforeEach(()=>vi.clearAllMocks())
it.each(['2','3'])('rejects staged total %s before building or spawning a credential host',async total=>{
 await expect(runCurrentApiResearch(['out','unused-profile','p','m','automatic-plan',total])).rejects.toThrow(/科研分组额度/)
 expect(build).not.toHaveBeenCalled()
})
it.each(['4','30','300'])('allows supported total %s to reach host build without starting a model in this test',async total=>{
 await expect(runCurrentApiResearch(['out','unused-profile','p','m','automatic-plan',total])).rejects.toThrow('HOST_BUILD_REACHED')
 expect(build).toHaveBeenCalledOnce()
})

it.each(['valid','over-total','unknown-task','duplicate-task'] as const)('validates batch file %s before host build and forwards a valid frozen batch',async kind=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path')
 const root=mkdtempSync(join(tmpdir(),'dawn-cli-batch-'))
 try{
  const batch={taskIds:kind==='unknown-task'?['unknown']:kind==='duplicate-task'?['carbon-missing','carbon-missing']:['short-known-mean','carbon-missing','unknown-unit'],repeats:2,perArmLimit:kind==='over-total'?26:25}
  const path=join(root,'batch.json');writeFileSync(path,JSON.stringify(batch))
  const run=runCurrentApiResearch(['out','unused-profile','p','m','automatic-plan','300',path])
  if(kind==='valid'){await expect(run).rejects.toThrow('HOST_BUILD_REACHED');expect(build).toHaveBeenCalledOnce()}
  else{await expect(run).rejects.toThrow(/批次/);expect(build).not.toHaveBeenCalled()}
 }finally{rmSync(root,{recursive:true,force:true})}
})
it('rejects an explicitly empty batch filename rather than silently running the legacy single task',async()=>{
 await expect(runCurrentApiResearch(['out','unused-profile','p','m','automatic-plan','300',''])).rejects.toThrow(/用法|批次/)
 expect(build).not.toHaveBeenCalled()
})
