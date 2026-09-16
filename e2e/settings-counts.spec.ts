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

/**
 * 两台，起手都开着——**故意不写死数字，而是靠这条用例自己把一台关掉**：
 * 两台都开着时「数开着的」（`!off`）与「数配了几台」（`servers.length`）长得
 * 一模一样，都是 2；只有关掉一台之后再看，这两种口径才会分岔。
 */
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

test("**MCP 服务器那一行，关掉一台数字就掉一个**", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page, "MCP 服务器")
  // **按 `.name` 精确取行**，不是整行的子串——道理与插件那条一样（见下面那条用例的注释），
  // 这条自己也不能违反同一条规矩
  const 行 = page.locator(".settings-nav-item").filter({ has: page.locator(".name", { hasText: /^MCP 服务器$/ }) })
  await expect(行.locator(".side-count")).toHaveText("2")

  /**
   * **两台都开着的时候，「数开着的」与「数配了几台」长得一模一样**——都是 2。
   * 只断言这一步，等于让 `servers.length`（已经被否掉的口径）也蒙混过关。
   * 关掉一台再看：数「配了几个」的话这里仍然是 2，只有数「开着的」才会掉到 1
   * ——这才是这条任务真正要守住的那半句（*「关掉一台，数字掉一个」*）。
   */
  const 开关 = page.getByRole("checkbox", { name: "先别连它" }).first()
  await 开关.click()
  // **用 click 而不是 check()。** 受控复选框，拨一下要先写进本机的库、再重取名单
  // 才翻过来——`check()` 期待状态立刻变，会报「点了却没变」（照抄 mcp.spec.ts 的形状）
  await expect(开关).toBeChecked()
  await expect(行.locator(".side-count")).toHaveText("1")
})

test("**插件那一行也有一个同口径的数**", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page, "插件")
  // **按 `.name` 精确取行**，不是整行的子串——`.settings-nav-item` 整行的文本会带上
  // 行尾计数（「插件」+ 数字连在一起，不能整行做子串比对），而且仓库里已经有
  // 「浏览器插件」「Office 插件」这类名字，子串匹配迟早会撞上第二行
  const 行 = page.locator(".settings-nav-item").filter({ has: page.locator(".name", { hasText: /^插件$/ }) })
  const 起手文本 = await 行.locator(".side-count").textContent()
  const 起手数 = Number(起手文本)
  // **只断言「是个数」，不钉死具体几个**——钉死会在加插件那天无辜变红，
  // 而这条要守的是「这一行有数，而且它跟着开关走」
  expect(Number.isInteger(起手数)).toBe(true)

  /**
   * **关掉一个插件的主开关，数字要跟着掉一个**——与 MCP 那条用例同一个道理：
   * 起手就断言一个写死的数镇不住「口径对不对」，只有让它自己变一下才镇得住。
   * 相对上一步读到的数断言（`起手数 - 1`），不写死绝对值——这样以后再加一个
   * 内置插件，这条用例不会无辜变红。
   */
  const 开关 = page.getByRole("checkbox", { name: "启用这个插件" }).first()
  await expect(开关).toBeChecked()
  await 开关.click()
  await expect(开关).not.toBeChecked()
  await expect(行.locator(".side-count")).toHaveText(String(起手数 - 1))
})
