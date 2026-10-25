import {expect,it} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readFileForPreview,TEXT_MAX_BYTES} from '../../src/files/access.js'
it('FASTA 作为字面文本预览，标题不是 Markdown 或分隔表',()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-fasta-'))
 try {
  const text='>P04637 name,source\nACDEFG\n'
  for(const name of ['sequences.fasta','sequence.FA','protein.faa','sequence.fna']){
   writeFileSync(join(root,name),text)
   expect(readFileForPreview(root,name)).toMatchObject({kind:'text',mediaType:'text/x-fasta',text})
  }
  writeFileSync(join(root,'large.fasta'),'A'.repeat(TEXT_MAX_BYTES+10))
  expect(readFileForPreview(root,'large.fasta')).toMatchObject({kind:'text',truncated:{originalBytes:TEXT_MAX_BYTES+10,keptBytes:TEXT_MAX_BYTES}})
 } finally {rmSync(root,{recursive:true,force:true})}
})
