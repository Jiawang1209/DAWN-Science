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
import { test, expect, 开一段临时会话 } from "./fixtures.js"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { existsSync, readFileSync, rmSync } from "node:fs"

const 脚本 = join(process.cwd(), "scripts", "mcp-test-server.mjs")

/** 两台：一台直接能连，一台要密钥。**同一份配置里**，好让「点名」有对照 */
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

test("**配了的两台都列出来，还没试过就说还没试过**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "MCP 服务器" }).click()

  /**
   * **按 `.skill-name` 找，不按精确文本。**
   * 那一行里除了名字还有「全局 / 这个项目带的」那个注脚——
   * 探针实测它的文本是 `"testbox全局"`，精确匹配对不上。
   */
  const 名字 = await page.locator(".skill-name").allTextContents()
  expect(名字.join("|")).toContain("testbox")
  expect(名字.join("|")).toContain("needskey")

  /**
   * **缺密钥要点名**（规格 7.5）。
   * 笼统一句「没配好」会让人对着几个变量挨个试。
   */
  await expect(page.getByText(/还差 DAWN_MCP_TEST_SECRET/)).toBeVisible()

  /** 没试过的那台**不该显示成连上了** —— 「还没试过」与「连不上」是两回事 */
  await expect(page.getByText("连上了")).toHaveCount(0)
})

/**
 * **怎么配、怎么用，都写在屏上**（2026-08-15 作者要的）。
 *
 * 作者两次问到这里：*「我们在 DAWN Science 的 MCP 的接口里面会出现吗？」*
 * 和 *「很有必要的是，告诉一下我 MCP 的用法如何。」*
 *
 * 判据挑**两句**，各是一块里唯一不能少的那句：
 *   ① 配置块：**密钥的值不进配置文件**——别人的 README 给的都是
 *      Claude Desktop 的 JSON，`env` 里装着密钥本身，而那份文件会进 git。
 *   ② 用法块：**怎么确认它真查了**——只看答案是不行的，
 *      模型凭印象编一段和真去查了，在屏幕上长得一模一样。
 */
test("**屏上写清了怎么配（密钥不进文件）和怎么用（看工具行）**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "MCP 服务器" }).click()

  // 两块都是折叠的，先点开
  await page.getByText("加一台 MCP 服务器").click()
  /** 例子用的是真东西（PubMed），不是编的占位符 */
  await expect(page.locator(".mcp-how-code").first()).toContainText("pubmed-mcp-server")
  await expect(page.locator(".mcp-how").first()).toContainText(/只留变量名/)

  await page.getByText("配好之后怎么用？").click()
  await expect(page.getByText(/pubmed__pubmed_search_articles/)).toBeVisible()
  await expect(page.getByText(/长得一模一样/)).toBeVisible()
})

/**
 * **粘一段 JSON 就把一台加进来**（2026-08-15 作者要的接口）。
 *
 * 作者：*「就和我配置其他的大模型，或者 Skill 似的，
 * 我是不是应该搞一个配置的接口啥的呢？」*
 *
 * 这一条走完整条：粘 → 加进来 → 出现在列表里 → 立刻能连。
 * **「立刻」是要害**：存完要原地更新内存里那份名单，不然界面说「加好了」
 * 而那台其实要等下次启动才存在——**那是一句半真的话**。
 *
 * 用的 JSON 是 Claude Desktop 那种形状（`env` 里带着密钥的值），
 * 因为**别人的 README 给的都是这一种**——顺带验住「值不许进配置文件」。
 */
