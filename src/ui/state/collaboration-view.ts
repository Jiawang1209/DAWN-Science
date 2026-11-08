import {atom} from 'nanostores'
import {useStore} from '@nanostores/react'
export type CollaborationTab='process'|'handoff'|'artifacts'|'records'
type View={selection?:string|undefined;tab:CollaborationTab;expanded:boolean;reopenInspection?:boolean;clarification?:{key:string;answers:string[]}|undefined}
const initial:View={tab:'process',expanded:false}
const views=atom<ReadonlyMap<string,View>>(new Map())
/** Window-only reading preferences, scoped by session. Never saved as execution state. */
export function useCollaborationView(owner?:string){
 const all=useStore(views),current=owner?all.get(owner)??initial:initial
 const update=(patch:Partial<View>)=>{
  if(!owner)return
  const next=new Map(views.get());next.delete(owner);next.set(owner,{...(next.get(owner)??views.get().get(owner)??initial),...patch})
  if(next.size>64)next.delete(next.keys().next().value!)
  views.set(next)
 }
 return{...current,update}
}

export function restoreCollaborationView(owner:string,patch:Partial<View>){
 const next=new Map(views.get());next.delete(owner);next.set(owner,{...initial,clarification:views.get().get(owner)?.clarification,...patch})
 if(next.size>64)next.delete(next.keys().next().value!)
 views.set(next)
}

export function resetCollaborationViews(){views.set(new Map())}
