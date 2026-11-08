import {beforeEach,expect,it} from 'vitest'
import {rememberCollaborationReturn,takeCollaborationReturn,pruneCollaborationReturn,clearCollaborationReturn} from '../../src/ui/state/collaboration-return.js'
beforeEach(clearCollaborationReturn)
const origin={owner:'p',kind:'subagent' as const,target:'p#sub:c:0',expanded:true,selection:'run:r',tab:'records' as const}
it('consumes only matching targets once',()=>{
 rememberCollaborationReturn(origin);expect(takeCollaborationReturn('subagent','other','p')).toBeUndefined()
 rememberCollaborationReturn(origin);expect(takeCollaborationReturn('subagent',origin.target,'p')).toEqual(origin)
 expect(takeCollaborationReturn('subagent',origin.target,'p')).toBeUndefined()
})
it('does not route back to an owner no longer visible and clears stale targets',()=>{
 rememberCollaborationReturn(origin);pruneCollaborationReturn('other',undefined);expect(takeCollaborationReturn('subagent',origin.target,'p')).toBeUndefined()
 rememberCollaborationReturn(origin);expect(takeCollaborationReturn('subagent',origin.target,'other')).toBeUndefined()
 expect(takeCollaborationReturn('subagent',origin.target,'p')).toBeUndefined()
})
it('preserves a visible side owner while rejecting the wrong surface',()=>{
 rememberCollaborationReturn(origin);pruneCollaborationReturn('main','p');expect(takeCollaborationReturn('bot',origin.target,'p')).toBeUndefined()
})
