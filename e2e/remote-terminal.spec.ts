import { test, expect, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'
import { startLoopbackSsh } from '../tests/helpers/loopback-ssh.js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

async function call(page: Page, operation: string, input: unknown = {}) {
  return page.evaluate(async ({operation,input}) => {
    const result = await window.dawn!.invoke(operation,input)
    if (!result.ok) throw new Error(result.error?.message)
    return result.data as any
  }, {operation,input})
}
const proofCommand = 'printf "%s|%s" "$REMOTE_CONTEXT" "$PWD" > agent-proof.txt; cat agent-proof.txt'
test.use({dawnOptions:{toolCall:{when:'REMOTE_PROOF',toolName:'bash',args:{command:proofCommand},perTurn:true}}})

test('remote Normal and DAWN share the original chat, SSH connection, Chinese cwd and environment',async({dawn})=>{
 const ssh=await startLoopbackSsh()
 try {
  const {page,requests}=dawn
  const connection=await call(page,'saveConnection',{label:'远端隔离验收',host:ssh.host,port:ssh.port,username:ssh.username,secret:ssh.password})
  const providers=await call(page,'getProviders')
  const task=await call(page,'createTask',{agentId:providers.agents.find((a:any)=>a.kind==='native').agentId,connectionId:connection.id})
  await page.reload()
  await page.getByRole('region',{name:'服务器',exact:true}).getByRole('button',{name:/新会话 刚刚/}).click()
  await 等进了对话(page)
  const composer=page.locator('.main .composer-card textarea.composer-field')
  await composer.fill('REMOTE_ORIGINAL_HISTORY 中文会话上下文');await composer.press('Enter')
  await expect(page.locator('.turns')).toContainText('假模型已应答')
  const tasksBefore=await call(page,'listTasks')
  await page.locator('.composer-card .attach-trigger').click()
  await page.getByRole('menuitem',{name:'终端面板',exact:true}).click()
  const dock=page.locator('.dock'),input=dock.locator('.xterm-helper-textarea'),screen=dock.locator('.xterm-rows')
  await expect(screen).toContainText('dawn-test>')
  const terminalId=Object.keys(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('dawn.window.terminal-owner')||'{}')))[0]!
  const type=async(text:string)=>{await input.focus();await page.keyboard.type(text);await page.keyboard.press('Enter')}
  await type("mkdir '中文目录'; cd '中文目录'; export REMOTE_CONTEXT=中文环境; printf '中文输入正常\\n'")
  await expect(screen).toContainText('中文输入正常')
  await expect(dock.locator('.dock-cwd')).toContainText('远端隔离验收:')
  await expect.poll(async()=> (await call(page,'getTerminalAgentMode',{terminalId})).remote.cwd).toBe(join(ssh.workspace,'中文目录'))
  await input.focus();await page.keyboard.type('echo pending')
  const agent=dock.getByRole('button',{name:'DAWN 模式',exact:true}),normal=dock.getByRole('button',{name:'Normal 模式',exact:true})
  await agent.click();await expect(dock.getByRole('alert')).toContainText(/空闲|未提交/)
  await input.focus();await page.keyboard.press('Control+c')
  await agent.click();await expect(agent).toHaveAttribute('aria-pressed','true')
  expect((await call(page,'getTerminalAgentMode',{terminalId})).sessionId).toBe(task.sessionId)
  await expect(screen).toContainText('REMOTE_ORIGINAL_HISTORY')
  await type('REMOTE_PROOF 请读取当前终端环境与目录')
  await expect.poll(()=>existsSync(join(ssh.workspace,'中文目录','agent-proof.txt'))).toBe(true)
  expect(readFileSync(join(ssh.workspace,'中文目录','agent-proof.txt'),'utf8')).toBe('中文环境|'+join(ssh.workspace,'中文目录'))
  await expect.poll(async()=> (await call(page,'subscribeSession',{sessionId:task.sessionId})).items.filter((x:any)=>x.type==='turn'&&x.who==='agent'&&x.final).length).toBe(2)
  const modelRequest=JSON.stringify(requests.at(-1))
  expect(modelRequest).toContain('REMOTE_ORIGINAL_HISTORY')
  expect(modelRequest).toContain('REMOTE_PROOF')
  await page.setViewportSize({width:1100,height:780})
  await expect(agent).toBeVisible();await expect(dock.getByRole('button',{name:'返回会话',exact:true})).toBeVisible()
  await page.screenshot({path:test.info().outputPath('remote-dawn-narrow.png')})
  await type('/exit');await expect(normal).toHaveAttribute('aria-pressed','true')
  await expect(screen).toContainText('dawn-test>')
  expect((await call(page,'subscribeSession',{sessionId:task.sessionId})).state).not.toBe('exited')
  await dock.getByRole('button',{name:'返回会话',exact:true}).click()
  await expect(page.locator('.main')).toContainText('REMOTE_PROOF')
  await composer.fill('REMOTE_PROOF 继续原会话');await composer.press('Enter')
  await expect.poll(async()=> (await call(page,'subscribeSession',{sessionId:task.sessionId})).items.filter((x:any)=>x.type==='turn'&&x.who==='agent'&&x.final).length).toBe(3)
  expect(await call(page,'listTasks')).toHaveLength(tasksBefore.length)
  expect(ssh.connections).toBe(1)
 } finally {await ssh.close()}
})

