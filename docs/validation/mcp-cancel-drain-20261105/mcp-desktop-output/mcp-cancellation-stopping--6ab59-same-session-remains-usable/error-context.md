# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mcp-cancellation.spec.ts >> stopping an HTTP MCP stream after GC closes its response and the same session remains usable
- Location: e2e/mcp-cancellation.spec.ts:11:1

# Error details

```
TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('textbox', { name: 'MCP 服务器的 JSON 配置' })

```

# Page snapshot

```yaml
- generic [ref=f2e3]:
  - generic [ref=f2e4]:
    - generic [ref=f2e5]:
      - button "DAWN Science" [ref=f2e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f2e10] [cursor=pointer]
      - button "快捷键速查" [ref=f2e13] [cursor=pointer]
    - button "返回" [ref=f2e17] [cursor=pointer]
    - button "面板" [ref=f2e19] [cursor=pointer]
  - generic [ref=f2e20]:
    - complementary [ref=f2e21]:
      - button "新建任务" [ref=f2e23] [cursor=pointer]
      - separator [ref=f2e28]
      - generic [ref=f2e29]:
        - generic [ref=f2e30]: 工作区
        - generic [ref=f2e31]:
          - button "搜索" [ref=f2e32] [cursor=pointer]
          - button "添加工作区文件夹" [ref=f2e35] [cursor=pointer]
      - region "服务器" [ref=f2e40]:
        - generic [ref=f2e41]:
          - button "服务器" [expanded] [ref=f2e42] [cursor=pointer]
          - button "添加服务器" [ref=f2e51] [cursor=pointer]
        - paragraph [ref=f2e54]: 还没有服务器
      - generic [ref=f2e55]:
        - button "定时" [ref=f2e56] [cursor=pointer]
        - button "设置" [ref=f2e61] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f2e65]
    - main [ref=f2e66]:
      - generic [ref=f2e68]:
        - navigation "设置分类" [ref=f2e69]:
          - button "外观" [ref=f2e70] [cursor=pointer]
          - button "桌面通知" [ref=f2e74] [cursor=pointer]
          - button "文件引用" [ref=f2e78] [cursor=pointer]
          - button "用量" [ref=f2e82] [cursor=pointer]
          - button "工作目录" [ref=f2e86] [cursor=pointer]
          - button "模型服务" [ref=f2e90] [cursor=pointer]
          - button "ACP 适配器" [ref=f2e94] [cursor=pointer]
          - button "内核" [ref=f2e98] [cursor=pointer]
          - paragraph [ref=f2e102]: 扩展
          - button "Skills" [ref=f2e103] [cursor=pointer]:
            - generic [ref=f2e108]: "9"
          - button "记忆" [ref=f2e109] [cursor=pointer]
          - button "子 Agent" [ref=f2e115] [cursor=pointer]:
            - generic [ref=f2e119]: "22"
          - button "插件" [ref=f2e120] [cursor=pointer]:
            - generic [ref=f2e124]: "8"
          - button "MCP 服务器" [ref=f2e125] [cursor=pointer]:
            - generic [ref=f2e129]: "0"
          - button "远程助理" [ref=f2e130] [cursor=pointer]
          - button "关于" [ref=f2e134] [cursor=pointer]
        - generic [ref=f2e138]:
          - generic [ref=f2e139]:
            - heading "MCP 服务器" [level=1] [ref=f2e140]
            - button "收回" [ref=f2e141] [cursor=pointer]
          - generic [ref=f2e142]:
            - paragraph [ref=f2e144]:
              - text: 在这份文件的
              - code [ref=f2e145]: "mcp:"
              - text: 段里加一台；项目独有的写在
              - code [ref=f2e146]: .dawn/mcp.yaml
              - code [ref=f2e147]: /var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-YmKleI/providers.yaml
            - group [ref=f2e148]:
              - generic "加一台 MCP 服务器" [active] [ref=f2e149] [cursor=pointer]
            - group [ref=f2e150]:
              - generic "配好之后怎么用？" [ref=f2e151] [cursor=pointer]
            - generic [ref=f2e152]:
              - paragraph [ref=f2e153]: 还没有配 MCP 服务器
              - paragraph [ref=f2e154]: "MCP 服务器是外部工具：数据库、文献库、领域 API 都有现成的。在上面那份文件里加一段 mcp: 就行——我们不需要为每样工具各写一遍代码。"
  - contentinfo "应用状态" [ref=f2e155]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f2e157] [cursor=pointer]
    - generic [ref=f2e158]:
      - generic [ref=f2e159]:
        - button "当前模型：deepseek-flash" [ref=f2e160] [cursor=pointer]:
          - generic [ref=f2e164]: deepseek-flash
        - button "R：未配置" [ref=f2e165] [cursor=pointer]:
          - generic [ref=f2e167]: R
          - generic [ref=f2e168]: 未配置
        - button "Python：未配置" [ref=f2e169] [cursor=pointer]:
          - generic [ref=f2e171]: Python
          - generic [ref=f2e172]: 未配置
      - generic [ref=f2e173]:
        - generic [ref=f2e174]:
          - button "插件 8" [ref=f2e175] [cursor=pointer]:
            - generic [ref=f2e178]: 插件
            - generic [ref=f2e179]: "8"
          - button "Skills 9" [ref=f2e180] [cursor=pointer]:
            - generic [ref=f2e184]: Skills
            - generic [ref=f2e185]: "9"
          - button "MCP 0" [ref=f2e186] [cursor=pointer]:
            - generic [ref=f2e189]: MCP
            - generic [ref=f2e190]: "0"
          - button "子 Agent 22" [ref=f2e191] [cursor=pointer]:
            - generic [ref=f2e194]: 子 Agent
            - generic [ref=f2e195]: "22"
        - button "版本 v0.0.44" [ref=f2e196] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | import { test, expect, 开一段临时会话, 进设置 } from './fixtures.js'
  2  | import { mcpHttpFixture } from '../tests/mcp/http-fixture.js'
  3  | import { mkdirSync, writeFileSync } from 'node:fs'
  4  | import { resolve, join } from 'node:path'
  5  | 
  6  | test.use({ dawnOptions: { toolCall: [
  7  |   { when: 'MCP取消探针', toolName: 'cancelprobe__hold', args: {}, say: '等待 MCP 服务器返回，随后验证停止。' },
  8  |   { when: 'MCP继续探针', toolName: 'cancelprobe__echo', args: {}, say: '在同一连接继续调用 MCP。' },
  9  | ] } })
  10 | 
  11 | test('stopping an HTTP MCP stream after GC closes its response and the same session remains usable', async ({ dawn }) => {
  12 |   const f = await mcpHttpFixture('http', true), { page, app } = dawn
  13 |   const output = resolve(process.env.DAWN_MCP_CANCEL_DEMO_DIR ?? 'test-results/mcp-cancellation-demo')
  14 |   mkdirSync(output, { recursive: true })
  15 |   try {
  16 |     await 进设置(page, 'MCP 服务器')
  17 |     const add = page.getByText('加一台 MCP 服务器', { exact: true })
  18 |     if (await add.isVisible()) await add.click()
> 19 |     await page.getByRole('textbox', { name: 'MCP 服务器的 JSON 配置' }).fill(JSON.stringify({ mcpServers: { cancelprobe: f.config } }))
     |                                                                   ^ TimeoutError: locator.fill: Timeout 30000ms exceeded.
  20 |     await page.getByRole('button', { name: '加进来', exact: true }).click()
  21 |     await page.getByRole('button', { name: '试一次', exact: true }).first().click()
  22 |     await expect(page.getByText('连上了', { exact: true })).toBeVisible()
  23 |     const trust = page.getByRole('checkbox', { name: '这台我信得过' }).first()
  24 |     if (!await trust.isChecked()) await trust.click()
  25 |     await expect(trust).toBeChecked()
  26 |     await 开一段临时会话(page)
  27 |     await page.getByPlaceholder(/输入问题/).fill('MCP取消探针：等待响应后停止')
  28 |     await page.getByRole('button', { name: '发送', exact: true }).click()
  29 |     await expect.poll(() => f.calls).toContain('hold')
  30 |     const runtime = await app.evaluate(async () => {
  31 |       const v8 = await import('node:v8'), vm = await import('node:vm')
  32 |       v8.setFlagsFromString('--expose_gc')
  33 |       const gc = vm.runInNewContext('gc') as () => void
  34 |       await new Promise<void>(resolve => setImmediate(resolve)); gc()
  35 |       await new Promise<void>(resolve => setImmediate(resolve)); gc()
  36 |       return { node: process.versions.node, electron: process.versions.electron }
  37 |     })
  38 |     await page.screenshot({ path: join(output, 'waiting-before-stop.png'), animations: 'disabled' })
  39 |     const started = performance.now()
  40 |     await page.getByRole('button', { name: '停止', exact: true }).click()
  41 |     await expect.poll(() => f.closedWaits.length, { timeout: 1000 }).toBe(1)
  42 |     const releaseMs = performance.now() - started
  43 |     await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible()
  44 |     await page.getByPlaceholder(/输入问题/).fill('MCP继续探针：保持同一会话与连接')
  45 |     await page.getByRole('button', { name: '发送', exact: true }).click()
  46 |     await expect.poll(() => f.calls.filter(name => name === 'echo').length).toBe(1)
  47 |     await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0)
  48 |     expect(f.generations()).toBe(1)
  49 |     expect(f.calls.filter(name => name === 'hold')).toHaveLength(1)
  50 |     await page.screenshot({ path: join(output, 'stopped-and-continued.png'), animations: 'disabled' })
  51 |     writeFileSync(join(output, 'result.json'), JSON.stringify({ runtime, forcedGc: true, releaseMs, serverStreamClosed: true, sameSessionGeneration: f.generations(), calls: f.calls, snapshot: f.snapshot(), boundary: 'Real Electron and loopback HTTP; deterministic model, no external MCP or paid inference.' }, null, 2) + '\n')
  52 |   } finally { await f.close() }
  53 | })
  54 | 
```