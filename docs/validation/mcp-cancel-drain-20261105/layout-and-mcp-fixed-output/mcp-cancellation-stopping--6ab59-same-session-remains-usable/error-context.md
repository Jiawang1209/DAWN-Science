# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mcp-cancellation.spec.ts >> stopping an HTTP MCP stream after GC closes its response and the same session remains usable
- Location: e2e/mcp-cancellation.spec.ts:11:1

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: locator('details.mcp-how')
Expected: ""
Error: strict mode violation: locator('details.mcp-how') resolved to 2 elements:
    1) <details open="" class="mcp-how">…</details> aka getByText('加一台 MCP 服务器粘贴服务器文档中的 JSON')
    2) <details class="mcp-how">…</details> aka getByText('配好之后怎么用？回到对话里说人话就行，不用记工具名。比如：查一下近五年「土地利用变化对土壤微生物多样性的影响」的综述， 挑三篇最相关的给我摘要，再按 APA')

Call log:
  - Expect "toHaveAttribute" with timeout 25000ms
  - waiting for locator('details.mcp-how')

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
          - button "MCP 服务器" [active] [ref=f2e125] [cursor=pointer]:
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
              - code [ref=f2e147]: /var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-AYX394/providers.yaml
            - group [ref=f2e148]:
              - generic "加一台 MCP 服务器" [ref=f2e149] [cursor=pointer]
              - paragraph [ref=f2e150]: 粘贴服务器文档中的 JSON 配置：
              - generic [ref=f2e151]: "{\"mcpServers\": { \"pubmed\": { \"command\": \"npx\", \"args\": [\"-y\", \"@cyanheads/pubmed-mcp-server\"], \"env\": { \"NCBI_API_KEY\": \"...\" } } }}"
              - paragraph [ref=f2e152]: 已经跑在服务器上的那种，给地址：
              - generic [ref=f2e153]: "{\"mcpServers\": { \"my-cloud\": { \"type\": \"http\", \"url\": \"https://your-server.example/mcp\", \"headers\": { \"Authorization\": \"Bearer ...\" } } }}"
              - textbox "MCP 服务器的 JSON 配置" [ref=f2e154]:
                - /placeholder: 把那段 JSON 粘在这里
              - paragraph [ref=f2e155]:
                - button "加进来" [ref=f2e156] [cursor=pointer]
              - paragraph [ref=f2e157]: 密钥不会写进配置文件：我们只留变量名，值在下面每台各自的输入框里填，存进系统钥匙串。别人的文档里 env 带着值，那种写法迟早把 key 提交上去。
              - paragraph [ref=f2e158]: Python 服务器用 uvx；远程服务器 type 填 http 或 sse，默认 http。
            - group [ref=f2e159]:
              - generic "配好之后怎么用？" [ref=f2e160] [cursor=pointer]
            - generic [ref=f2e161]:
              - paragraph [ref=f2e162]: 还没有配 MCP 服务器
              - paragraph [ref=f2e163]: "MCP 服务器是外部工具：数据库、文献库、领域 API 都有现成的。在上面那份文件里加一段 mcp: 就行——我们不需要为每样工具各写一遍代码。"
  - contentinfo "应用状态" [ref=f2e164]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f2e166] [cursor=pointer]
    - generic [ref=f2e167]:
      - generic [ref=f2e168]:
        - button "当前模型：deepseek-flash" [ref=f2e169] [cursor=pointer]:
          - generic [ref=f2e173]: deepseek-flash
        - button "R：未配置" [ref=f2e174] [cursor=pointer]:
          - generic [ref=f2e176]: R
          - generic [ref=f2e177]: 未配置
        - button "Python：未配置" [ref=f2e178] [cursor=pointer]:
          - generic [ref=f2e180]: Python
          - generic [ref=f2e181]: 未配置
      - generic [ref=f2e182]:
        - generic [ref=f2e183]:
          - button "插件 8" [ref=f2e184] [cursor=pointer]:
            - generic [ref=f2e187]: 插件
            - generic [ref=f2e188]: "8"
          - button "Skills 9" [ref=f2e189] [cursor=pointer]:
            - generic [ref=f2e193]: Skills
            - generic [ref=f2e194]: "9"
          - button "MCP 0" [ref=f2e195] [cursor=pointer]:
            - generic [ref=f2e198]: MCP
            - generic [ref=f2e199]: "0"
          - button "子 Agent 22" [ref=f2e200] [cursor=pointer]:
            - generic [ref=f2e203]: 子 Agent
            - generic [ref=f2e204]: "22"
        - button "版本 v0.0.44" [ref=f2e205] [cursor=pointer]: v0.0.44
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
  16 |     await app.evaluate((_electron, url) => {
  17 |       const state = { headers: 0, original: globalThis.fetch, url }
  18 |       ;(globalThis as typeof globalThis & { __dawnMcpHeaderProbe?: typeof state }).__dawnMcpHeaderProbe = state
  19 |       globalThis.fetch = async (...args) => {
  20 |         const response = await state.original(...args)
  21 |         const requestUrl = args[0] instanceof Request ? args[0].url : String(args[0])
  22 |         if (requestUrl === state.url && response.headers.get('content-type')?.startsWith('text/event-stream')) state.headers++
  23 |         return response
  24 |       }
  25 |     }, f.config.url)
  26 |     await 进设置(page, 'MCP 服务器')
  27 |     // This fixture has no servers, so the native details starts open. Wait
  28 |     // for the MCP page commit instead of toggling it based on an early query.
