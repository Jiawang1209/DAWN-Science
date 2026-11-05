# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: terminal-context-return.spec.ts >> a removed Agent target leaves the terminal open and reports the missing conversation
- Location: e2e/terminal-context-return.spec.ts:58:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 25000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=f3e3]:
  - generic [ref=f3e4]:
    - generic [ref=f3e5]:
      - button "DAWN Science" [ref=f3e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f3e10] [cursor=pointer]
      - button "快捷键速查" [ref=f3e13] [cursor=pointer]
    - generic [ref=f3e17]:
      - tablist "同一处的会话" [ref=f3e21]:
        - generic [ref=f3e22]:
          - tab "新会话" [selected] [ref=f3e23] [cursor=pointer]
          - button "关掉「新会话」（收进归档）" [ref=f3e26] [cursor=pointer]
        - button "在这里再开一段" [ref=f3e29] [cursor=pointer]
      - generic:
        - banner
    - button "面板" [ref=f3e33] [cursor=pointer]
  - generic [ref=f3e34]:
    - complementary [ref=f3e35]:
      - button "新建任务" [ref=f3e37] [cursor=pointer]
      - separator [ref=f3e42]
      - generic [ref=f3e43]:
        - generic [ref=f3e44]: 工作区
        - generic [ref=f3e45]:
          - button "搜索" [ref=f3e46] [cursor=pointer]
          - button "添加工作区文件夹" [ref=f3e49] [cursor=pointer]
      - generic [ref=f3e53]:
        - paragraph [ref=f3e54]:
          - button "项目 1" [expanded] [ref=f3e55] [cursor=pointer]:
            - generic [ref=f3e60]: 项目
            - generic [ref=f3e61]: "1"
          - button "多选项目" [ref=f3e62] [cursor=pointer]: 多选
        - list [ref=f3e63]:
          - listitem [ref=f3e64]:
            - generic [ref=f3e65]:
              - button "workspace" [ref=f3e66] [cursor=pointer]
              - generic [ref=f3e75]:
                - button "在「workspace」里开一段新对话" [ref=f3e76] [cursor=pointer]
                - button "项目操作：workspace" [ref=f3e80] [cursor=pointer]: ⋯
            - list [ref=f3e81]:
              - listitem [ref=f3e82]:
                - button "新会话 刚刚" [ref=f3e83]:
                  - generic [ref=f3e84]: 新会话
                  - generic [ref=f3e88]: 刚刚
                - button "会话操作：新会话" [ref=f3e90] [cursor=pointer]: ⋯
        - region "服务器" [ref=f3e91]:
          - generic [ref=f3e92]:
            - button "服务器" [expanded] [ref=f3e93] [cursor=pointer]
            - button "添加服务器" [ref=f3e102] [cursor=pointer]
          - paragraph [ref=f3e105]: 还没有服务器
      - generic [ref=f3e106]:
        - button "定时" [ref=f3e107] [cursor=pointer]
        - button "设置" [ref=f3e112] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f3e116]
    - main [ref=f3e117]:
      - region "终端" [ref=f3e118]:
        - generic [ref=f3e119]:
          - generic [ref=f3e120]: 终端
          - generic [ref=f3e124]:
            - button "终端 1" [ref=f3e125] [cursor=pointer]
            - button "关闭终端 1" [ref=f3e126] [cursor=pointer]: ×
          - button "＋ 新开一个" [ref=f3e127] [cursor=pointer]
          - generic "/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-cRfm5K/workspace" [ref=f3e130]: workspace
          - group "终端会话操作" [ref=f3e132]:
            - button "搜索历史" [ref=f3e134] [cursor=pointer]
            - button "导出会话" [disabled] [ref=f3e138]
          - group "终端模式" [ref=f3e142]:
            - button "DAWN 模式" [ref=f3e143] [cursor=pointer]
            - button "Normal 模式" [pressed] [ref=f3e144] [cursor=pointer]
          - button "返回会话" [ref=f3e146] [cursor=pointer]
        - generic [ref=f3e157]:
          - textbox "Terminal input" [ref=f3e158]
          - generic:
            - generic: "nvm is not compatible with the \"npm_config_prefix\" environment variable: currently set to \"/Users/liu"
            - generic: yue/.local"
            - generic: "Run `unset npm_config_prefix` to unset it."
            - generic:
              - generic: 终端代理
              - generic: "-> 127.0.0.1:10808"
            - generic:
              - generic: liuyue@MacBookPro
              - generic: /var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-cRfm5K/workspace
              - generic: $
  - contentinfo "应用状态" [ref=f3e159]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e161] [cursor=pointer]
    - generic [ref=f3e162]:
      - generic [ref=f3e163]:
        - button "当前模型：deepseek-flash" [ref=f3e164] [cursor=pointer]:
          - generic [ref=f3e168]: deepseek-flash
        - button "R：未配置" [ref=f3e169] [cursor=pointer]:
          - generic [ref=f3e171]: R
          - generic [ref=f3e172]: 未配置
        - button "Python：未配置" [ref=f3e173] [cursor=pointer]:
          - generic [ref=f3e175]: Python
          - generic [ref=f3e176]: 未配置
      - generic [ref=f3e177]:
        - generic [ref=f3e178]:
          - button "插件 8" [ref=f3e179] [cursor=pointer]:
            - generic [ref=f3e182]: 插件
            - generic [ref=f3e183]: "8"
          - button "Skills 9" [ref=f3e184] [cursor=pointer]:
            - generic [ref=f3e188]: Skills
            - generic [ref=f3e189]: "9"
          - button "MCP 0" [ref=f3e190] [cursor=pointer]:
            - generic [ref=f3e193]: MCP
            - generic [ref=f3e194]: "0"
          - button "子 Agent 22" [ref=f3e195] [cursor=pointer]:
            - generic [ref=f3e198]: 子 Agent
            - generic [ref=f3e199]: "22"
        - button "版本 v0.0.44" [ref=f3e200] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
  2  | import type { Page } from '@playwright/test'
  3  | import { existsSync, readFileSync, realpathSync } from 'node:fs'
  4  | import { join } from 'node:path'
  5  | import { stripVTControlCharacters } from 'node:util'
  6  | 
  7  | async function open(page: Page) {
  8  |   await 在项目里开会话(page); await 等进了对话(page)
  9  |   await page.getByRole('button', { name: '终端面板', exact: true }).click()
  10 |   await expect(page.locator('.dock .term-host')).toBeVisible()
  11 |   return terminals(page)
  12 | }
  13 | async function terminals(page: Page) {
  14 |   return page.evaluate(async () => {
  15 |     const p = await window.dawn!.invoke('listProjects', {}) as any
  16 |     const s = await window.dawn!.invoke('listSessions', { projectId: p.data[0].projectId }) as any
  17 |     return s.data.filter((x: any) => x.kind === 'pty') as { sessionId: string }[]
  18 |   })
  19 | }
  20 | async function type(page: Page, text: string) {
  21 |   await page.locator('.dock .xterm-helper-textarea').focus()
  22 |   await page.keyboard.type(text); await page.keyboard.press('Enter')
  23 | }
  24 | async function mode(page: Page, terminalId: string) {
  25 |   return page.evaluate(async id => (await window.dawn!.invoke('getTerminalAgentMode', { terminalId: id }) as any).data, terminalId)
  26 | }
  27 | async function snapshot(page: Page, sessionId: string) {
  28 |   return page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data, sessionId)
  29 | }
  30 | async function enter(page: Page, terminalId: string) {
  31 |   // Rendering xterm is earlier than the login Shell becoming ready under CPU load.
> 32 |   await expect.poll(async () => stripVTControlCharacters((await snapshot(page, terminalId)).terminal).trimEnd().endsWith('$')).toBe(true)
     |                                                                                                                                ^ Error: expect(received).toBe(expected) // Object.is equality
  33 |   await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  34 |   await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 })
  35 | }
  36 | 
  37 | test('the selected terminal returns to its own Agent rather than another live terminal', async ({ dawn }) => {
  38 |   const { page } = dawn
  39 |   const [first] = await open(page)
  40 |   await enter(page, first!.sessionId)
  41 |   const a = await mode(page, first!.sessionId)
  42 |   await type(page, 'FIRST_TERMINAL_CONTEXT_A')
  43 |   await expect.poll(async () => (await snapshot(page, a.sessionId)).items.some((x: any) => x.type === 'turn' && x.who === 'agent' && x.final)).toBe(true)
  44 |   await page.locator('.dock').getByRole('button', { name: '＋ 新开一个', exact: true }).click()
  45 |   await expect(page.locator('.dock .dock-tab')).toHaveCount(2)
  46 |   const second = (await terminals(page)).find(t => t.sessionId !== first!.sessionId)!
  47 |   await enter(page, second.sessionId)
  48 |   const b = await mode(page, second.sessionId)
  49 |   expect(b.sessionId).not.toBe(a.sessionId)
  50 |   await type(page, 'SECOND_TERMINAL_CONTEXT_B')
  51 |   await expect.poll(async () => (await snapshot(page, b.sessionId)).items.some((x: any) => x.type === 'turn' && x.who === 'agent' && x.final)).toBe(true)
  52 |   await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  53 |   await expect(page.locator('.main')).toContainText('SECOND_TERMINAL_CONTEXT_B')
  54 |   await expect(page.locator('.main')).not.toContainText('FIRST_TERMINAL_CONTEXT_A')
  55 |   expect((await mode(page, first!.sessionId)).sessionId).toBe(a.sessionId)
  56 | })
  57 | 
  58 | test('a removed Agent target leaves the terminal open and reports the missing conversation', async ({ dawn }) => {
  59 |   const { page } = dawn, [terminal] = await open(page)
  60 |   await enter(page, terminal!.sessionId)
  61 |   const target = await mode(page, terminal!.sessionId)
  62 |   await page.evaluate(async id => {
  63 |     const t = await window.dawn!.invoke('listTasks', {}) as any
  64 |     const task = t.data.find((x: any) => x.sessionId === id)
  65 |     const result = await window.dawn!.invoke('deleteTask', { taskId: task.taskId })
  66 |     if (!result.ok) throw new Error('Fixture could not remove the target')
  67 |   }, target.sessionId)
  68 |   await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  69 |   await expect(page.getByText('那段对话已经不在了（可能已归档或删除）', { exact: true })).toBeVisible()
  70 |   await expect(page.locator('.dock .term-host')).toBeVisible()
  71 | })
  72 | 
  73 | test.describe('running task across directories', () => {
  74 |   test.use({ dawnOptions: { toolCall: { when: 'CONTINUITY_RUNNING', toolName: 'bash', args: { command: 'sleep 3; printf CONTINUITY_DONE > continuation-long.txt' }, perTurn: true } } })
  75 |   test('return follows the CLI workspace and lets the current tool finish', async ({ dawn }) => {
  76 |     const { page, workspace } = dawn, [terminal] = await open(page)
  77 |     await type(page, 'mkdir -p nested; cd nested; dawn')
  78 |     await expect.poll(async () => (await mode(page, terminal!.sessionId)).mode).toBe('dawn')
  79 |     const target = await mode(page, terminal!.sessionId)
  80 |     await type(page, 'CONTINUITY_RUNNING')
  81 |     await expect.poll(async () => stripVTControlCharacters((await snapshot(page, terminal!.sessionId)).terminal)).toContain('sleep 3')
  82 |     await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  83 |     await expect(page.locator('.main .composer-card')).toBeVisible()
  84 |     await expect(page.locator('.main')).toContainText('CONTINUITY_RUNNING')
  85 |     await expect.poll(() => existsSync(join(workspace, 'nested', 'continuation-long.txt'))).toBe(true)
  86 |     expect(readFileSync(join(workspace, 'nested', 'continuation-long.txt'), 'utf8')).toBe('CONTINUITY_DONE')
  87 |     const p = await page.evaluate(async id => {
  88 |       const projects = await window.dawn!.invoke('listProjects', {}) as any
  89 |       return projects.data.find((x: any) => x.projectId === id)
  90 |     }, target.projectId)
  91 |     expect(realpathSync(p.workspace)).toBe(realpathSync(join(workspace, 'nested')))
  92 |   })
  93 | })
  94 | 
```