import {it,expect} from 'vitest'
import {bindToolRecords,selectToolRecord} from '../../src/orchestration/tool-record.js'
import type {SessionEntry} from '@earendil-works/pi-coding-agent'
const entries=(prefix:string,value:string)=>[
 {type:'message',id:prefix+'a',message:{role:'assistant',content:[{type:'toolCall',id:'same-call',name:'read',arguments:{path:value}}]}},
 {type:'message',id:prefix+'r',message:{role:'toolResult',toolCallId:'same-call',toolName:'read',content:[{type:'text',text:value}],isError:false}},
] as SessionEntry[]
const host={toolCallId:'same-call',name:'read',status:'done' as const,execution:'not_observed' as const,result:'data',input:{path:'data'}}
it('binds to Pi entry identities from this invocation, even if a preceding round reused the tool ID',()=>{
 const old=entries('old','previous'),fresh=entries('new','data')
 const [bound]=bindToolRecords([host],fresh,'/internal/new.jsonl')
 expect(bound?.transcriptRef).toMatchObject({file:'new.jsonl',callEntry:'newa',resultEntry:'newr'})
 expect(selectToolRecord([...old,...fresh],bound!)).toMatchObject({state:'available',input:'{\n  "path": "data"\n}',output:'data'})
 expect(selectToolRecord(old,bound!)).toEqual({state:'unavailable'})
})
it('refuses duplicate calls and a result entry of the wrong identity, order or status',()=>{
 const fresh=entries('new','data')
 expect(bindToolRecords([host,host],fresh,'x.jsonl')[0]?.transcriptRef).toBeUndefined()
 expect(bindToolRecords([host],[...fresh,...entries('dup','data')],'x.jsonl')[0]?.transcriptRef).toBeUndefined()
 const [bound]=bindToolRecords([host],fresh,'x.jsonl')
 expect(selectToolRecord(fresh,{...bound!,status:'error'})).toEqual({state:'unavailable'})
 expect(selectToolRecord([...fresh].reverse(),bound!)).toEqual({state:'unavailable'})
})
it('separates only the exact appended host tag from stdout, preserving marker-like tool content',()=>{
 const data='tool wrote [task_tool_evidence] as content'
 const marker='[task_tool_evidence] {"toolCallId":"same-call","name":"read","status":"done","execution":"not_observed","references":["verification.reviewed"],"path":"data","truncatedFields":[]}'
 const fresh=entries('new',data)
 const result=fresh[1] as unknown as {message:{content:{type:string;text:string}[]}}
 result.message.content.push({type:'text',text:marker})
 const [withTag]=bindToolRecords([host],fresh,'x.jsonl',true)
 expect(selectToolRecord(fresh,withTag!)).toMatchObject({state:'available',output:data,evidenceTag:marker})
 const [withoutTag]=bindToolRecords([host],fresh,'x.jsonl',false)
 expect(selectToolRecord(fresh,withoutTag!)).toMatchObject({state:'available',output:data+'\n'+marker})
})
