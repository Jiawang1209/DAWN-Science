import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {方案簿} from '../../src/runtime/plan-book.js'
const roots:string[]=[]
afterEach(()=>{vi.restoreAllMocks();for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
function setup(){const root=mkdtempSync(join(tmpdir(),'dawn-plan-review-'));roots.push(root);const path=join(root,'plans.json');return{path,book:new 方案簿(path)}}
const selection={template:{id:'tabular-ecology' as const,version:1 as const,language:'python' as const,method:'mean',units:'m',missingValues:'block'},inputs:['input.csv'],outputRoot:'results',requireExecution:true,independentReview:false}
it('rolls back in-memory supersession and version allocation when a bound proposal cannot persist',()=>{
 const{path,book}=setup(),source=book.confirmPlanningSource('owner',selection,0,1),binding={revision:source.revision,fingerprint:source.fingerprint!}
 book.收('old','old','old body',binding);const persisted=readFileSync(path,'utf8')
 const write=vi.spyOn(book as unknown as {存:()=>void},'存').mockImplementationOnce(()=>{throw Error('disk unavailable')})
 expect(()=>book.收('new','new','new body',binding)).toThrow('disk unavailable')
 expect(book.可答('old').status).toBe('proposed');expect(book.找('new')).toBeUndefined();expect(readFileSync(path,'utf8')).toBe(persisted)
 write.mockRestore();expect(book.收('new','new','new body',binding).新.version).toBe(2)
 expect(new 方案簿(path).assertPlanningSource('new','owner')?.fingerprint).toBe(source.fingerprint)
})
it('refuses reused model call identifiers without superseding or selecting an older plan',()=>{
 const{path,book}=setup();book.收('reused','old','old body');const persisted=readFileSync(path,'utf8')
 expect(()=>book.收('reused','different','new body')).toThrow(/标识|重复/)
 expect(book.可答('reused')).toMatchObject({version:1,markdown:'old body'});expect(readFileSync(path,'utf8')).toBe(persisted)
})
