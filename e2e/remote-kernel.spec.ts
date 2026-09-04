/**
 * 远程内核（2026-09-03）。**跑真实构建产物，对着那台假服务器，内核是本机真起的 ipykernel。**
 *
 * 假的只有「另一端是谁」：起内核、写 connection.json、五条隧道、attach、停内核走的全是真代码
 * （`fake-ssh-kernel.ts` 认 `DAWN_FAKE_SSH_PYTHON`，用它 spawn 一台真 ipykernel）。
 *
 * 机器相关：要 `dawn-spike` kernelspec 指的那条 python（与 `notebook.spec.ts` 同一口径），没有就跳过。
 * **describe 名字里刻意不含「内核会话」「解释器路径」**：`test:e2e:only` 用这两个词把机器相关的
 * spec 排除在外，本文件与 `notebook.spec.ts` 一样靠 `test.skip` 自己把关。
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { test, expect, 进坞 } from "./fixtures.js"

const KERNEL = "dawn-spike"
const KERNEL_JSON = join(homedir(), "Library", "Jupyter", "kernels", KERNEL, "kernel.json")
const 有 = existsSync(KERNEL_JSON)
/** 解释器路径照 kernelspec 里 `argv[0]` 来——那才是这台机器上真能起 ipykernel 的 python */
const PY = 有 ? ((JSON.parse(readFileSync(KERNEL_JSON, "utf8")) as { argv?: string[] }).argv?.[0] ?? "") : ""

/** 那条 python 里 `import <名>` 走不走得通。**真跑一次**——「装没装」不能靠猜 */
function 能import(名: string): boolean {
  if (!有) return false
  return spawnSync(PY, ["-c", `import ${名}`], { timeout: 20_000 }).status === 0
}

/**
 * 画一张图的那段代码（定案 6：图从远端内核回来，人在笔记本里看得见）。
 *
 * **优先 matplotlib**，它才是人真会写的那一句；这台机器上的 `dawn-spike` python 里
 * 没装它，就退到 `IPython.display`——**要验的东西一个字都没少**：
 * 走的仍是内核吐 `display_data{image/png}` → 隧道 → `KernelOutputRow` 那条真链路，
 * 变的只是这一张 png 是谁生成的。
 *
 * **不为此跳过整条用例**：一条在这台机器上永远跳过的用例什么都不证明，
 * 而 `IPython` 是 ipykernel 的依赖——有内核就一定有它。
 */
const 有matplotlib = 能import("matplotlib")
/** 1×1 的透明 png，`IPython.display` 那条路用它；内容不重要，是不是 `image/png` 才重要 */
const 一像素 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
const 画图代码 = 有matplotlib
  ? 'import matplotlib\nmatplotlib.use("Agg")\nimport matplotlib.pyplot as plt\nplt.plot([1, 2, 3])\nplt.gcf()'
  : `from IPython.display import display, Image\nimport base64\ndisplay(Image(data=base64.b64decode("${一像素}")))`

test.use({
  dawnOptions: {
    fakeSsh: true,
    fakeSshPython: PY,
    realKernels: true,
    /**
     * **`perTurn`，不是默认的 `once`**（与 `remote-connections.spec.ts` 的「断线重连」同一条理由）：
     * 第二条用例要在断开重连之后再跑一次代码，而 `once` 只调第一轮——
     * 不加的话第二句根本不会调 `run_code`，内核也就不会起新的一台，
     * 「起了新的一台」那条断言就变成在验一个没发生过的动作。
     */
    toolCall: {
      toolName: "run_code",
      args: { language: "python", code: "x = 40 + 2\nprint(x)" },
      say: "我在服务器上算。",
      perTurn: true,
    },
  },
})

/** 加一台假服务器，并在它上面开一段对话。三条用例的共同起点 */
async function 加一台并开对话(page: import("@playwright/test").Page) {
  // **2026-08-14 改名**：「远端连接」→「远端服务器」；默认收起，先掀开
  const head = page.getByRole("button", { name: /远端服务器/ })
  await expect(head).toBeVisible()
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click()
  await page.getByRole("button", { name: /添加服务器/ }).click()
  await page.locator("#conn-host").fill("fake.example")
  await page.locator("#conn-user").fill("dawn")
  await page.locator("#conn-label").fill("假机器")
  // 假服务器认的口令写死为 `dawn`（见 src/remote/fake-ssh.ts）
  await page.locator("#conn-secret").fill("dawn")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })
}

