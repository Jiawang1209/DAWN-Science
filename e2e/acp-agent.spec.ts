/**
 * ACP agent 走通一整段对话（A1，2026-08-16，分支 `acp`）。**跑真实构建产物。**
 *
 * ## 这条用例是 A1 的完成判据
 *
 * 设计文档里写着：*「跑不通之前所有设计都是纸上的。」*
 * 单元那侧已经证明运行时会说 ACP，但**它证明不了这条路在应用里接上了**——
 * 配置 → `SessionManager` 的分发 → 事件流 → 转录 → 渲染，中间任何一节断了，
 * 屏幕上都是「发了没反应」。
 *
 * ## 顺带验掉一条跨平台的
 *
 * 配置里写的是 `command: node`——那是一个**记号**，会被换成
 * Electron 自己那个二进制（`ELECTRON_RUN_AS_NODE`）。
 * 所以这条用例同时证明：**一台没装 Node 的机器上，ACP 也起得来**。
 * 那正是「打包成本地软件」最先会咬人的地方。
 */
import { resolve } from "node:path"
import { test, expect, 等进了对话, 用某个agent开一段, readRuns } from "./fixtures.js"

const 假ACP = resolve(import.meta.dirname, "..", "scripts", "fake-acp-agent.mjs")

const PROVIDERS = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]
  claude-acp:
    kind: acp
    command: node
    args: ["${假ACP}"]
    capabilities: [chat, exec]
  问权限的-acp:
    kind: acp
    command: node
    args: ["${假ACP}"]
    capabilities: [chat, exec]
  坏掉的-acp:
    kind: acp
    command: 这个命令肯定不存在-dawn
    args: []
    capabilities: [chat, exec]
