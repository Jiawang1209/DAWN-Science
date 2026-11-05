# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mcp-cancellation.spec.ts >> stopping an HTTP MCP stream after GC closes its response and the same session remains usable
- Location: e2e/mcp-cancellation.spec.ts:11:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 3

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
    - banner [ref=f3e19]:
      - heading "MCP取消探针：等待响应后停止" [level=1] [ref=f3e23]
    - button "面板" [ref=f3e25] [cursor=pointer]
  - generic [ref=f3e26]:
    - complementary [ref=f3e27]:
      - button "新建任务" [ref=f3e29] [cursor=pointer]
      - separator [ref=f3e34]
      - generic [ref=f3e35]:
        - generic [ref=f3e36]: 工作区
        - generic [ref=f3e37]:
          - button "搜索" [ref=f3e38] [cursor=pointer]
          - button "添加工作区文件夹" [ref=f3e41] [cursor=pointer]
      - generic [ref=f3e45]:
        - region "服务器" [ref=f3e46]:
          - generic [ref=f3e47]:
            - button "服务器" [expanded] [ref=f3e48] [cursor=pointer]
            - button "添加服务器" [ref=f3e57] [cursor=pointer]
          - paragraph [ref=f3e60]: 还没有服务器
        - paragraph [ref=f3e61]:
          - button "会话 1" [expanded] [ref=f3e62] [cursor=pointer]:
            - generic [ref=f3e67]: 会话
            - generic [ref=f3e68]: "1"
          - button "多选会话" [ref=f3e69] [cursor=pointer]: 多选
        - list [ref=f3e70]:
          - listitem [ref=f3e71]:
            - button "MCP取消探针：等待响应后停止 刚刚" [ref=f3e72]:
              - generic [ref=f3e73]: MCP取消探针：等待响应后停止
              - generic [ref=f3e77]: 刚刚
            - button "会话操作：MCP取消探针：等待响应后停止" [ref=f3e79] [cursor=pointer]: ⋯
      - generic [ref=f3e80]:
        - button "定时" [ref=f3e81] [cursor=pointer]
        - button "设置" [ref=f3e86] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f3e90]
    - main [ref=f3e91]:
      - generic [ref=f3e92]:
        - toolbar "会话工具栏" [ref=f3e93]:
          - group "会话操作：MCP取消探针：等待响应后停止" [ref=f3e95]:
            - button "查找当前对话" [ref=f3e97] [cursor=pointer]
            - button "导出对话" [ref=f3e101] [cursor=pointer]
        - generic [ref=f3e106]:
          - generic [ref=f3e107]:
            - generic [ref=f3e108]: 你
            - generic [ref=f3e110]:
              - paragraph [ref=f3e114]: MCP取消探针：等待响应后停止
              - generic [ref=f3e115]:
                - time [ref=f3e116]: 2026-11-05 22:17
                - button "复制我说的这段" [ref=f3e117] [cursor=pointer]
                - button "修改" [ref=f3e123] [cursor=pointer]
                - button "回到这句之前" [ref=f3e127] [cursor=pointer]
          - generic [ref=f3e131]:
            - generic [ref=f3e132]:
              - generic [ref=f3e133]: D
              - generic [ref=f3e134]: DeepSeek
            - generic [ref=f3e135]:
              - paragraph [ref=f3e139]: 等待 MCP 服务器返回，随后验证停止。
              - button "复制这段回答" [ref=f3e141] [cursor=pointer]
          - button "已完成 用时 24 秒 1 步" [expanded] [ref=f3e147] [cursor=pointer]:
            - generic [ref=f3e150]: 已完成
            - generic [ref=f3e151]: 用时 24 秒
            - generic [ref=f3e152]: 1 步
          - generic [ref=f3e153]:
            - button "✗ cancelprobe__hold 24 秒 失败" [expanded] [ref=f3e154] [cursor=pointer]:
              - generic [ref=f3e157]: ✗ cancelprobe__hold
              - generic "耗时" [ref=f3e158]: 24 秒
              - generic [ref=f3e159]: 失败
            - generic [ref=f3e160]:
              - generic [ref=f3e161]: "{}"
              - button "复制这段输出" [ref=f3e162] [cursor=pointer]
              - generic [ref=f3e168]: "[cancelprobe]（这个工具报错了） cancelprobe__hold 调用失败：MCP 连接已断开，已发送请求的外部结果未知；请核对回执，不要自动重试。 SSE stream disconnected: TypeError: terminated"
          - generic [ref=f3e169]:
            - generic [ref=f3e170]:
              - generic [ref=f3e171]: D
              - generic [ref=f3e172]: DeepSeek
            - generic [ref=f3e173]:
              - paragraph [ref=f3e177]: 假模型已应答：DAWN 的整条链路是通的。
              - generic [ref=f3e178]:
                - button "复制这段回答" [ref=f3e179] [cursor=pointer]
                - paragraph [ref=f3e185]: 输入 12 · 输出 8 · 缓存 0 token
        - generic [ref=f3e186]:
          - generic [ref=f3e187]:
            - generic [ref=f3e188]:
              - button "工作目录：默认工作目录" [ref=f3e190] [cursor=pointer]:
                - generic [ref=f3e193]: 默认工作目录
              - generic [ref=f3e196]: 本机
            - textbox "输入问题，@ 引用文件，/ 使用指令" [ref=f3e202]
            - generic [ref=f3e203]:
              - generic [ref=f3e204]:
                - button "添加内容" [ref=f3e206] [cursor=pointer]
                - button "终端面板" [ref=f3e209] [cursor=pointer]
                - button "完全访问" [ref=f3e213] [cursor=pointer]
              - generic [ref=f3e218]:
                - button "上下文 <1%" [ref=f3e220] [cursor=pointer]: <1%
                - button "当前模型：deepseek-flash。点击切换" [ref=f3e225] [cursor=pointer]:
                  - generic [ref=f3e229]: deepseek-flash
                - button "发送" [active] [ref=f3e232] [cursor=pointer]
          - generic "这一整段对话累计" [ref=f3e237]: 1 轮 · 工具 1 次 24.0 s · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
  - contentinfo "应用状态" [ref=f3e238]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e240] [cursor=pointer]
    - generic [ref=f3e241]:
      - generic [ref=f3e242]:
        - button "当前模型：deepseek-flash" [ref=f3e243] [cursor=pointer]:
          - generic [ref=f3e247]: deepseek-flash
        - button "R：未配置" [ref=f3e248] [cursor=pointer]:
          - generic [ref=f3e250]: R
          - generic [ref=f3e251]: 未配置
        - button "Python：未配置" [ref=f3e252] [cursor=pointer]:
          - generic [ref=f3e254]: Python
          - generic [ref=f3e255]: 未配置
      - generic [ref=f3e256]:
        - generic [ref=f3e257]:
          - button "插件 8" [ref=f3e258] [cursor=pointer]:
            - generic [ref=f3e261]: 插件
            - generic [ref=f3e262]: "8"
          - button "Skills 9" [ref=f3e263] [cursor=pointer]:
            - generic [ref=f3e267]: Skills
            - generic [ref=f3e268]: "9"
          - button "MCP 1" [ref=f3e269] [cursor=pointer]:
            - generic [ref=f3e272]: MCP
            - generic [ref=f3e273]: "1"
          - button "子 Agent 22" [ref=f3e274] [cursor=pointer]:
            - generic [ref=f3e277]: 子 Agent
            - generic [ref=f3e278]: "22"
        - button "版本 v0.0.44" [ref=f3e279] [cursor=pointer]: v0.0.44
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
  16 |     await app.evaluate(() => {
  17 |       const state = { headers: 0, original: globalThis.fetch }
  18 |       ;(globalThis as typeof globalThis & { __dawnMcpHeaderProbe?: typeof state }).__dawnMcpHeaderProbe = state
  19 |       globalThis.fetch = async (...args) => {
  20 |         const response = await state.original(...args)
  21 |         if (response.headers.get('content-type')?.startsWith('text/event-stream')) state.headers++
  22 |         return response
  23 |       }
  24 |     })
  25 |     await 进设置(page, 'MCP 服务器')
  26 |     const add = page.getByText('加一台 MCP 服务器', { exact: true })
  27 |     const config = page.getByRole('textbox', { name: 'MCP 服务器的 JSON 配置' })
  28 |     if (!await config.isVisible()) await add.click()
  29 |     await config.fill(JSON.stringify({ mcpServers: { cancelprobe: f.config } }))
  30 |     await page.getByRole('button', { name: '加进来', exact: true }).click()
  31 |     await page.getByRole('button', { name: '试一次', exact: true }).first().click()
  32 |     await expect(page.getByText('连上了', { exact: true })).toBeVisible()
  33 |     const trust = page.getByRole('checkbox', { name: '这台我信得过' }).first()
  34 |     if (!await trust.isChecked()) await trust.click()
  35 |     await expect(trust).toBeChecked()
  36 |     await 开一段临时会话(page)
  37 |     await page.getByPlaceholder(/输入问题/).fill('MCP取消探针：等待响应后停止')
  38 |     await page.getByRole('button', { name: '发送', exact: true }).click()
  39 |     await expect.poll(() => f.calls).toContain('hold')
