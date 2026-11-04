import {expect,it} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,linkSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path'
import {assertBatchOutputPaths} from '../../src/team/science-batch-paths.js'
it('rejects canonical directory aliases, hardlink outputs and input aliases before any write',()=>{
 const root=mkdtempSync(join(tmpdir(),'batch-paths-'));try{mkdirSync(join(root,'a'));symlinkSync('a',join(root,'b'));writeFileSync(join(root,'in.csv'),'source');linkSync(join(root,'in.csv'),join(root,'alias.csv'))
 expect(()=>assertBatchOutputPaths(root,[],['a/out.csv','b/out.csv'])).toThrow(/别名/);expect(()=>assertBatchOutputPaths(root,['in.csv'],['alias.csv'])).toThrow(/输入/);expect(()=>assertBatchOutputPaths(root,[],['in.csv','alias.csv'])).toThrow(/别名/);expect(()=>assertBatchOutputPaths(root,['in.csv'],['c/out.csv','d/out.csv'])).not.toThrow()
 }finally{rmSync(root,{recursive:true,force:true})}
})
it('refuses future output directory case aliases before either item writes files',()=>{
 const root=mkdtempSync(join(tmpdir(),'batch-case-paths-'));try{expect(()=>assertBatchOutputPaths(root,[],['results/a/analysis.py','results/A/analysis.py'])).toThrow(/别名/)}finally{rmSync(root,{recursive:true,force:true})}
})
