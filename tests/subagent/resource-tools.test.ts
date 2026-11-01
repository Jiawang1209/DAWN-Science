import { expect,it } from 'vitest'
import { createResourceTools } from '../../src/subagent/resource-tools.js'
it('only successful Skill reads copy the parent receipt into trusted tool details',async()=>{
 const skillRead={name:'eda',manifestPath:'/skills/eda/SKILL.md',resourcePath:'SKILL.md',scope:'project',via:'resource',contentSha256:'a'.repeat(64),partial:false}
 const tools=createResourceTools(async()=>JSON.stringify({kind:'skill',content:'text',skillRead}))
 const read=await tools[1]!.execute('r',{})
 expect(read.details).toEqual({skillRead})
 expect((await tools[0]!.execute('s',{})).details).toBeUndefined()
 expect((await createResourceTools(async()=>JSON.stringify({kind:'memory',content:'memory'}))[1]!.execute('m',{})).details).toBeUndefined()
 expect((await createResourceTools(async()=>{throw Error('denied')})[1]!.execute('e',{}))).toMatchObject({isError:true,details:undefined})
})
it('does not promote malformed read metadata into trusted details',async()=>{
 const tools=createResourceTools(async()=>JSON.stringify({kind:'skill',skillRead:{name:'forged'}}))
 expect((await tools[1]!.execute('r',{})).details).toBeUndefined()
})
