import {describe,expect,it} from 'vitest'
import {withSessionContext} from '../../src/workbench/session-input-context.js'
import {parseRouteActionMessage} from '../../src/protocol/analysis-route.js'
import {routeTurnDenial} from '../../src/runtime/analysis-route-evidence.js'
describe('session context preserves scoped route action',()=>{
 it('keeps the strict first-line marker after trusted notebook context is added',()=>{
  const action='[analysis_route_action] {"routeId":"r","revision":1,"stepId":"S1","action":"view"}\n请查看本步'
  const sent=withSessionContext(action,'[笔记本新增输出]\n结果为 1')
  expect(parseRouteActionMessage(sent)).toEqual(parseRouteActionMessage(action))
  expect(routeTurnDenial('write',[{type:'message',message:{role:'user',content:sent}}])).toContain('仅授权本轮读取')
  expect(withSessionContext('普通消息','上下文')).toBe('上下文\n\n普通消息')
  expect(withSessionContext(action,undefined)).toBe(action)
 })
})
