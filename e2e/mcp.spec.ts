/**
 * MCP 那一屏：**配、试、看见**（2026-08-15）。**跑真实构建产物 + 真 MCP 服务器。**
 *
 * 用的是 `scripts/mcp-test-server.mjs`——单元测试用的也是这一份
 * （准入规则 1：两套假后端会各自漂移）。它真的走 stdio、真的说 MCP 协议。
 *
 * ## 为什么这几条非得在真实产物上跑
 *
 * 这条链路横跨五层：YAML → 名单合并 → 起子进程说协议 → 协议操作 → 界面。
 * 单元测试每一层都验过了，**但它们证明不了这五层接在一起**——
 * 而这个项目栽的三次（门、内核、MCP 装配）全都是「每层都对，接线断了」。
 *
 * ## 三条判据各自对着一种「静默」
 *
 * ① 配了但没试过 → 界面要说「还没试过」，**不能显示成故障**
 * ② 按「试一次」→ 真的连上，**并把它有哪些工具列出来**
 * ③ 缺密钥 → **点名说缺哪个**，而不是笼统一句「没配好」
 */
import { test, expect } from "./fixtures.js"
import { join } from "node:path"

const 脚本 = join(process.cwd(), "scripts", "mcp-test-server.mjs")

/** 两台：一台直接能连，一台要密钥。**同一份配置里**，好让「点名」有对照 */
const 配置 = `mcp:
  测试台:
    command: ${JSON.stringify(process.execPath)}
    args: [${JSON.stringify(脚本)}]
  要密的:
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

test("**配了的两台都列出来，还没试过就说还没试过**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "MCP 服务器" }).click()

  /**
   * **按 `.skill-name` 找，不按精确文本。**
   * 那一行里除了名字还有「全局 / 这个项目带的」那个注脚——
   * 探针实测它的文本是 `"测试台全局"`，精确匹配对不上。
   */
  const 名字 = await page.locator(".skill-name").allTextContents()
  expect(名字.join("|")).toContain("测试台")
  expect(名字.join("|")).toContain("要密的")

  /**
   * **缺密钥要点名**（规格 7.5）。
   * 笼统一句「没配好」会让人对着几个变量挨个试。
   */
  await expect(page.getByText(/还差 DAWN_MCP_TEST_SECRET/)).toBeVisible()

  /** 没试过的那台**不该显示成连上了** —— 「还没试过」与「连不上」是两回事 */
  await expect(page.getByText("连上了")).toHaveCount(0)
})

test("**按「试一次」，真的连上并列出它有哪些工具**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "MCP 服务器" }).click()

  // 第一颗「试一次」属于「测试台」那一条
  await page.getByRole("button", { name: "试一次" }).first().click()

  await expect(page.getByText("连上了")).toBeVisible({ timeout: 30_000 })
  /**
   * **工具清单必须真的出来。** 只说「连上了」的话，
   * 「连上了但一个工具都没有」与「连上了且能用」在屏幕上长得一样。
   */
  await expect(page.getByText(/echo/)).toBeVisible()
  await expect(page.getByText(/3 个工具/)).toBeVisible()
})

/**
 * **信任开关拨得动，而且它不写进配置文件。**
 *
 * 这条守的是一个安全性质：项目级名单住在 `.dawn/mcp.yaml`，
 * **会跟着仓库被 clone**——让它声明自己可信等于没有门。
 * 所以开关落在本机的库里，界面上拨完要留得住。
 */
test("信任开关拨完留得住", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "MCP 服务器" }).click()

  const 开关 = page.getByRole("checkbox", { name: "这台我信得过" }).first()
  await expect(开关).not.toBeChecked()
  /**
   * **用 click 而不是 check()。**
   * 这是个受控复选框：拨一下要先写进本机的库、再重取名单才翻过来。
   * `check()` 期待状态立刻变，于是它会报「点了却没变」——
   * 而那时开关其实是好的（探针实测 false → true）。
   */
  await 开关.click()
  await expect(开关).toBeChecked()

  // 切走再切回来：**留不住的话，那一下只是界面上的假动作**
  await page.getByRole("button", { name: "技能" }).click()
  await page.getByRole("button", { name: "MCP 服务器" }).click()
  await expect(page.getByRole("checkbox", { name: "这台我信得过" }).first()).toBeChecked()
})
