import { test, expect, 开一段临时会话, 进设置 } from './fixtures.js'
import { mcpHttpFixture } from '../tests/mcp/http-fixture.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

test.use({ dawnOptions: { toolCall: [
  { when: 'MCP取消探针', toolName: 'cancelprobe__hold', args: {}, say: '等待 MCP 服务器返回，随后验证停止。' },
  { when: 'MCP继续探针', toolName: 'cancelprobe__echo', args: {}, say: '在同一连接继续调用 MCP。' },
] } })

test('stopping an HTTP MCP stream after GC closes its response and the same session remains usable', async ({ dawn }) => {
  const f = await mcpHttpFixture('http', true), { page, app } = dawn
  const output = resolve(process.env.DAWN_MCP_CANCEL_DEMO_DIR ?? 'test-results/mcp-cancellation-demo')
  mkdirSync(output, { recursive: true })
  try {
    await app.evaluate((_electron, url) => {
      const state = { headers: 0, original: globalThis.fetch, url }
      ;(globalThis as typeof globalThis & { __dawnMcpHeaderProbe?: typeof state }).__dawnMcpHeaderProbe = state
      globalThis.fetch = async (...args) => {
        const response = await state.original(...args)
        const requestUrl = args[0] instanceof Request ? args[0].url : String(args[0])
        if (requestUrl === state.url && response.headers.get('content-type')?.startsWith('text/event-stream')) state.headers++
        return response
      }
    }, f.config.url)
    await 进设置(page, 'MCP 服务器')
    // This fixture has no servers, so the native details starts open. Wait
    // for the MCP page commit instead of toggling it based on an early query.
    await expect(page.locator('details.mcp-how').filter({ has: page.getByText('加一台 MCP 服务器', { exact: true }) })).toHaveAttribute('open', '')
    const config = page.getByRole('textbox', { name: 'MCP 服务器的 JSON 配置' })
    await expect(config).toBeVisible()
    await config.fill(JSON.stringify({ mcpServers: { cancelprobe: f.config } }))
    await page.getByRole('button', { name: '加进来', exact: true }).click()
    await page.getByRole('button', { name: '试一次', exact: true }).first().click()
    await expect(page.getByText('连上了', { exact: true })).toBeVisible()
    const trust = page.getByRole('checkbox', { name: '这台我信得过' }).first()
    if (!await trust.isChecked()) await trust.click()
    await expect(trust).toBeChecked()
    await 开一段临时会话(page)
    await page.locator('main.main .composer-field').fill('MCP取消探针：等待响应后停止')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect.poll(() => f.calls).toContain('hold')
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { __dawnMcpHeaderProbe?: { headers: number } }).__dawnMcpHeaderProbe?.headers)).toBe(1)
    const runtime = await app.evaluate(async () => {
      const v8 = process.getBuiltinModule('node:v8'), vm = process.getBuiltinModule('node:vm')
      v8.setFlagsFromString('--expose_gc')
      const gc = vm.runInNewContext('gc') as () => void
      await new Promise<void>(resolve => setImmediate(resolve)); gc()
      await new Promise<void>(resolve => setImmediate(resolve)); gc()
      return { node: process.versions.node, electron: process.versions.electron }
    })
    await page.screenshot({ path: join(output, 'waiting-before-stop.png'), animations: 'disabled' })
    const started = performance.now()
    await page.getByRole('button', { name: '停止', exact: true }).click()
    await expect.poll(() => f.closedWaits.length, { timeout: 1000 }).toBe(1)
    const releaseMs = performance.now() - started
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible()
    await page.locator('main.main .composer-field').fill('MCP继续探针：保持同一会话与连接')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect.poll(() => f.calls.filter(name => name === 'echo').length).toBe(1)
    await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0)
    expect(f.generations()).toBe(1)
    expect(f.calls.filter(name => name === 'hold')).toHaveLength(1)
    await page.setViewportSize({ width: 1280, height: 1100 })
    await page.locator('.main').getByText(/cancelprobe__echo/).last().scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(output, 'stopped-and-continued.png'), animations: 'disabled' })
    writeFileSync(join(output, 'result.json'), JSON.stringify({ runtime, forcedGc: true, releaseMs, serverStreamClosed: true, sameSessionGeneration: f.generations(), calls: f.calls, snapshot: f.snapshot(), boundary: 'Real Electron and loopback HTTP; deterministic model, no external MCP or paid inference.' }, null, 2) + '\n')
  } finally {
    try {
      await app.evaluate(() => {
        const tagged = globalThis as typeof globalThis & { __dawnMcpHeaderProbe?: { original: typeof fetch } }
        if (tagged.__dawnMcpHeaderProbe) { globalThis.fetch = tagged.__dawnMcpHeaderProbe.original; delete tagged.__dawnMcpHeaderProbe }
      })
    } finally { await f.close() }
  }
})
