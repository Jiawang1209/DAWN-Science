import {atom} from 'nanostores'
import type {CollaborationTab} from './collaboration-view.js'
export type CollaborationReturn={owner:string;kind:'subagent'|'bot';target:string;expanded:boolean;selection?:string|undefined;tab:CollaborationTab}
export const $collaborationReturn=atom<CollaborationReturn|undefined>(undefined)
export function rememberCollaborationReturn(origin:CollaborationReturn){$collaborationReturn.set({...origin})}
export function clearCollaborationReturn(){$collaborationReturn.set(undefined)}
export function pruneCollaborationReturn(main?:string,side?:string){const origin=$collaborationReturn.get();if(origin&&origin.owner!==main&&origin.owner!==side)clearCollaborationReturn()}
/** Consume even a mismatch so a stale origin cannot survive an unrelated entry point. */
export function takeCollaborationReturn(kind:CollaborationReturn['kind'],target:string,owner:string){
 const origin=$collaborationReturn.get();clearCollaborationReturn()
 return origin?.kind===kind&&origin.target===target&&origin.owner===owner?origin:undefined
}
