import { expect,it } from 'vitest'
import { routeTurnMarker,$routeTurnMarker } from '../../src/ui/state/route-activity.js'
import { $items } from '../../src/ui/state/transcript.js'
import { routeActionMessage } from '../../src/protocol/analysis-route.js'
import type { TranscriptItem } from '../../src/protocol/index.js'
import { route } from './analysis-route-fixture.js'
it('tracks a tool-only route turn, clears on completion, and ignores browsing/older running tools',()=>{
  const user:TranscriptItem={type:'turn',id:'user',who:'user',text:routeActionMessage(route(),'S1','continue'),final:true}
  const tool:TranscriptItem={type:'tool',id:'tool',name:'bash',input:{command:'sleep 1'},status:'running'}
  expect(routeTurnMarker([user])).toBeUndefined()
  expect(routeTurnMarker([user,tool])).toContain('[analysis_route_action]')
  expect(routeTurnMarker([user,{...tool,status:'ok'}])).toBeUndefined()
  expect(routeTurnMarker([tool,user])).toBeUndefined()
  expect(routeTurnMarker([user,tool,{...user,id:'other',text:'查看文件'}])).toBeUndefined()
  expect(routeTurnMarker([{...user,text:routeActionMessage(route(),'S1','view')},tool])).toBeUndefined()
})
it('does not notify the shell for tool output or streaming bytes within the same active route turn',()=>{
  const user:TranscriptItem={type:'turn',id:'u',who:'user',text:routeActionMessage(route(),'S1','continue'),final:true}
  const agent:TranscriptItem={type:'turn',id:'a',who:'agent',text:'a',final:false}
  const values:(string|undefined)[]=[];const off=$routeTurnMarker.subscribe(value=>values.push(value))
  $items.set([user,agent]);$items.set([user,{...agent,text:'abc'}]);$items.set([user,{...agent,text:'done',final:true}]);off();$items.set([])
  expect(values.filter(Boolean)).toHaveLength(1)
  expect(values.at(-1)).toBeUndefined()
})
