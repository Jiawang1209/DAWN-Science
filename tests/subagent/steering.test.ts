import {expect,it} from 'vitest'
import {createChildSteering} from '../../src/subagent/steering.js'
it('queues SDK steering and confirms only matching user message_start',async()=>{
 let listener:(event:unknown)=>void=()=>{};const texts:string[]=[],events:unknown[]=[]
 const control=createChildSteering({steer:async text=>{texts.push(text)},subscribe:cb=>{listener=cb;return()=>{}}},{childId:'child',epoch:2},event=>events.push(event))
 await control.receive({type:'steer',childId:'child',epoch:2,id:'steer-1',text:'correct'})
 expect(texts).toEqual(['[subagent-steer:steer-1:2]\ncorrect']);expect(events).toEqual([])
 listener({type:'message_end',message:{role:'user',content:texts[0]}});expect(events).toEqual([])
 listener({type:'message_start',message:{role:'assistant',content:texts[0]}});expect(events).toEqual([])
 listener({type:'message_start',message:{role:'user',content:[{type:'text',text:texts[0]}]}})
 expect(events).toEqual([{type:'steer_applied',childId:'child',epoch:2,id:'steer-1'}])
 await control.receive({type:'steer',childId:'child',epoch:2,id:'steer-1',text:'correct'});expect(texts).toHaveLength(1)
 await control.receive({type:'steer',childId:'child',epoch:1,id:'old',text:'old'});expect(texts).toHaveLength(1);control.close()
})
it('does not fabricate applied when SDK rejects or queues without message_start',async()=>{
 const events:unknown[]=[];const control=createChildSteering({steer:async()=>{throw Error('closed')},subscribe:()=>()=>{}},{childId:'child',epoch:1},event=>events.push(event))
 await control.receive({type:'steer',childId:'child',epoch:1,id:'steer-1',text:'correct'})
 expect(events).toEqual([{type:'steer_failed',childId:'child',epoch:1,id:'steer-1',error:'closed'}]);control.close()
})