/**
 * 在笔记本格那一屏选中唯一的 python 候选。
 *
 * **用 `click()` 而不是 `check()`**：`check()` 点完还要回头确认那颗 radio 真的 checked 了，
 * 而这一屏的命根子恰恰是「选完这一格就换了样子」——未配从两门变成一门，
 * 整块 `.nb-remote-setup` 换成正常面板，Python 那个选择器**当场被拆掉**。
 * 于是 `check()` 永远等不到它变 checked（症状：`click action done` 之后超时）。
 * 选中了没有由下一条断言负责说——那才是这件事该被看见的地方。
 */
async function 选中唯一的python(page: import("@playwright/test").Page) {
  await expect(page.locator(".ip-python .ip-path", { hasText: PY })).toBeVisible({ timeout: 20_000 })
  await page.locator(".ip-python").getByRole("radio").first().click()
}

/**
 * 按下假服务器的测试开关（`fakeSshControl`，7.31）。
 *
 * **走应用自己那条 IPC**（`window.dawn.invoke`，与 `attach.spec.ts` / `permission.spec.ts` 同一写法），
 * 不另开后门：那条操作只在 `DAWN_FAKE_SSH=1` 时才被注册（`wiring.ts`），真机上它压根不存在。
 *
 * **两个开关都是进程级的**：`dropLink` 掐断这个 Electron 主进程里**所有**假链路，
 * `killKernels` 杀掉这台假机器起过的**所有**内核子进程。下面三条用例各自只有一台服务器，
 * 所以「所有」= 「那一台」；**要写多服务器的用例，别照这个 helper 抄**——
 * 它会顺手把另一台也掐了，而那时断言绿不绿跟被测的那台已经没关系了。
 *
 * 回真动了几条 / 几台。
 */
async function 假服务器开关(page: import("@playwright/test").Page, 动作: "dropLink" | "killKernels"): Promise<number> {
  return page.evaluate(async (d) => {
    const w = window as unknown as {
      dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: { count: number } }> }
    }
    const r = await w.dawn.invoke("fakeSshControl", { do: d })
    return r.data?.count ?? -1
  }, 动作)
}

/**
 * 起一台假服务器、开对话、选解释器、让 agent 在上面跑出 42。三条新用例的共同起点。
 *
 * 跑的那段是夹具里的 `x = 40 + 2\nprint(x)`——**`x` 是掐线之前定义的**，
 * 第一条用例回头就靠它分辨「同一台内核」与「新起的一台」。
 */
async function 起到42(page: import("@playwright/test").Page) {
  await 加一台并开对话(page)
  await 进坞(page, "笔记本")
  await 选中唯一的python(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("算一下")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".nb-pill-label")).toContainText("Python · 假机器", { timeout: 90_000 })
  await expect(page.locator(".nb-cell").first().locator(".kout-text")).toContainText("42", { timeout: 60_000 })
}