test.describe('detach an active shared remote Agent',()=>{
 test.use({dawnOptions:{toolCall:{when:'REMOTE_LONG_TURN',toolName:'bash',args:{command:'printf started > started.txt; sleep 2; printf completed > completed.txt'},perTurn:true}}})
 test('returning directly from DAWN detaches presentation and lets the original server task finish',async({dawn})=>{
  const ssh=await startLoopbackSsh()
  try{
   const {page}=dawn
   const connection=await call(page,'saveConnection',{label:'远端持续任务',host:ssh.host,port:ssh.port,username:ssh.username,secret:ssh.password})
   const providers=await call(page,'getProviders')
   const task=await call(page,'createTask',{agentId:providers.agents.find((a:any)=>a.kind==='native').agentId,connectionId:connection.id})
   await page.reload();await page.getByRole('region',{name:'服务器',exact:true}).getByRole('button',{name:/新会话 刚刚/}).click();await 等进了对话(page)
   await page.locator('.composer-card .attach-trigger').click();await page.getByRole('menuitem',{name:'终端面板',exact:true}).click()
   const dock=page.locator('.dock')
   await expect(dock.locator('.xterm-rows')).toContainText('dawn-test>')
   const terminalId=Object.keys(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('dawn.window.terminal-owner')||'{}')))[0]!
   await dock.getByRole('button',{name:'DAWN 模式',exact:true}).click()
   await expect(dock.getByRole('button',{name:'DAWN 模式',exact:true})).toHaveAttribute('aria-pressed','true')
   await dock.locator('.xterm-helper-textarea').focus();await page.keyboard.type('REMOTE_LONG_TURN 请运行当前服务器任务');await page.keyboard.press('Enter')
   await expect.poll(()=>existsSync(join(ssh.workspace,'started.txt'))).toBe(true)
   await dock.getByRole('button',{name:'返回会话',exact:true}).click()
   await expect(page.locator('.main .composer-card')).toBeVisible()
   await expect.poll(async()=>(await call(page,'getTerminalAgentMode',{terminalId})).mode).toBe('normal')
   await expect.poll(()=>existsSync(join(ssh.workspace,'completed.txt'))).toBe(true)
   expect((await call(page,'subscribeSession',{sessionId:task.sessionId})).state).not.toBe('exited')
   expect((await call(page,'getTerminalControl',{terminalId})).alive).toBe(true)
   await expect.poll(async()=> (await call(page,'subscribeSession',{sessionId:task.sessionId})).items.filter((i:any)=>i.type==='turn'&&i.who==='agent'&&i.final).length).toBe(1)
   // Device replies can outlive the local presenter and reach the raw Shell after detach.
   await call(page,'writeToSession',{sessionId:terminalId,as:'user',data:'\x1b[?1;2c'})
   const composer=page.locator('.main .composer-card textarea.composer-field')
   await composer.fill('REMOTE_LONG_TURN continue from GUI after delayed presenter report');await composer.press('Enter')
   await expect.poll(async()=> (await call(page,'subscribeSession',{sessionId:task.sessionId})).items.filter((i:any)=>i.type==='tool'&&i.status==='ok').length).toBe(2)
   await expect.poll(async()=> (await call(page,'subscribeSession',{sessionId:task.sessionId})).items.filter((i:any)=>i.type==='turn'&&i.who==='agent'&&i.final).length).toBe(2)
   expect(ssh.connections).toBe(1)
  }finally{await ssh.close()}
 })
})
