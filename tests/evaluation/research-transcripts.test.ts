import {expect,it} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {readResearchTranscripts} from '../../scripts/research-transcripts.js'
it('reads only one directly-owned transcript per host-bound child scope and preserves uncertainty',()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-reader-')),outside=mkdtempSync(join(tmpdir(),'dawn-research-outside-'))
 try{
  const path=join(root,'single/transcript');mkdirSync(path,{recursive:true})
  const entry={type:'message',message:{role:'user',content:'synthetic'}}
  writeFileSync(join(path,'session.jsonl'),JSON.stringify(entry)+'\n')
  const scope={scopeId:'single:1',relativeDirectory:'single/transcript'}
  expect(readResearchTranscripts(root,[scope])).toMatchObject({scopes:[{scopeId:'single:1',complete:true,entries:[entry]}],issues:[]})
  writeFileSync(join(path,'session.jsonl'),JSON.stringify(entry))
  expect(readResearchTranscripts(root,[scope]).scopes?.[0]?.complete).toBe(false)
  writeFileSync(join(path,'other.jsonl'),'{}\n')
  expect(readResearchTranscripts(root,[scope]).issues[0]?.reason).toBe('ambiguous')
  rmSync(join(path,'other.jsonl'));rmSync(join(path,'session.jsonl'));writeFileSync(join(outside,'secret.jsonl'),JSON.stringify(entry)+'\n');symlinkSync(join(outside,'secret.jsonl'),join(path,'session.jsonl'))
  expect(readResearchTranscripts(root,[scope]).scopes).toBeUndefined()
  rmSync(path,{recursive:true});symlinkSync(outside,path)
  expect(readResearchTranscripts(root,[scope]).scopes).toBeUndefined()
  expect(readResearchTranscripts(root,[{...scope,relativeDirectory:'../outside'}]).scopes).toBeUndefined()
 }finally{rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true})}
})
it('keeps a missing predecessor or invalid JSON visibly incomplete, never as a complete empty log',()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-research-reader-gap-'))
 try{
  mkdirSync(join(root,'member'));writeFileSync(join(root,'member/s.jsonl'),'not json\n')
  const result=readResearchTranscripts(root,[{scopeId:'a',relativeDirectory:'missing'},{scopeId:'b',relativeDirectory:'member'}])
  expect(result.issues.map(i=>i.reason)).toEqual(['missing','invalid'])
  expect(result.scopes).toBeUndefined()
 }finally{rmSync(root,{recursive:true,force:true})}
})
