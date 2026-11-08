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