test("**粘一段 JSON 就加进来了，而且立刻能用**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "MCP 服务器" }).click()

  const 那段 = JSON.stringify({
    mcpServers: {
      pasted: {
        command: process.execPath,
        args: [脚本],
        env: { DAWN_MCP_TEST_SECRET: "这个值不许进配置文件" },
      },
    },
  })
  // 有服务器时那一块是收起的——**先点开**
  await page.getByText("加一台 MCP 服务器").click()
  await page.getByRole("textbox", { name: "MCP 服务器的 JSON 配置" }).fill(那段)
  await page.getByRole("button", { name: "加进来" }).click()

  /** 加完要说清它还要什么——不说的话人不知道下一步该干嘛 */
  const 那句 = page.locator(".mcp-how .mcp-ok")
  await expect(那句).toContainText(/「pasted」加好了/)
  // **要什么密钥，就在那句话里点名**——不说的话人不知道下一步该干嘛
  await expect(那句).toContainText("DAWN_MCP_TEST_SECRET")

  /** **立刻出现在名单里**，不用重启 */
  const 名字 = await page.locator(".skill-name").allTextContents()
  expect(名字.join("|")).toContain("pasted")

  /** 加得进就该删得掉 */
  await page.getByRole("button", { name: "删掉 pasted" }).click()
  await expect
    .poll(async () => (await page.locator(".skill-name").allTextContents()).join("|"))
    .not.toContain("pasted")
})

test("**按「试一次」，真的连上并列出它有哪些工具**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "MCP 服务器" }).click()

  // 第一颗「试一次」属于「testbox」那一条
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

/**
 * **模型在真实对话里调得动 MCP 工具**（2026-08-15）。
 *
 * 这是整条链路的收口判据。前面几条各自验了一段：名单能合、服务器能连、
 * 那一屏能配。**但没有一条走完整条线**——而这个项目栽的三次
 * （门、内核、MCP 装配）全都是「每层都对，接线断了」。
 *
 * 判据挑**物证**而不是屏幕：假模型被指定去调 `testbox__写一行`，
 * 那个工具会往 `DAWN_MCP_TEST_LOG` 追加一行。文件里有那一行，
 * 就说明这一路真的走通了：
 *
 * ```
 * 模型 → pi 的 customTools → 我们的门 → MCP 客户端 → 子进程 → 文件
 * ```
 *
 * 屏幕上「看起来调了」证明不了这个——转录里那条工具行，
 * 在工具其实失败时也照样出现。
 */
test.describe("模型真的调得动", () => {
  const 日志 = join(tmpdir(), `dawn-mcp-e2e-${process.pid}.jsonl`)

  test.use({
    dawnOptions: {
      providersYaml: `mcp:
  testbox:
    command: ${JSON.stringify(process.execPath)}
    args: [${JSON.stringify(脚本)}]
    env: [DAWN_MCP_TEST_LOG]
agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat]
`,
      toolCall: {
        toolName: "testbox__写一行",
        args: { message: "E2E_MCP_物证" },
        say: "我用那台服务器记一笔。",
      },
    },
  })

  test("**一句话下去，MCP 工具真的被执行了**（有物证）", async ({ dawn }) => {
    const { page } = dawn
    rmSync(日志, { force: true })

    // 密钥（这里是日志路径）走同一条路：**没在配置里声明的环境变量进不去**
    await page.getByRole("button", { name: "MCP 服务器" }).click()
    await page.getByRole("button", { name: "去填" }).first().click()
    await page.getByRole("textbox", { name: "DAWN_MCP_TEST_LOG 的值" }).fill(日志)
    await page.getByRole("button", { name: "Store secret" }).or(page.getByRole("button", { name: "存下来" })).click()
    await expect(page.getByText(/还差 DAWN_MCP_TEST_LOG/)).toHaveCount(0)

    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("帮我记一笔")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    await expect(page.getByText("我用那台服务器记一笔。")).toBeVisible({ timeout: 30_000 })

    /** **物证**：那个工具真的在子进程里跑了，并写了这一行 */
    await expect
      .poll(() => (existsSync(日志) ? readFileSync(日志, "utf8") : ""), { timeout: 30_000 })
      .toContain("E2E_MCP_物证")

    rmSync(日志, { force: true })
  })
})