> 29 |     await expect(page.locator('details.mcp-how')).toHaveAttribute('open', '')
     |                                                   ^ Error: expect(locator).toHaveAttribute(expected) failed
  30 |     const config = page.getByRole('textbox', { name: 'MCP 服务器的 JSON 配置' })
  31 |     await expect(config).toBeVisible()
  32 |     await config.fill(JSON.stringify({ mcpServers: { cancelprobe: f.config } }))
  33 |     await page.getByRole('button', { name: '加进来', exact: true }).click()
  34 |     await page.getByRole('button', { name: '试一次', exact: true }).first().click()
  35 |     await expect(page.getByText('连上了', { exact: true })).toBeVisible()
  36 |     const trust = page.getByRole('checkbox', { name: '这台我信得过' }).first()
  37 |     if (!await trust.isChecked()) await trust.click()
  38 |     await expect(trust).toBeChecked()
  39 |     await 开一段临时会话(page)
  40 |     await page.locator('main.main .composer-field').fill('MCP取消探针：等待响应后停止')
  41 |     await page.getByRole('button', { name: '发送', exact: true }).click()
  42 |     await expect.poll(() => f.calls).toContain('hold')
  43 |     await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { __dawnMcpHeaderProbe?: { headers: number } }).__dawnMcpHeaderProbe?.headers)).toBe(1)
  44 |     const runtime = await app.evaluate(async () => {
  45 |       const v8 = process.getBuiltinModule('node:v8'), vm = process.getBuiltinModule('node:vm')
  46 |       v8.setFlagsFromString('--expose_gc')
  47 |       const gc = vm.runInNewContext('gc') as () => void
  48 |       await new Promise<void>(resolve => setImmediate(resolve)); gc()
  49 |       await new Promise<void>(resolve => setImmediate(resolve)); gc()
  50 |       return { node: process.versions.node, electron: process.versions.electron }
  51 |     })
  52 |     await page.screenshot({ path: join(output, 'waiting-before-stop.png'), animations: 'disabled' })
  53 |     const started = performance.now()
  54 |     await page.getByRole('button', { name: '停止', exact: true }).click()
  55 |     await expect.poll(() => f.closedWaits.length, { timeout: 1000 }).toBe(1)
  56 |     const releaseMs = performance.now() - started
  57 |     await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible()
  58 |     await page.locator('main.main .composer-field').fill('MCP继续探针：保持同一会话与连接')
  59 |     await page.getByRole('button', { name: '发送', exact: true }).click()
  60 |     await expect.poll(() => f.calls.filter(name => name === 'echo').length).toBe(1)
  61 |     await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0)
  62 |     expect(f.generations()).toBe(1)
  63 |     expect(f.calls.filter(name => name === 'hold')).toHaveLength(1)
  64 |     await page.setViewportSize({ width: 1280, height: 1100 })
  65 |     await page.locator('.main').getByText(/cancelprobe__echo/).last().scrollIntoViewIfNeeded()
  66 |     await page.screenshot({ path: join(output, 'stopped-and-continued.png'), animations: 'disabled' })
  67 |     writeFileSync(join(output, 'result.json'), JSON.stringify({ runtime, forcedGc: true, releaseMs, serverStreamClosed: true, sameSessionGeneration: f.generations(), calls: f.calls, snapshot: f.snapshot(), boundary: 'Real Electron and loopback HTTP; deterministic model, no external MCP or paid inference.' }, null, 2) + '\n')
  68 |   } finally {
  69 |     try {
  70 |       await app.evaluate(() => {
  71 |         const tagged = globalThis as typeof globalThis & { __dawnMcpHeaderProbe?: { original: typeof fetch } }
  72 |         if (tagged.__dawnMcpHeaderProbe) { globalThis.fetch = tagged.__dawnMcpHeaderProbe.original; delete tagged.__dawnMcpHeaderProbe }
  73 |       })
  74 |     } finally { await f.close() }
  75 |   }
  76 | })
  77 | 
```