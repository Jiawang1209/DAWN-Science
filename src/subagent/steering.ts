/** A receipt is applied only when Pi emits the exact queued user message. */
import {z} from 'zod'
export const SteeringBindingSchema=z.object({childId:z.string().min(1),epoch:z.number().int().positive()}).strict()
export type SteeringBinding=z.infer<typeof SteeringBindingSchema>
export const SteerControlSchema=SteeringBindingSchema.extend({type:z.literal('steer'),id:z.string().min(1).max(512),text:z.string().min(1).max(16*1024)}).strict()
export type SteerControl=z.infer<typeof SteerControlSchema>
export const SteeringEventSchema=z.discriminatedUnion('type',[
 SteeringBindingSchema.extend({type:z.literal('steer_ready')}).strict(),
 SteeringBindingSchema.extend({type:z.literal('steer_applied'),id:z.string().min(1).max(512)}).strict(),
 SteeringBindingSchema.extend({type:z.literal('steer_failed'),id:z.string().min(1).max(512),error:z.string().max(2048)}).strict(),
])
export type SteeringEvent=z.infer<typeof SteeringEventSchema>
interface Session {steer(text:string):Promise<void>;subscribe(cb:(event:unknown)=>void):()=>void}
export function createChildSteering(session:Session,binding:SteeringBinding,emit:(event:SteeringEvent)=>void){
 const seen=new Map<string,string>(),pending=new Map<string,string>();let closed=false
 const unsubscribe=session.subscribe(raw=>{
  const event=raw as {type?:string;message?:{role?:string;content?:unknown}}
  if(closed||event.type!=='message_start'||event.message?.role!=='user')return
  const content=event.message.content,text=typeof content==='string'?content:Array.isArray(content)?content.filter(part=>part?.type==='text').map(part=>part.text).join(''):''
  for(const[id,expected]of pending)if(text===expected){pending.delete(id);emit({...binding,type:'steer_applied',id});break}
 })
 return{
  async receive(raw:unknown){
   const parsed=SteerControlSchema.safeParse(raw);if(closed||!parsed.success)return
   const request=parsed.data;if(request.childId!==binding.childId||request.epoch!==binding.epoch||seen.has(request.id)||seen.size>=128||pending.size>=8||Buffer.byteLength(request.text,'utf8')>16*1024)return
   const text=`[subagent-steer:${request.id}:${binding.epoch}]\n${request.text}`;seen.set(request.id,text);pending.set(request.id,text)
   try{await session.steer(text)}catch(error){pending.delete(request.id);emit({...binding,type:'steer_failed',id:request.id,error:(error instanceof Error?error.message:String(error)).slice(0,2048)})}
  },
  close(){closed=true;pending.clear();unsubscribe()},
 }
}
