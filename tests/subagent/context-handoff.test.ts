import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {captureHandoff,freezeHandoff,readHandoff,handoffPrompt} from '../../src/subagent/context-handoff.js'
const roots:string[]=[]
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
const branch=[
 {type:'message',id:'u',message:{role:'user',content:'只读原始数据；单位 m'}},
 {type:'message',id:'a',message:{role:'assistant',stopReason:'stop',content:[{type:'thinking',thinking:'secret thoughts'},{type:'text',text:'已确认路线；使用均值'}]}},
 {type:'message',id:'t',message:{role:'toolResult',content:'secret raw tool'}},
 {type:'message',id:'current',message:{role:'assistant',stopReason:'toolUse',content:[{type:'text',text:'incomplete'}]}},
]
it('selects only completed visible text and records exact provenance and UTF-8 bytes',()=>{
 const capsule=captureHandoff('parent',branch,2)
 expect(capsule.entries.map(e=>e.id)).toEqual(['u','a'])
 expect(capsule.bytes).toBe(Buffer.byteLength(capsule.entries.map(e=>e.text).join(''),'utf8'))
 expect(JSON.stringify(capsule)).not.toMatch(/secret|incomplete/)
 expect(handoffPrompt('task',capsule)).toContain('只读原始数据')
})
it('rejects invalid or excessive requests without silently truncating',()=>{
 for(const n of [0,9,1.5])expect(()=>captureHandoff('p',branch,n)).toThrow()
 expect(()=>captureHandoff('p',[{type:'message',id:'u',message:{role:'user',content:'中'.repeat(6000)}}],1)).toThrow(/上限/)
 expect(()=>captureHandoff('p',[],1)).toThrow()
})
it('freezes once across continuation and detects mismatched owner or edited snapshot',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dawn-handoff-'));roots.push(dir)
 const capsule=captureHandoff('p',branch,2)
 freezeHandoff(dir,capsule)
 const before=readFileSync(join(dir,'handoff.json'),'utf8')
 expect(readHandoff(dir,'p')).toEqual(capsule)
 expect(()=>readHandoff(dir,'q')).toThrow()
 expect(()=>freezeHandoff(dir,captureHandoff('p',branch.slice(0,1),1))).toThrow(/冻结/)
 expect(readFileSync(join(dir,'handoff.json'),'utf8')).toBe(before)
 const forged=JSON.parse(before);forged.entries[0].text='changed';writeFileSync(join(dir,'handoff.json'),JSON.stringify(forged))
 expect(()=>readHandoff(dir,'p')).toThrow()
})
