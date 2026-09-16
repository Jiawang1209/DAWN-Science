/**
 * 「扩展」那一组的行尾计数（2026-09-16，作者要的）。
 *
 * 作者：*「设置里面的 MCP 服务器，我其实希望你能在后面增加上数字，
 * 类似我们的 skills 后面增加配置好的数字。」*
 *
 * **口径 = 开着的台数**（与 `设技能数(开着的.length)` 一致）。三种读法里
 * 「连上的几台」被否掉是因为它会骗人：`state` 在手动点过「测试」之前一律是
 * `unknown`，那个数多数时候会是 0。
 */
import { test, expect, 进设置 } from "./fixtures.js"
import { join } from "node:path"

const 脚本 = join(process.cwd(), "scripts", "mcp-test-server.mjs")

/** 两台，都不关 —— 所以期望的数字是 2 */
const 配置 = `mcp:
  testbox:
    command: ${JSON.stringify(process.execPath)}
    args: [${JSON.stringify(脚本)}]
  needskey:
    command: ${JSON.stringify(process.execPath)}
    args: [${JSON.stringify(脚本)}]
    env: [DAWN_MCP_TEST_SECRET]
agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat]
`

test.use({ dawnOptions: { providersYaml: 配置 } })

test("**MCP 服务器那一行，行尾的数是开着的台数**", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page, "外观")
  const 行 = page.locator(".settings-nav-item").filter({ hasText: "MCP 服务器" })
  await expect(行.locator(".side-count")).toHaveText("2")
})

test("**插件那一行也有一个同口径的数**", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page, "外观")
  const 行 = page.locator(".settings-nav-item").filter({ hasText: "插件" })
  // 内置插件至少一个（Office 那张卡），默认开着。**只断言「有个数且不是空」**——
  // 钉死具体几个会在加插件那天无辜变红，而这条要守的是「这一行有数」
  await expect(行.locator(".side-count")).toHaveText(/^\d+$/)
})
