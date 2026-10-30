import type {BotStore} from "../store/bots.js"
/** Durable outbox. A successful send must mean a prompt was accepted, not UI visibility. */
export class BotDelivery {
 private flushing=new Map<string,Promise<void>>()
 private suspended=new Set<string>()
 private dirty=new Set<string>()
 resume(owner:string):void{this.suspended.delete(owner)}
 constructor(private readonly opts:{store:BotStore;busy(id:string):boolean;history(id:string):Promise<string>;send(id:string,text:string):Promise<void>}){}
 flush(owner:string):Promise<void>{
  const previous=this.flushing.get(owner);if(previous){this.dirty.add(owner);return previous}
  const work=this.once(owner).finally(()=>{this.flushing.delete(owner);if(this.dirty.delete(owner)&&!this.suspended.has(owner))queueMicrotask(()=>{void this.flush(owner).catch(error=>console.error("[Bot] delivery",error))})});this.flushing.set(owner,work);return work
 }
 private async once(owner:string){
  const results=this.opts.store.pendingResults(owner);if(!results.length)return
  if(this.opts.busy(owner))return
  const history=await this.opts.history(owner)
  const missing=results.filter(r=>!history.includes(`[bot-result:${r.resultId}]`))
  for(const r of results)if(!missing.includes(r))this.opts.store.markResultDelivered(r.resultId)
  if(!missing.length||this.suspended.has(owner))return
  const text="Bot Team 任务结果已返回。根据实际状态汇总交付；失败或取消不能说全部完成，尚未核验的产物请先核验。\n"+missing.map(r=>`[bot-result:${r.resultId}]\nBot ${r.botId} / ${r.teamId} / ${r.taskId} / ${r.status}\n${r.summary}\n产物：${r.artifacts.join("、")||"未提供已核验产物"}`).join("\n\n")
  try {await this.opts.send(owner,text)}catch{this.suspended.add(owner);return}
  // A write() return is not a durable receipt: native prompt preflight is asynchronous.
  const accepted = await this.opts.history(owner)
  for(const r of missing)if(accepted.includes(`[bot-result:${r.resultId}]`))this.opts.store.markResultDelivered(r.resultId)
  if(missing.some(r=>!accepted.includes(`[bot-result:${r.resultId}]`)))this.suspended.add(owner)
 }
}
