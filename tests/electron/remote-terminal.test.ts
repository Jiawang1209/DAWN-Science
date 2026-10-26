import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkbench } from '../../src/electron/wiring.js'
import { memoryCredentials } from '../helpers/credentials.js'
import { startLoopbackSsh } from '../helpers/loopback-ssh.js'

const cleanups:(()=>Promise<void>)[]=[]
afterEach(async()=>{for(const f of cleanups.splice(0)) await f()})
async function setup(){
 const ssh=await startLoopbackSsh(),dir=mkdtempSync(join(tmpdir(),'dawn-shared-remote-'))
 const configPath=join(dir,'providers.yaml')
 writeFileSync(configPath,'agents:\n  chat:\n    kind: native\n    provider: deepseek\n    model: deepseek-flash\n    capabilities: [chat, exec]\n  shell:\n    kind: pty\n    command: /bin/bash\n    args: ["--noprofile", "--norc", "-i"]\n    capabilities: [exec]\n')
 const wb=createWorkbench({configPath,dbPath:join(dir,'app.db'),scratchRoot:join(dir,'scratch'),credentials:memoryCredentials({deepseek:'test-only'}),skillsDir:join(dir,'skills'),memoriesDir:join(dir,'memories'),agentsDir:join(dir,'agents')})
 cleanups.push(async()=>{await wb.closeAsync(3000);await ssh.close();rmSync(dir,{recursive:true,force:true})})
 const call=async(op:any,input:any)=>{const r=await wb.server.handle(op,input);expect(r.ok,JSON.stringify(r)).toBe(true);return(r as any).data}
 const conn=await call('saveConnection',{label:'isolated-server',host:ssh.host,port:ssh.port,username:ssh.username,secret:ssh.password})
 const task=await call('createTask',{agentId:'chat',connectionId:conn.id})
 const terminal=await call('createTerminalSession',{agentId:'shell',ownerSessionId:task.sessionId})
 return{wb,ssh,dir,task,terminal,conn,call}
}
describe('remote terminal owner wiring',()=>{
 it('opens a remote Shell on the same connection and uses its cwd and environment for chat tools',async()=>{
  const x=await setup()
  expect(x.terminal.remote.connectionId).toBe(x.conn.id)
  expect(x.wb.sessions.get(x.terminal.sessionId)!.workspace).toBe(x.wb.sessions.get(x.task.sessionId)!.workspace)
  expect(x.wb.sessions.get(x.terminal.sessionId)!.sessionDir.startsWith(x.dir)).toBe(true)
  await x.call('acquireLease',{sessionId:x.terminal.sessionId,holder:'user'})
  await x.call('writeToSession',{sessionId:x.terminal.sessionId,as:'user',data:"mkdir '中文数据'; cd '中文数据'; export SHARED_REMOTE=remote-only; printf 中文文件 > proof.txt\r"})
  await vi.waitFor(async()=>expect((await x.call('subscribeSession',{sessionId:x.task.sessionId})).remote?.cwd ?? (await x.call('listSessions',{projectId:x.wb.sessions.get(x.task.sessionId)!.projectId})).find((s:any)=>s.sessionId===x.task.sessionId)?.remote?.cwd).toBe(join(x.ssh.workspace,'中文数据')),{timeout:5000})
  const session=(x.wb.nativeRuntime as any).sessions.get(x.task.sessionId).session
  const bash=session.getToolDefinition('bash')
  const r=await bash.execute('shared-tool',{command:'printf "%s:%s" "$SHARED_REMOTE" "$PWD"'})
  expect(JSON.stringify(r)).toContain('remote-only:'+join(x.ssh.workspace,'中文数据'))
  expect(JSON.stringify(await session.getToolDefinition('read').execute('read-proof',{path:'proof.txt'}))).toContain('中文文件')
  expect(x.ssh.connections).toBe(1)
  const control=await x.call('getTerminalControl',{terminalId:x.terminal.sessionId})
  expect(control.ownerSessionId).toBe(x.task.sessionId)
 })
 it('does not switch the owner Shell if a turn begins while a new terminal is opening',async()=>{
  const x=await setup()
  const busy=vi.spyOn(x.wb.nativeRuntime,'terminalBusy').mockReturnValueOnce(false).mockReturnValue(true)
  const result=await x.wb.server.handle('createTerminalSession',{agentId:'shell',ownerSessionId:x.task.sessionId})
  expect(result.ok).toBe(false)
  busy.mockRestore()
  expect(x.wb.sessions.isLive(x.task.sessionId)).toBe(true)
  const context=x.wb.nativeRuntime.remoteContextOf(x.task.sessionId)!
  expect((await context.executor.execInTerminal!('printf original-shell',{}))?.stdout).toContain('original-shell')
  expect(x.ssh.connections).toBe(1)
 })
 it('locks Shell selection during asynchronous image preparation and releases the lock on failure',async()=>{
  const x=await setup()
  await x.call('acquireLease',{sessionId:x.task.sessionId,holder:'user'})
  const pending=x.wb.server.handle('writeToSession',{sessionId:x.task.sessionId,as:'user',data:'no model request',images:[{from:'path',path:join(x.dir,'missing.png')}]})
  const selection=await x.wb.server.handle('selectTerminal',{terminalId:x.terminal.sessionId})
  expect(selection.ok).toBe(false)
  const competing=await x.wb.server.handle('writeToSession',{sessionId:x.task.sessionId,as:'user',terminalId:x.terminal.sessionId,data:'competing explicit terminal'})
  expect(competing.ok).toBe(false)
  expect((await pending).ok).toBe(false)
  expect((await x.wb.server.handle('selectTerminal',{terminalId:x.terminal.sessionId})).ok).toBe(true)
 })
 it('selects an exact Shell instance and never falls back to a surviving sibling after it closes',async()=>{
  const x=await setup()
  const write=async(id:string,value:string)=>{await x.call('acquireLease',{sessionId:id,holder:'user'});await x.call('writeToSession',{sessionId:id,as:'user',data:`export INSTANCE_VALUE=${value}\r`});await vi.waitFor(async()=>expect((await x.call('getTerminalAgentMode',{terminalId:id})).mode).toBe('normal'));await new Promise(r=>setTimeout(r,50))}
  await write(x.terminal.sessionId,'first')
  const second=await x.call('createTerminalSession',{agentId:'shell',ownerSessionId:x.task.sessionId})
  await write(second.sessionId,'second')
  const context=x.wb.nativeRuntime.remoteContextOf(x.task.sessionId)!
  await x.call('selectTerminal',{terminalId:x.terminal.sessionId})
  expect((await context.executor.execInTerminal!('printf "$INSTANCE_VALUE"',{}))?.stdout).toContain('first')
  await x.call('selectTerminal',{terminalId:second.sessionId})
  expect((await context.executor.execInTerminal!('printf "$INSTANCE_VALUE"',{}))?.stdout).toContain('second')
  await x.call('stopSession',{sessionId:second.sessionId})
  await expect(context.executor.execInTerminal!('printf must-not-fallback',{})).rejects.toThrow(/结束|断开/)
  expect(x.wb.sessions.isLive(x.terminal.sessionId)).toBe(true)
  expect(x.ssh.connections).toBe(1)
 })
 it('keeps different owners on the same server in separate Shell environments',async()=>{
  const x=await setup()
  const other=await x.call('createTask',{agentId:'chat',connectionId:x.conn.id})
  const otherTerminal=await x.call('createTerminalSession',{agentId:'shell',ownerSessionId:other.sessionId})
  const a=x.wb.nativeRuntime.remoteContextOf(x.task.sessionId)!, b=x.wb.nativeRuntime.remoteContextOf(other.sessionId)!
  await a.executor.execInTerminal!('export OWNER_CONTEXT=first',{})
  await b.executor.execInTerminal!('export OWNER_CONTEXT=second',{})
  expect((await a.executor.execInTerminal!('printf "$OWNER_CONTEXT"',{}))?.stdout).toContain('first')
  expect((await b.executor.execInTerminal!('printf "$OWNER_CONTEXT"',{}))?.stdout).toContain('second')
  expect((await x.wb.server.handle('setTerminalControl',{terminalId:otherTerminal.sessionId,ownerSessionId:x.task.sessionId,enabled:true,mode:'shell'})).ok).toBe(false)
  expect(x.ssh.connections).toBe(1)
 })
 it('does not launch a local standalone CLI when no desktop presenter is installed',async()=>{
  const x=await setup()
  await x.call('acquireLease',{sessionId:x.terminal.sessionId,holder:'user'})
  await x.call('writeToSession',{sessionId:x.terminal.sessionId,as:'user',data:'dawn\r'})
  await vi.waitFor(async()=>expect((await x.call('subscribeSession',{sessionId:x.terminal.sessionId})).terminal).toContain('没有装配桌面 DAWN CLI'))
  const context=x.wb.nativeRuntime.remoteContextOf(x.task.sessionId)!
  expect((await context.executor.execInTerminal!('printf remote-still-alive',{}))?.stdout).toContain('remote-still-alive')
 })
 it('keeps two servers separate and leaves the other connection usable after one disconnects',async()=>{
  const x=await setup(), otherSsh=await startLoopbackSsh()
  cleanups.push(()=>otherSsh.close())
  const conn=await x.call('saveConnection',{label:'second-isolated-server',host:otherSsh.host,port:otherSsh.port,username:otherSsh.username,secret:otherSsh.password})
  const other=await x.call('createTask',{agentId:'chat',connectionId:conn.id})
  const terminal=await x.call('createTerminalSession',{agentId:'shell',ownerSessionId:other.sessionId})
  const a=x.wb.nativeRuntime.remoteContextOf(x.task.sessionId)!,b=x.wb.nativeRuntime.remoteContextOf(other.sessionId)!
  expect((await a.executor.execInTerminal!('pwd',{}))?.stdout).toContain(x.ssh.workspace)
  expect((await b.executor.execInTerminal!('pwd',{}))?.stdout).toContain(otherSsh.workspace)
  expect((await x.wb.server.handle('setTerminalControl',{terminalId:terminal.sessionId,ownerSessionId:x.task.sessionId,enabled:true,mode:'shell'})).ok).toBe(false)
  await x.call('disconnectRemote',{id:conn.id})
  await expect(b.executor.execInTerminal!('printf must-not-fallback',{})).rejects.toThrow(/结束|断开/)
  expect((await a.executor.execInTerminal!('printf first-server-alive',{}))?.stdout).toContain('first-server-alive')
  expect(x.ssh.connections).toBe(1);expect(otherSsh.connections).toBe(1)
 })
 it('refuses a different server owner and leaves the main session alive when its terminal closes',async()=>{
  const x=await setup()
  const other=await x.call('createTask',{agentId:'chat',workspace:x.dir})
  const wrong=await x.wb.server.handle('setTerminalControl',{terminalId:x.terminal.sessionId,ownerSessionId:other.sessionId,enabled:true,mode:'shell'})
  expect(wrong.ok).toBe(false)
  await x.call('stopSession',{sessionId:x.terminal.sessionId})
  expect(x.wb.sessions.isLive(x.task.sessionId)).toBe(true)
  expect((await x.call('subscribeSession',{sessionId:x.task.sessionId})).state).not.toBe('exited')
 })
})
