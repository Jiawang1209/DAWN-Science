import {expect,it} from 'vitest'
import {RunOverviewChangedSchema} from '../../src/protocol/run-overview.js'
import {WORKBENCH_PROTOCOL_VERSION} from '../../src/protocol/version.js'
it('strictly carries only an owner and observation invalidation stamp',()=>{
 const value={type:'runOverviewChanged',ownerSessionId:'p',observerId:'observer',revision:0,workbenchProtocolVersion:WORKBENCH_PROTOCOL_VERSION}
 expect(RunOverviewChangedSchema.parse(value)).toEqual(value)
 for(const field of ['team','prompt','transcript','sessionId'])expect(RunOverviewChangedSchema.safeParse({...value,[field]:'secret'}).success).toBe(false)
 expect(RunOverviewChangedSchema.safeParse({...value,revision:-1}).success).toBe(false)
})
