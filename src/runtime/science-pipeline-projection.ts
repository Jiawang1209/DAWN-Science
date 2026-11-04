/** Lifecycle owner for asynchronous version checks before a synchronous route CAS. */
import type {团队} from '../team/types.js'
import type {AnalysisRouteBook} from './analysis-route-book.js'
import {projectPipelineRoute} from './science-pipeline-route.js'
export function projectionKey(team:团队):string{return JSON.stringify([team.pipeline?.requestId,team.pipeline?.currentTaskId,team.pipeline?.stateRevision,team.scienceBatch?.stateRevision])}
export class SciencePipelineProjection {
 private closed=false
 private suspended=false
 private pending=new Map<string,{key:string;controller:AbortController;work:Promise<void>}>()
 private attempted=new Map<string,string>()
 constructor(private opts:{workspace:string;read:(id:string)=>团队|undefined;book:()=>AnalysisRouteBook|undefined;alive:()=>boolean;settle:(id:string,status:'applied'|'conflict',key:string)=>void;notice:(error:unknown)=>void}){}
 schedule(team:团队):void {
  if(this.closed||this.suspended||!this.opts.alive()||team.scienceBatch&&team.scienceBatch.status!=='completed'||team.pipeline?.status!=='completed'||team.pipeline.routeSync!=='pending')return
  const key=projectionKey(team),old=this.pending.get(team.id)
  if(this.attempted.get(team.id)===key)return
  old?.controller.abort();this.attempted.set(team.id,key)
  const controller=new AbortController()
  const current=()=>{const now=this.opts.read(team.id);return !this.closed&&!this.suspended&&!controller.signal.aborted&&this.opts.alive()&&!!now&&projectionKey(now)===key&&now.pipeline?.status==='completed'&&now.pipeline.routeSync==='pending'}
  const work=Promise.resolve().then(async()=>{
   if(!current())return
   const book=this.opts.book(),status=book?await projectPipelineRoute(book,team,{workspace:this.opts.workspace,signal:controller.signal,isCurrent:current}):'conflict'
   if(status!=='pending'&&current())this.opts.settle(team.id,status,key)
  }).catch(error=>{if(current())this.opts.notice(error)}).finally(()=>{if(this.pending.get(team.id)?.controller===controller)this.pending.delete(team.id)})
  this.pending.set(team.id,{key,controller,work})
 }
 async cancelPending():Promise<void>{this.suspended=true;const entries=[...this.pending.values()];for(const [id,e] of this.pending){e.controller.abort();if(this.attempted.get(id)===e.key)this.attempted.delete(id)};await Promise.all(entries.map(e=>e.work))}
 resume():void{if(!this.closed)this.suspended=false}
 async close():Promise<void>{this.closed=true;await this.cancelPending()}
}
