# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: terminal-context-return.spec.ts >> the selected terminal returns to its own Agent rather than another live terminal
- Location: e2e/terminal-context-return.spec.ts:56:1

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
          - generic "/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-l29BWp/workspace" [ref=f3e130]: workspace
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
              - generic: /var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-l29BWp/workspace
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
  1   | import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
  2   | import type { Page } from '@playwright/test'
  3   | import { existsSync, readFileSync, realpathSync } from 'node:fs'
  4   | import { join } from 'node:path'
  5   | import { stripVTControlCharacters } from 'node:util'
  6   | import { TerminalScreen } from '../src/terminal/screen.js'
  7   | import { readyPrompt } from '../src/terminal/commands.js'
  8   | 
  9   | async function open(page: Page) {
  10  |   await 在项目里开会话(page); await 等进了对话(page)
  11  |   await page.getByRole('button', { name: '终端面板', exact: true }).click()
  12  |   await expect(page.locator('.dock .term-host')).toBeVisible()
  13  |   return terminals(page)
  14  | }
  15  | async function terminals(page: Page) {
  16  |   return page.evaluate(async () => {
  17  |     const p = await window.dawn!.invoke('listProjects', {}) as any
  18  |     const s = await window.dawn!.invoke('listSessions', { projectId: p.data[0].projectId }) as any
  19  |     return s.data.filter((x: any) => x.kind === 'pty') as { sessionId: string }[]
  20  |   })
  21  | }
  22  | async function type(page: Page, text: string) {
  23  |   await page.locator('.dock .xterm-helper-textarea').focus()
  24  |   await page.keyboard.type(text); await page.keyboard.press('Enter')
  25  | }
  26  | async function mode(page: Page, terminalId: string) {
  27  |   return page.evaluate(async id => (await window.dawn!.invoke('getTerminalAgentMode', { terminalId: id }) as any).data, terminalId)
  28  | }
  29  | async function snapshot(page: Page, sessionId: string) {
  30  |   return page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data, sessionId)
  31  | }
  32  | async function enter(page: Page, terminalId: string) {
  33  |   // Parse cursor state with the same model and prompt predicate as the host.
  34  |   // Raw PTY bytes can end in repaint commands rather than the visible prompt.
  35  |   const control = await page.evaluate(async id => (await window.dawn!.invoke('getTerminalControl', { terminalId: id }) as any).data, terminalId)
  36  |   let screen = new TerminalScreen(control.cols, control.rows), consumed = '', reported = false
  37  |   try {
  38  |     await expect.poll(async () => {
  39  |       const raw = (await snapshot(page, terminalId)).terminal as string
  40  |       if (!raw.startsWith(consumed)) { screen.dispose(); screen = new TerminalScreen(control.cols, control.rows); consumed = '' }
  41  |       screen.write(raw.slice(consumed.length)); consumed = raw
  42  |       const parsed = await screen.snapshot()
  43  |       const parsedReady = readyPrompt('shell', parsed.cursorPrefix, parsed.alternate)
  44  |       const rawReady = stripVTControlCharacters(raw).trimEnd().endsWith('$')
  45  |       if (parsedReady && !rawReady && !reported) {
  46  |         reported = true
  47  |         await test.info().attach('terminal-prompt-observation', { body: JSON.stringify({ rawReady, parsedReady, cursorPrefix: parsed.cursorPrefix, tailCodePoints: Array.from(raw.slice(-128)).map(c => c.codePointAt(0)) }), contentType: 'application/json' })
  48  |       }
  49  |       return rawReady
> 50  |     }).toBe(true)
      |        ^ Error: expect(received).toBe(expected) // Object.is equality
  51  |   } finally { screen.dispose() }
  52  |   await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  53  |   await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 })
  54  | }
  55  | 
  56  | test('the selected terminal returns to its own Agent rather than another live terminal', async ({ dawn }) => {
  57  |   const { page } = dawn
  58  |   const [first] = await open(page)
  59  |   await enter(page, first!.sessionId)
  60  |   const a = await mode(page, first!.sessionId)
  61  |   await type(page, 'FIRST_TERMINAL_CONTEXT_A')
  62  |   await expect.poll(async () => (await snapshot(page, a.sessionId)).items.some((x: any) => x.type === 'turn' && x.who === 'agent' && x.final)).toBe(true)
  63  |   await page.locator('.dock').getByRole('button', { name: '＋ 新开一个', exact: true }).click()
  64  |   await expect(page.locator('.dock .dock-tab')).toHaveCount(2)
  65  |   const second = (await terminals(page)).find(t => t.sessionId !== first!.sessionId)!
  66  |   await enter(page, second.sessionId)
  67  |   const b = await mode(page, second.sessionId)
  68  |   expect(b.sessionId).not.toBe(a.sessionId)
  69  |   await type(page, 'SECOND_TERMINAL_CONTEXT_B')
  70  |   await expect.poll(async () => (await snapshot(page, b.sessionId)).items.some((x: any) => x.type === 'turn' && x.who === 'agent' && x.final)).toBe(true)
  71  |   await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  72  |   await expect(page.locator('.main')).toContainText('SECOND_TERMINAL_CONTEXT_B')
  73  |   await expect(page.locator('.main')).not.toContainText('FIRST_TERMINAL_CONTEXT_A')
  74  |   expect((await mode(page, first!.sessionId)).sessionId).toBe(a.sessionId)
  75  | })
  76  | 
  77  | test('a removed Agent target leaves the terminal open and reports the missing conversation', async ({ dawn }) => {
  78  |   const { page } = dawn, [terminal] = await open(page)
  79  |   await enter(page, terminal!.sessionId)
  80  |   const target = await mode(page, terminal!.sessionId)
  81  |   await page.evaluate(async id => {
  82  |     const t = await window.dawn!.invoke('listTasks', {}) as any
  83  |     const task = t.data.find((x: any) => x.sessionId === id)
  84  |     const result = await window.dawn!.invoke('deleteTask', { taskId: task.taskId })
  85  |     if (!result.ok) throw new Error('Fixture could not remove the target')
  86  |   }, target.sessionId)
  87  |   await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  88  |   await expect(page.getByText('那段对话已经不在了（可能已归档或删除）', { exact: true })).toBeVisible()
  89  |   await expect(page.locator('.dock .term-host')).toBeVisible()
  90  | })
  91  | 
  92  | test.describe('running task across directories', () => {
  93  |   test.use({ dawnOptions: { toolCall: { when: 'CONTINUITY_RUNNING', toolName: 'bash', args: { command: 'sleep 3; printf CONTINUITY_DONE > continuation-long.txt' }, perTurn: true } } })
  94  |   test('return follows the CLI workspace and lets the current tool finish', async ({ dawn }) => {
  95  |     const { page, workspace } = dawn, [terminal] = await open(page)
  96  |     await type(page, 'mkdir -p nested; cd nested; dawn')
  97  |     await expect.poll(async () => (await mode(page, terminal!.sessionId)).mode).toBe('dawn')
  98  |     const target = await mode(page, terminal!.sessionId)
  99  |     await type(page, 'CONTINUITY_RUNNING')
  100 |     await expect.poll(async () => stripVTControlCharacters((await snapshot(page, terminal!.sessionId)).terminal)).toContain('sleep 3')
  101 |     await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  102 |     await expect(page.locator('.main .composer-card')).toBeVisible()
  103 |     await expect(page.locator('.main')).toContainText('CONTINUITY_RUNNING')
  104 |     await expect.poll(() => existsSync(join(workspace, 'nested', 'continuation-long.txt'))).toBe(true)
  105 |     expect(readFileSync(join(workspace, 'nested', 'continuation-long.txt'), 'utf8')).toBe('CONTINUITY_DONE')
  106 |     const p = await page.evaluate(async id => {
  107 |       const projects = await window.dawn!.invoke('listProjects', {}) as any
  108 |       return projects.data.find((x: any) => x.projectId === id)
  109 |     }, target.projectId)
  110 |     expect(realpathSync(p.workspace)).toBe(realpathSync(join(workspace, 'nested')))
  111 |   })
  112 | })
  113 | 
```