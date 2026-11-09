import {expect,it} from 'vitest'
import {方案期判} from '../../src/policy/plan-mode.js'
import {讨论拒绝理由} from '../../src/policy/execution-boundary.js'
import {routeTurnDenial} from '../../src/runtime/analysis-route-evidence.js'
import {科研契约目录工具名} from '../../src/protocol/plan.js'
it('allows only metadata querying through read-only gates, without granting code or writes',()=>{
 expect(方案期判(科研契约目录工具名,{}, {方案期:true,已批准:[],workspace:'/w'}).kind).toBe('allow')
 const discussion=[{type:'message',message:{role:'user',content:'先别运行，只讨论'}}]
 expect(讨论拒绝理由(科研契约目录工具名,discussion)).toBeUndefined()
 expect(讨论拒绝理由('write',discussion)).toBeTruthy()
 const view=[{type:'message',message:{role:'user',content:'[analysis_route_action] {"routeId":"r","revision":1,"stepId":"s","action":"view"}\n解释步骤'}}]
 expect(routeTurnDenial(科研契约目录工具名,view)).toBeUndefined()
 expect(routeTurnDenial('bash',view)).toBeTruthy()
})