test.describe("远程内核 · 真内核 + 假 SSH", () => {
  test.skip(!有, `本机没有 ${KERNEL} kernelspec`)

  test("没配 → 笔记本格列出唯一候选 → 选 → agent 的 run_code 在「服务器」上算出 42，胶囊带服务器名", async ({ dawn }) => {
    const { page } = dawn
    await 加一台并开对话(page)
    await 进坞(page, "笔记本")

    // 定案 1：没配就探测（挂上自动探一次）；假服务器上只有一条真 python，列出来
    await expect(page.getByText(/假机器 上还没选解释器/)).toBeVisible()
    await 选中唯一的python(page)

    // 选完这一格就是正常的笔记本面板了——**输入框回来了**（选择器那一屏是不画输入框的）
    await expect(page.getByRole("textbox", { name: "要跑的代码" })).toBeVisible()

    await page.getByPlaceholder(/今天帮你做些什么/).fill("算一下")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    // 内核**在那台服务器上**真起了一台，算出 42
    const cells = page.locator(".nb-cell")
    await expect(cells).toHaveCount(1, { timeout: 90_000 })
    await expect(cells.first().locator(".kout-text")).toContainText("42", { timeout: 60_000 })
    // 胶囊带服务器名：「Python · 空闲」在一台不是本机的机器上是句含糊话
    await expect(page.locator(".nb-pill-label")).toContainText("Python · 假机器")
    /**
     * **转录里那句「起来了」要点名三件事**（定案 2，9eabe0f 改的措辞）：哪台机器、哪个目录、哪条解释器。
     * 远端会话里这三件事全都不是默认值，而这是唯一说得清它们的地方。
     *
     * 早先这里写的是 `/正在起 Python 内核|内核已在/`——**那条断言等于没有**：
     * 左边那支必然先出现，右边那支从来没被验过。现在只等「起来了」那一条，
     * 服务器名写死，解释器路径逐字比对；`cwd` 用 `.+` 兜着（它随会话的远端目录走）。
     */
    const 起来了 = page.getByText(/内核已在 假机器 的 .+ 起来（/)
    await expect(起来了).toBeVisible({ timeout: 60_000 })
    await expect(起来了).toContainText(PY)
  })

  test("断开服务器 → 转录说变量没了、胶囊退出；再连上再跑会起新的一台", async ({ dawn }) => {
    const { page } = dawn
    await 加一台并开对话(page)
    await 进坞(page, "笔记本")
    await 选中唯一的python(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("算一下")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.locator(".nb-pill-label")).toContainText("Python · 假机器", { timeout: 90_000 })

    const row = page.locator(".remote-row").first()
    await row.getByRole("button", { name: "断开" }).click()
    /**
     * **转录里那句话是 `内核变化出声` 写的，不是运行时自己那条**（2026-09-04 跑出来的）。
     *
     * `KernelRuntime.收远端` 确实 `emit` 了一条「与 假机器 断开了，Python 内核里的变量已经不在了…」，
     * 但普通对话挂的内核走的是 `挂载.ts`，而 `wiring.ts` 的 `转发` **只放 `kernel_output` 过去**——
     * `notice` 到不了转录。到得了转录的是 `exited{reason:"disconnected"}` 转成的这一句。
     * 照运行时那条字面去等，等的是一句在这条路上永远不会出现的话。
     *
     * 「变量没了」这件事**没有因此丢**：它由笔记本格顶上那条提示说，下面一条断言就是它。
     * 两条一起才是这条用例要的那件事——转录说清了为什么，笔记本说清了后果。
     */
    await expect(page.getByText(/Python 内核退出了：与服务器断开/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/上面 cell 里的变量已经不在了/)).toBeVisible({ timeout: 15_000 })
    // 状态词("exited") = 「已退出」
    await expect(page.locator(".nb-pill-label")).toContainText("退出")

    await row.getByRole("button", { name: "连接", exact: true }).click()
    await expect(row).toHaveAttribute("data-state", "ready", { timeout: 15_000 })

    await page.getByPlaceholder(/今天帮你做些什么/).fill("再算")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    // 起了**新的一台**：还是那台服务器上的 Python，而且不再是退出态
    await expect(page.locator(".nb-pill-label")).toContainText("Python · 假机器 · ", { timeout: 90_000 })
    await expect(page.locator(".nb-pill-label")).not.toContainText("退出")
    await expect(page.locator(".nb-cell").nth(1).locator(".kout-text")).toContainText("42", { timeout: 60_000 })
  })

  /**
   * **意外掉线 ≠ 按「断开」**（定案 6/10）。上一条按的是「断开」——人自己说了不要了，内核跟着收摊。
   * 这一条是网线被拔：远端那台 ipykernel 什么事都没有，只是通往它的隧道没了。
   *
   * 这条用例是这一轮的命根子：末尾那个 43 **只可能**来自掐线之前那台进程里的 `x`。
   * 换成新起的一台，`print(x + 1)` 会是 `NameError`——所以它分得开「接回了」与「假装接回了」。
   */
  test("意外掉线 → 等接回；再连上 → 内核还活着，掐线前的变量还在", async ({ dawn }) => {
    const { page } = dawn
    await 起到42(page)

    expect(await 假服务器开关(page, "dropLink"), "没有一条假链路被掐断，后面验的就不是掉线").toBeGreaterThan(0)
    const row = page.locator(".remote-row").first()
    await expect(row).toHaveAttribute("data-state", "disconnected", { timeout: 15_000 })
    // 转录那句由 `内核变化出声` 的 `detached` 分支说：别说「变量没了」——它多半还在
    await expect(page.getByText(/Python 内核可能还在服务器上活着/)).toBeVisible({ timeout: 15_000 })
    /**
     * 胶囊**先验类名再验字**：`.nb-pill-detached` 是这一态独有的（灰，不是红），
     * 而「等接回」是它独有的那个词。只验字的话，哪天 `状态词` 与类名对不上也不会有人知道。
     */
    await expect(page.locator(".nb-pill.nb-pill-detached")).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator(".nb-pill-label")).toContainText("等接回")

    await row.getByRole("button", { name: "连接", exact: true }).click()
    await expect(row).toHaveAttribute("data-state", "ready", { timeout: 15_000 })
    await expect(page.getByText(/Python 内核还活着，变量都在/)).toBeVisible({ timeout: 60_000 })
    await expect(page.locator(".nb-pill-label")).toContainText("空闲", { timeout: 15_000 })
    await expect(page.locator(".nb-pill.nb-pill-detached")).toHaveCount(0)

    // 在同一台内核里自己敲：`x` 是掐线**前** agent 定义的，43 只能来自那个还活着的进程
    const 代码框 = page.getByRole("textbox", { name: "要跑的代码" })
    await 代码框.fill("print(x + 1)")
    await 代码框.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter")
    const 第二格 = page.locator(".nb-cell").nth(1)
    await expect(第二格.locator(".nb-code")).toContainText("print(x + 1)", { timeout: 60_000 })
    await expect(第二格.locator(".kout-text")).toContainText("43", { timeout: 60_000 })
  })

  /**
   * 集群把内核 OOM 掉了（定案 1/4）。链路一切正常，**没有任何人告诉 DAWN**——
   * 心跳是唯一能察觉的东西，所以这里量的是「多久出声」，不只是「出没出声」：
   * 5 分钟静默兜底那条路也会说话，但那时人已经对着一个死掉的内核干等了五分钟。
   */
  test("内核在 DAWN 背后被杀 → 30 秒内出声；再跑起新的一台", async ({ dawn }) => {
    const { page } = dawn
    await 起到42(page)

    const t0 = Date.now()
    expect(await 假服务器开关(page, "killKernels"), "一台内核都没杀掉，后面验的就不是猝死").toBeGreaterThan(0)
    await expect(page.getByText(/Python 内核在 假机器 上没了/)).toBeVisible({ timeout: 30_000 })
    // **时限本身就是要验的东西**：上面那个 timeout 已经卡住了 30 秒，这一行是把它写成断言让失败时说得清
    expect(Date.now() - t0, "察觉猝死用了 30 秒以上——多半是走了 5 分钟静默兜底那条路").toBeLessThan(30_000)
    // 状态词("exited") = 「已退出」
    await expect(page.locator(".nb-pill-label")).toContainText("退出")

    // 再跑一句：起新的一台（`perTurn` 让第二轮也调 run_code）
    await page.getByPlaceholder(/今天帮你做些什么/).fill("再算")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.locator(".nb-cell").nth(1).locator(".kout-text")).toContainText("42", { timeout: 90_000 })
    await expect(page.locator(".nb-pill-label")).not.toContainText("退出")
  })

  /**
   * 掉线期间那台没撑住（定案 10 的另一支）。接回是**试着**接回，不是保证——
   * 分不开「还活着」与「已经没了」的话，人会以为变量还在，然后照着一个空进程往下写。
   */
  test("掐线后内核死了 → 再连上说没撑过；再跑起新的一台", async ({ dawn }) => {
    const { page } = dawn
    await 起到42(page)

    expect(await 假服务器开关(page, "dropLink")).toBeGreaterThan(0)
    const row = page.locator(".remote-row").first()
    await expect(row).toHaveAttribute("data-state", "disconnected", { timeout: 15_000 })
    await expect(page.locator(".nb-pill.nb-pill-detached")).toHaveCount(1, { timeout: 15_000 })
    // 断着的这段时间里它死了。**链路已经断了，所以这一下 DAWN 更加无从知道**
    expect(await 假服务器开关(page, "killKernels"), "一台内核都没杀掉，接回时它还活着，验的就不是这件事").toBeGreaterThan(0)

    await row.getByRole("button", { name: "连接", exact: true }).click()
    await expect(row).toHaveAttribute("data-state", "ready", { timeout: 15_000 })
    await expect(page.getByText(/Python 内核没撑过这次断线/)).toBeVisible({ timeout: 60_000 })

    await page.getByPlaceholder(/今天帮你做些什么/).fill("再算")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.locator(".nb-cell").nth(1).locator(".kout-text")).toContainText("42", { timeout: 90_000 })
    await expect(page.locator(".nb-pill-label")).not.toContainText("退出")
  })

  test("设置里那台服务器的对话框有两格，探测后能选；关掉再打开，选中的还是它", async ({ dawn }) => {
    const { page } = dawn
    await 加一台并开对话(page)
    const 编辑 = page.locator(".remote-row").first().getByRole("button", { name: "编辑" })
    const 探一次 = async () => {
      // 对话框里**不自动探**（那是编辑连接信息的地方），得按一颗
      await page.getByRole("button", { name: /检测 假机器 上的解释器/ }).first().click()
      await expect(page.locator(".ip-python .ip-path", { hasText: PY })).toBeVisible({ timeout: 20_000 })
    }

    await 编辑.click()
    await 探一次()
    await page.locator(".ip-python").getByRole("radio").first().check({ timeout: 20_000 })

    /**
     * **关掉再打开才算「回显」**（终审 2026-09-04）。
     *
     * 点完那一瞬亮起来的圆点是 picker **自己的**本地状态（`选了`，见 `interpreter-picker.tsx`
     * 那段注释：不本地亮的话点完会闪回未选）。所以紧接着断言 `.ip-item.active`
     * **`setRemoteInterpreter` 整个失败了它也照样绿**——它验的是那一次点击，不是那一次存储。
     *
     * 关掉、重开，这一格的 `current` 只能来自 `listConnections` 重新装配出来的记录；
     * 这时 `.ip-item.active` 写着 PY，才说明那条路径真的落进了库里、又真的回来了。
     * 重开之后候选是空的（**不自动探**），所以要再探一次才有那一行可看。
     */
    await page.locator(".conn-dialog").getByRole("button", { name: "取消", exact: true }).click()
    await expect(page.locator(".conn-dialog")).toHaveCount(0)

    await 编辑.click()
    await 探一次()
    await expect(page.locator(".ip-python .ip-item.active .ip-path")).toHaveText(PY)
  })
})

