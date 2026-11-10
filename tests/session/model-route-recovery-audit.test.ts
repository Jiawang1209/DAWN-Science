import {expect,it} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import Database from 'better-sqlite3'
import {migrate} from '../../src/store/schema.js'
import {SessionStore} from '../../src/store/sessions.js'
import {SessionManager} from '../../src/session/manager.js'
import {FakeRuntime} from '../../src/runtime/fake.js'
it('resume checks the saved provider credential, allowing removal of the original provider',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-route-manager-')),db=new Database(':memory:');migrate(db)
 const store=new SessionStore(db),runtime=new FakeRuntime(),registry={agents:{kimi:{kind:'native' as const,provider:'moonshotai-cn',model:'kimi-fixture',capabilities:['chat' as const]}}}
 const first=new SessionManager({store,registry,runtimes:{native:runtime,pty:runtime},workspaceRoot:root})
 try{
  const record=await first.create('kimi',root);await first.stop(record.id)
  mkdirSync(join(record.sessionDir,'pi'),{recursive:true});writeFileSync(join(record.sessionDir,'pi/settings.json'),JSON.stringify({defaultProvider:'deepseek',defaultModel:'deepseek-fixture'}))
  const starts:any[]=[];const start=runtime.start.bind(runtime);runtime.start=async spec=>{starts.push(spec);return start(spec)}
  const manager=new SessionManager({store,registry,runtimes:{native:runtime,pty:runtime},workspaceRoot:root,hasCredential:provider=>provider==='deepseek'})
  await manager.resume(record.id)
  expect(starts.at(-1).native).toEqual({provider:'deepseek',model:'deepseek-fixture'})
  await manager.stop(record.id)
  const denied=new SessionManager({store,registry,runtimes:{native:runtime,pty:runtime},workspaceRoot:root,hasCredential:provider=>provider==='moonshotai-cn'})
  await expect(denied.resume(record.id)).rejects.toThrow('deepseek')
 }finally{await first.stopAll();db.close();rmSync(root,{recursive:true,force:true})}
})
