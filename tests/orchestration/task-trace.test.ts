import {expect,it} from 'vitest'
import {taskTrace} from '../../src/orchestration/task-trace.js'
it('projects bounded real tool metadata without outputs, commands or arbitrary input fields',()=>{
 const trace=taskTrace(Array.from({length:70},(_,n)=>({toolCallId:`r${n}`,name:'read',status:'done' as const,execution:'not_observed' as const,input:{path:'in.csv',secret:'private'},result:'private result'})))
 expect(trace.records).toHaveLength(64);expect(trace.omitted).toBe(6)
 expect(trace.records[0]).toEqual({toolCallId:'r6',name:'read',status:'done',execution:'not_observed',path:'in.csv'})
 expect(JSON.stringify(trace)).not.toContain('private')
})
it('omits malformed and overlong identity records instead of displaying a truncated invented ID',()=>{
 const t=taskTrace([{toolCallId:'x'.repeat(600),name:'read',status:'done',result:''},{toolCallId:'safe',name:'read',status:'done',result:''}])
 expect(t.records.map(r=>r.toolCallId)).toEqual(['safe']);expect(t.omitted).toBe(1)
})
