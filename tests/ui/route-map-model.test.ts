import { describe, expect, it } from 'vitest'
import { activeRouteStep, routeFocus, routeLayers, routeMapState } from '../../src/ui/route-map-model.js'
import { routeActionMessage } from '../../src/protocol/analysis-route.js'
import { route } from './analysis-route-fixture.js'
function graph(){const r=route();r.steps.push({...structuredClone(r.steps[0]!),id:'S2',dependencies:['S1']},{...structuredClone(r.steps[0]!),id:'S3',dependencies:['S1']});return r}
describe('route map model',()=>{
  it('uses real dependencies including parallel nodes, never array order or step numbering',()=>{
    const r=graph();r.steps=[r.steps[2]!,r.steps[0]!,r.steps[1]!]
    expect(routeLayers(r).map(layer=>layer.map(s=>s.id))).toEqual([['S1'],['S3','S2']])
    expect(routeFocus(r)?.id).toBe('S1')
    r.steps.find(s=>s.id==='S1')!.status='delivered'
    expect(routeFocus(r)?.id).toBe('S3')
  })
  it('only marks a busy turn linked to a valid continue action on the same route',()=>{
    const r=graph();const message=routeActionMessage(r,'S2','continue')
    expect(activeRouteStep(r,message,true)).toBe('S2')
    expect(activeRouteStep({...r,revision:2},message,true)).toBe('S2')
    expect(activeRouteStep(r,message,false)).toBeUndefined()
    for(const text of [routeActionMessage(r,'S2','view'),routeActionMessage(r,'S2','search'),'继续 S2','\n'+message,routeActionMessage({...r,routeId:'other'},'S2','continue'),routeActionMessage({...r,revision:2},'S2','continue'),message.replace('S2','missing')])expect(activeRouteStep(r,text,true)).toBeUndefined()
  })
  it('separates saved progress, actual activity, dependency waiting and approval waiting',()=>{
    const r=graph();const [s1,s2]=r.steps
    expect(routeMapState(r,s2!,undefined)).toBe('waiting')
    s1!.status='in_progress'
    expect(routeMapState(r,s1!,undefined)).toBe('recorded')
    expect(routeMapState(r,s1!,'S1')).toBe('active')
    expect(routeMapState(r,s1!,'S1',true)).toBe('awaiting')
    s1!.status='delivered'
    expect(routeMapState(r,s2!,undefined)).toBe('pending')
    s1!.needsReview=true
    expect(routeMapState(r,s1!,undefined)).toBe('review')
    expect(routeMapState(r,s2!,undefined)).toBe('waiting')
    s2!.blockers=['缺少样本']
    expect(routeMapState(r,s2!,undefined)).toBe('blocked')
    expect(routeFocus(r,'S2')?.id).toBe('S2')
  })
})