`

test.describe("ACP", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS, gitInit: true } })

  test("**一整段对话跑得通**，且模型旁边标着 ACP", async ({ dawn }) => {
    const { page } = dawn

    // 用 ACP 那个 agent 开一段
    await 用某个agent开一段(page, /claude-acp/)
    await 等进了对话(page)

    /**
     * ① **标签要在模型旁边**（作者定的第一条）。
     *
     * 三条路的能力真的不一样——`API` 权限门管得住、`CLI` 管不到也不问、
     * `ACP` 管不到但会主动问。不标出来，
     * 「为什么这次它没问我就删了文件」永远说不清。
     */
    await expect(page.locator(".conv-head .kind")).toHaveText("ACP")

    // ② 一句话进去，回话出来——**整条链通了**
    await page.getByPlaceholder(/今天帮你做些什么/).fill("在吗")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假 ACP agent 已应答/).last()).toBeVisible({ timeout: 30_000 })

    // ③ **它真的收到了我们说的那句**，不是自说自话
    await expect(page.getByText(/你说的是：在吗/).last()).toBeVisible({ timeout: 30_000 })

    /**
     * ④ **这一轮要收口。** 账本靠 `idle` 关账；不收口的表现是
     * 那三个点一直转——本项目为「一个永远在转的记号」撤过一次功能。
     */
    await expect(page.locator(".waiting")).toHaveCount(0, { timeout: 30_000 })
  })

  /**
   * **起不来要说清楚。**
   *
   * 一个填错的 command 是最常见的失败（作者的机器上没有那个适配器），
   * 而它此前唯一可能的表现是「点了没反应」。
   */
  test("**适配器起不来时，屏幕上有一句人话**", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /坏掉的/)
    /**
     * 失败要出现在**屏幕上**，不是只在主进程日志里。
     * 空态那张卡上那条 `.composer-problem` 就是这类失败的家
     * （与「挑了一个起不来的 agent」共用同一个出口）。
     */
    await expect(page.locator(".composer-problem")).toContainText(/起不来 ACP 适配器/, {
      timeout: 30_000,
    })
  })
})


/**
 * 权限卡（A2 下半，2026-08-16）。
 *
 * **这是 ACP 相对 `cli` 最实的那个差别**：agent 停下来问，
 * 而**按钮文案是它给的**。
 *
 * 假 agent 被要求在回话之前问一次（`FAKE_ACP_ASK`），
 * 并把收到的答案**原样说回来**——用例据此确认「点了哪个，它就收到哪个」。
 */
test.describe("ACP 权限卡", () => {
  test.use({
    dawnOptions: {
      providersYaml: PROVIDERS,
      gitInit: true,
      env: { FAKE_ACP_ASK: "1" },
    },
  })

  test("**它问，卡出现；点一个，它就收到那一个**", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /claude-acp/)
    await 等进了对话(page)

    await page.getByPlaceholder(/今天帮你做些什么/).fill("读一下那个 csv")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    // ① 卡出现，**标题是它给的**
    const 卡 = page.locator(".perm-card")
    await expect(卡).toBeVisible({ timeout: 30_000 })
    await expect(卡).toContainText("观测.csv")

    /**
     * ② **按钮文案原样来自 agent。**
     * 自己编一套的后果是：屏幕上写着「允许一次」，而它那边没有这个概念，
     * 我们回过去的 id 它不认——表现是「点了没反应」。
     */
    for (const 名 of ["允许这一次", "以后都允许", "这次不行"]) {
      await expect(卡.getByRole("button", { name: 名, exact: true })).toBeVisible()
    }

    // ③ 点一个，**它收到的就是那一个**
    await 卡.getByRole("button", { name: "以后都允许", exact: true }).click()
    await expect(page.getByText(/【权限结果】/).last()).toContainText('"optionId":"always"', {
      timeout: 30_000,
    })

    // ④ **答完卡要消失**：留着的话按钮还能按，而按了什么都不会发生
    await expect(卡).toHaveCount(0)
  })

  /** 「这一轮先不做」= 取消，**与「拒绝」不是一回事** */
  test("**取消与拒绝不是一回事**", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /问权限的-acp/)
    await 等进了对话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("读一下")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    const 卡 = page.locator(".perm-card")
    await expect(卡).toBeVisible({ timeout: 30_000 })
    await 卡.getByRole("button", { name: "这一轮先不做", exact: true }).click()
    await expect(page.getByText(/【权限结果】/).last()).toContainText('"outcome":"cancelled"', {
      timeout: 30_000,
    })
  })
})

/**
 * 取消（A3，2026-08-16）。
 *
 * ## 这条路此前**整个不存在**
 *
 * 停止按钮的开关写死成 `session.kind === "native"`——ACP 的 `abort()`
 * 早就实现了（发一条 `session/cancel`），**只是没人调**。
 * 那是最难发现的一类缺陷：运行时那侧的判据全绿，而界面上根本没有那颗键。
 *
 * 假 agent 被要求慢慢吐（每段之间停一会儿），并在收到取消时
 * **留一句可断言的痕迹**——不留的话，「取消生效了」与
 * 「它本来就只说了这么多」在屏幕上长得一模一样。
 */
test.describe("ACP 取消", () => {
  test.use({
    dawnOptions: {
      providersYaml: PROVIDERS,
      gitInit: true,
      env: { FAKE_ACP_CHUNK_DELAY_MS: "3000" },
    },
  })

  test("**跑起来能停**，停了就真的停了", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /claude-acp/)
    await 等进了对话(page)

    await page.getByPlaceholder(/今天帮你做些什么/).fill("说点什么")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    // ① 跑起来之后，**同一个位置上是「停止」**
    const 停止 = page.getByRole("button", { name: "停止", exact: true })
    await expect(停止).toBeVisible({ timeout: 20_000 })

    await 停止.click()

    // ② agent 真的收到了取消——**这句痕迹是它自己留的**
    await expect(page.getByText(/【被取消了】/).last()).toBeVisible({ timeout: 20_000 })

    /**
     * ③ 那三个点也要停。**一个永远在转的记号比没有更糟**——
     * 本项目为它撤过一次功能。
     */
    await expect(page.locator(".waiting")).toHaveCount(0, { timeout: 20_000 })

    // ④ 按钮变回「发送」：这一轮真的收口了
    await expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible({
      timeout: 20_000,
    })
  })
})

/**
 * 会话开关（A3，2026-08-16）。
 *
 * **ACP 里没有「换模型」这个操作**——它有的是一串开关，
 * 每一条是「选一个」或「开/关」，而模型只是 `category` 的一个取值。
 * 所以我们照单全收、照单渲染，**一条都不挑**：
 * 挑的话，agent 加了新开关我们就看不见了。
 *
 * 假 agent 声称有三条**形状各不相同**的：一个 model 的 select、
 * 一个带分组的 select、一个 boolean。
 */
test.describe("ACP 会话开关", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS, gitInit: true } })

  test("**它给什么就画什么**，选一个真的送过去", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /claude-acp/)
    await 等进了对话(page)

    /**
     * ① 按钮上写的是**当前那个模型**，不是「会话设置」四个字——
     * 一个只写「设置」的按钮，要点开才知道现在用的是谁。
     */
    const 触发 = page.locator(".sess-config-trigger")
    await expect(触发).toBeVisible({ timeout: 30_000 })
    await expect(触发).toContainText("Sonnet")

    await 触发.click()
    const 菜单 = page.locator(".sess-config-menu")

    // ② 三条都在，**名字是它给的**
    for (const 名 of ["模型", "推理强度", "不再逐个确认"]) {
      await expect(菜单).toContainText(名)
    }
    // ③ **带分组的那一条要被摊平**：不摊的话它是个没有选项的空组
    for (const 名 of ["低", "高"]) {
      await expect(菜单.getByRole("menuitemradio", { name: 名, exact: true })).toBeVisible()
    }
    // ④ boolean 画成可勾选的那种，不是两个单选
    await expect(菜单.getByRole("menuitemcheckbox")).toHaveCount(1)

    // ⑤ 选一个，**它真的换了**（按钮上的字跟着变）
    await 菜单.getByRole("menuitemradio", { name: "Opus", exact: true }).click()
    await expect(触发).toContainText("Opus", { timeout: 20_000 })
  })

  test.describe("不给开关时", () => {
    test.use({ dawnOptions: { providersYaml: PROVIDERS, gitInit: true, env: { FAKE_ACP_NO_CONFIG: "1" } } })

    /** **一个开关都没有时不画那颗按钮**——不摆一个点开是空的菜单 */
      test("那颗按钮不出现", async ({ dawn }) => {
      const { page } = dawn
      await 用某个agent开一段(page, /claude-acp/)
      await 等进了对话(page)
      await expect(page.locator(".sess-config-trigger")).toHaveCount(0)
    })
  })
})

/**
 * ACP 的 token 进「用量」（A4，2026-08-16）。
 *
 * **整条线**：适配器报累计 → 运行时算差值并标上「谁花的」→ 账本 →
 * 汇总 → 那一屏的饼图。中间任何一节断了，饼图上就没有它。
 *
 * 作者定的口径：**与内置对话合并统计**（*「毕竟它只是一个参考」*）。
 */
test.describe("ACP 用量", () => {
  test.use({
    dawnOptions: { providersYaml: PROVIDERS, gitInit: true, env: { FAKE_ACP_USAGE: "1" } },
  })

  test("**跑一轮之后，饼图上分得出这台 ACP agent**", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /claude-acp/)
    await 等进了对话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("在吗")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假 ACP agent 已应答/).last()).toBeVisible({ timeout: 30_000 })

    await page.getByRole("button", { name: "设置", exact: true }).click()
    await page.getByRole("button", { name: "用量", exact: true }).click()
    await expect(page.locator(".usage-heat")).toBeVisible({ timeout: 15_000 })

    // ① 累计不是 0——**这一条就是「整条线通没通」**
    await expect(page.locator(".usage-stat").first().locator(".usage-stat-value")).not.toHaveText("0")

    /**
     * ② 图例上是那台 agent 的模型。
     *
     * 显示时会去掉斜杠前那一段（`claude-acp/sonnet` → `sonnet`），
     * 所以这里断言的是模型名——**它不是编的，是那台 agent 自己报的开关值**。
     */
    await expect(page.locator(".usage-legend-name").first()).toHaveText("sonnet")
  })
})

/**
 * **把我们自己的工具递给它**（B1 路线 B，2026-08-17）。
 *
 * ## 这条用例证明的是什么
 *
 * 不是「我们发过 `mcpServers`」——那只是一句声明。
 * 假 agent 会**真的把那台服务器拉起来**、用手写的 MCP 三句话
 * （initialize / tools/list / tools/call）问它，然后把结果说回来。
 *
 * 于是它证明的是整条路：
 * ```
 * ACP agent ──▶ dawn-mcp-server.mjs ──socket+令牌──▶ DAWN ──▶ 账本
 * ```
 *
 * **假 agent 刻意不引 MCP SDK**：引了的话它就跟被测代码共用同一份实现，
 * 那时它证明的是「SDK 自洽」，不是「我们那台服务器能用」。
 */
test.describe("ACP 用我们的工具", () => {
  test.use({
    dawnOptions: { providersYaml: PROVIDERS, gitInit: true, env: { FAKE_ACP_CALL_MCP: "1" } },
  })

  test("**它真的连上了 DAWN，拿到工具并调得动**", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /claude-acp/)
    await 等进了对话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("用一下 DAWN 的工具")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    const 结果 = page.getByText(/【MCP 结果】/).last()
    await expect(结果).toBeVisible({ timeout: 30_000 })

    // ① **工具清单是从 DAWN 现问现答的**，不是那台服务器自己编的
    await expect(结果).toContainText("dawn_list_skills")
    await expect(结果).toContainText("dawn_record_note")

    // ② **调用真的走通了**：这句回执是 DAWN 那边生成的
    await expect(结果).toContainText("记下了：经 MCP 记的一条")

    /**
     * ③ **落账，而且挂在那一轮上**——这才是路线 B 的立身之本。
     *
     * wisp 那套能力网关是围绕「能力范围」设计的；我们围绕的是不变式 5：
     * **外部 agent 经这条路做的每一件事都留在账本上，并且指得出属于哪一轮。**
     * 少了父账，那些调用就是一堆孤儿，「这一轮它到底干了什么」再也拼不起来。
     */
    await expect
      .poll(async () => (await readRuns(dawn.dbPath)).filter((r) => String(r["request_type"]).startsWith("acp_tool:")).length, {
        message: "经 MCP 的调用没有落账",
        timeout: 15_000,
      })
      .toBeGreaterThan(0)

    const 账 = await readRuns(dawn.dbPath)
    const 那一轮 = 账.find((r) => r["request_type"] === "agent_turn")
    const 工具账 = 账.filter((r) => String(r["request_type"]).startsWith("acp_tool:"))
    expect(工具账.map((r) => r["request_type"])).toContain("acp_tool:dawn_record_note")
    expect(工具账[0]?.["parent_run_id"], "父账没挂在那一轮上").toBe(那一轮?.["id"])
    // **是 agent 干的，不是人**——账本上这两者不能混
    expect(工具账[0]?.["origin"]).toBe("agent")
  })
})