/**
 * 图（定案 6）。**这条是这个分支最主要的那件事**：代码在服务器上跑，图回到这台电脑的屏幕上。
 *
 * 单开一个 describe 而不是塞进上面那条：假模型每轮调的是**同一个** `toolCall`，
 * 要让第二轮换一段代码就得让 mock 认轮次——那是给这一条用例在假后端里加一台状态机。
 * 各自一段对话、各调一次，两边都读得懂。
 */
test.describe("远程内核 · 图从服务器回来", () => {
  test.use({
    dawnOptions: {
      fakeSsh: true,
      fakeSshPython: PY,
      realKernels: true,
      toolCall: {
        toolName: "run_code",
        args: { language: "python", code: 画图代码 },
        say: "我在服务器上画一张。",
      },
    },
  })

  test.skip(!有, `本机没有 ${KERNEL} kernelspec`)

  test("agent 在服务器上画的图，落在笔记本里；给模型的那句话说清是一张 image/png", async ({ dawn }) => {
    const { page } = dawn
    await 加一台并开对话(page)
    await 进坞(page, "笔记本")
    await 选中唯一的python(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("画一张图")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    /**
     * **图本身要在屏幕上**：`display_data` 里的 `image/png` 经隧道回来，
     * `KernelOutputRow` 把它画成 `img.kout-img`（`views.tsx`）。
     * 只验工具结果那句话的话，「说生成了一张图」与「真的有一张图」就分不开了。
     */
    const 图 = page.locator(".nb-cell img.kout-img")
    await expect(图.first()).toBeVisible({ timeout: 90_000 })
    await expect(图.first()).toHaveAttribute("src", /^data:image\/png;base64,/)

    /**
     * **给模型的是文字**（`run-code.ts` 的文件头：多数模型在工具结果里看不到图）。
     * 那句话必须说清生成了什么——不说清的话模型会以为自己没画出来，然后反复重画。
     */
    const 工具 = page.locator(".tool").first()
    await 工具.locator(".tool-head").click()
    await expect(工具.locator(".tool-result")).toContainText("image/png")
  })
})