> 40 |     await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { __dawnMcpHeaderProbe?: { headers: number } }).__dawnMcpHeaderProbe?.headers)).toBe(1)
     |                                                                                                                                                                   ^ Error: expect(received).toBe(expected) // Object.is equality
  41 |     const runtime = await app.evaluate(async () => {
  42 |       const v8 = process.getBuiltinModule('node:v8'), vm = process.getBuiltinModule('node:vm')
  43 |       v8.setFlagsFromString('--expose_gc')
  44 |       const gc = vm.runInNewContext('gc') as () => void
  45 |       await new Promise<void>(resolve => setImmediate(resolve)); gc()
  46 |       await new Promise<void>(resolve => setImmediate(resolve)); gc()
  47 |       return { node: process.versions.node, electron: process.versions.electron }
  48 |     })
  49 |     await page.screenshot({ path: join(output, 'waiting-before-stop.png'), animations: 'disabled' })
  50 |     const started = performance.now()
  51 |     await page.getByRole('button', { name: '停止', exact: true }).click()
  52 |     await expect.poll(() => f.closedWaits.length, { timeout: 1000 }).toBe(1)
  53 |     const releaseMs = performance.now() - started
  54 |     await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible()
  55 |     await page.getByPlaceholder(/输入问题/).fill('MCP继续探针：保持同一会话与连接')
  56 |     await page.getByRole('button', { name: '发送', exact: true }).click()
  57 |     await expect.poll(() => f.calls.filter(name => name === 'echo').length).toBe(1)
  58 |     await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0)
  59 |     expect(f.generations()).toBe(1)
  60 |     expect(f.calls.filter(name => name === 'hold')).toHaveLength(1)
  61 |     await page.screenshot({ path: join(output, 'stopped-and-continued.png'), animations: 'disabled' })
  62 |     writeFileSync(join(output, 'result.json'), JSON.stringify({ runtime, forcedGc: true, releaseMs, serverStreamClosed: true, sameSessionGeneration: f.generations(), calls: f.calls, snapshot: f.snapshot(), boundary: 'Real Electron and loopback HTTP; deterministic model, no external MCP or paid inference.' }, null, 2) + '\n')
  63 |   } finally {
  64 |     try {
  65 |       await app.evaluate(() => {
  66 |         const tagged = globalThis as typeof globalThis & { __dawnMcpHeaderProbe?: { original: typeof fetch } }
  67 |         if (tagged.__dawnMcpHeaderProbe) { globalThis.fetch = tagged.__dawnMcpHeaderProbe.original; delete tagged.__dawnMcpHeaderProbe }
  68 |       })
  69 |     } finally { await f.close() }
  70 |   }
  71 | })
  72 | 
```