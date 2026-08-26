/**
 * 变更 pane（①-B″ · U4 补验）。**跑真实构建产物。**
 *
 * ## 这条 e2e 是一笔明写在案的欠账
 *
 * U4 落地时历史条目里自己标注过：
 *
 * > *面板的**渲染逻辑**有 12 条单元测试覆盖，**但「真跑一次工具调用、
 * > 文件名出现在面板上」还没有在真实构建产物上验过**——假后端目前不触发工具调用。*
 *
 * 现在补上。走的是完整链路：假模型吐一个 `write` 调用 → pi 真的执行它 →
 * 工具包装器拍 git 快照 → 账本记进那条 Run → IPC → 面板。
 * **中间没有一处是假的，只有模型是确定的。**
 *
 * ## 为什么是两条，不是一条
 *
 * 溯源探针有两种结局，**它们在界面上必须说不同的话**：
 *   - 拿得到事实 → 列出文件名
 *   - 拿不到（非 git 仓库、快照失败）→ 「无法确定改了什么」
 *
 * 把后者显示成「没有改动文件」就是把「不知道」说成「没改」，
 * 那是不变式 5 明令禁止的编造。这条区别此前只有单元测试守着，
 * **单元测试证明不了它在真实产物上也成立**。
 */
import { test, expect, readRuns, 在项目里开会话, 进审阅 } from "./fixtures.js"

/** 中文文件名是刻意的：R3 撞出过 git 把非 ASCII 路径写成八进制转义的缺陷 */
const 产出文件 = "分析结果.md"

test.describe("拿得到 git 事实时", () => {
  test.use({
    dawnOptions: {
      gitInit: true,
      toolCall: { toolName: "write", args: { path: 产出文件, content: "# 假模型写的\n" } },
    },
  })

  test("工具改的文件，名字真的出现在变更 pane 上", async ({ dawn }) => {
    const { page, dbPath } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await 在项目里开会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("写一个文件")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    // 工具跑完之后模型才回这句 —— 它到了就说明整轮收工了
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible()

    await 进审阅(page)
    const panel = page.locator(".panel", { hasText: "变更" })
    // **是哪次工具调用改的** —— 计划里 U4 的原话，只给匿名序号等于没标
    await expect(panel).toContainText("write")
    await expect(panel).toContainText(产出文件)

    // 界面说发生了，账本上也得有。`tool_call:<工具名>`，不是裸 `tool_call`
    const runs = await readRuns(dbPath)
    expect(runs.map((r) => r.request_type)).toContain("tool_call:write")
  })
})

test.describe("非 git 工作区", () => {
  /**
   * **不 git init**。2026-08-26 之前这里验的是「探针拿不到 git 事实 → 说无法确定」；
   * 现在非 git 工作区走**文件系统探针**（作者首用时临时会话全是「不知道」，改的），
   * 事实照样拿得到——所以这条改验「非 git 也如实记下写了什么」。
   * 「不知道 ≠ 没改」那条纪律没丢：真拿不到（超过 2 万个文件）时探针返回 undefined，
   * 由 `tests/project/fs-facts.test.ts` 与 `tests/provenance-probe.test.ts` 守着。
   */
  test.use({
    dawnOptions: {
      toolCall: { toolName: "write", args: { path: 产出文件, content: "# 假模型写的\n" } },
    },
  })

  test("**没有 git 也说得出改了哪个文件** —— 文件系统探针补上那一半", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await 在项目里开会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("写一个文件")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible()

    await 进审阅(page)
    const panel = page.locator(".panel", { hasText: "变更" })
    await expect(panel).toContainText("write")
    await expect(panel).toContainText(产出文件)
    // 既不是「无法确定」，也不是「没有改动文件」——是真名字
    await expect(panel).not.toContainText("无法确定改了什么")
    await expect(panel).not.toContainText("没有改动文件")
  })
})

/**
 * **审阅：跟 `git HEAD` 比，而且两个来源分得开**（2026-08-18）。
 *
 * 这一屏最容易犯的错是**在最该说话的时候说「什么都没变」**：
 * `out/`、`data/raw/` 这类目录写进 `.gitignore` 是科研仓库的常态，
 * 于是一次分析生成 40 张图，`git diff HEAD` 一个字都不会说。
 * **git 答不出的那一半，账本答得出**——所以这条同时验两半。
 */
test.describe("审阅 · 跟 git HEAD 比", () => {
  /**
   * **让假模型真的写一个被 git 忽略的文件**。
   *
   * 第一版我用 `writeFileSync` 手造了 `out/fig1.png`，然后指望它出现在
   * 「产物」里——**错了**：产物那一半来自**账本**（`files_written`），
   * 不是来自文件系统。一个 git 忽略、账本又没记过的文件，两边都看不见，
   * **而那是诚实的**：我们确实不知道它是谁产出的。
   */
  test.use({
    dawnOptions: {
      gitInit: true,
      toolCall: { toolName: "write", args: { path: "out/工具写的.md", content: "# 假装是一张图\n" } },
    },
  })

  test("**仓库里的改动**与**账本记的产物**各占一栏，点开有逐行差异", async ({ dawn }) => {
    const { page, workspace } = dawn
    const { writeFileSync, mkdirSync, appendFileSync } = await import("node:fs")

    // ① 仓库里：改一个已经提交过的文件
    appendFileSync(`${workspace}/README.md`, "\n作者后来加的一行\n")
    /**
     * ② `.gitignore` 挡住 `figures/` —— 待会儿模型往里写的东西，git 一个字都不会说。
     *
     * **用作者真实约定里的目录**（`policy/science-layout.ts` 那一份）：
     * 第一版我随手写了 `out/`，而它根本不在约定里，
     * 于是「约定目录兜底」那条**正确地没看见它**，我却以为是功能坏了。
     */
    /**
     * **两个来源要分得开**（2026-08-18 变异测试逼出来的）。
     *
     * 第一版两条路都指向同一个文件，于是**关掉任一条判据都还绿**——
     * 弱得等于没验。现在各给一个只有它看得见的：
     *   - `out/工具写的.md`：忽略、**不在科研约定里** → 只有工具包装器（甲）看得见
     *   - `figures/手放的.md`：忽略、在约定里、**不是我们的工具写的** → 只有约定兜底（丙）看得见
     */
    writeFileSync(`${workspace}/.gitignore`, "figures/\nout/\n")
    mkdirSync(`${workspace}/figures`, { recursive: true })
    writeFileSync(`${workspace}/figures/手放的.md`, "外部 agent 用自己的 bash 写的\n")

    await 在项目里开会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("写一张图")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible()

    await 进审阅(page)

    const 坞 = page.locator(".right-dock")
    // 仓库那一半看得见 README.md
    await expect(坞.getByRole("button", { name: /README\.md/ })).toBeVisible({ timeout: 30_000 })
    // **归属告知必须在**：跟 HEAD 比是累计口径，里面混着作者自己改的
    await expect(坞.getByText(/可能包含你自己的修改/)).toBeVisible()

    // ③ 点开看逐行差异
    await 坞.getByRole("button", { name: /README\.md/ }).click()
    await expect(坞.locator(".diff")).toContainText("作者后来加的一行", { timeout: 30_000 })
    // 加的行**上了色**（一行以上很正常，收窄到第一条）
    await expect(坞.locator(".diff-add").first()).toBeVisible()
    /**
     * **行号那一列真的画出来了，而且是文件里的行号**（排版学 Codex，2026-08-18）。
     *
     * `README.md` 提交时只有一行（`# e2e 工作区`），`appendFileSync` 追加的是
     * `\n作者后来加的一行\n`——于是那句话落在**第 3 行**，第 2 行是那个空行。
     *
     * **认准那一行去问，不要问「第一条加行」**：第一条加行是空行（第 2 行），
     * 这个用例第一版就是这么写错的，而它当场报了 2。写死行号是有意的——
     * 「有个数字在那儿」证明不了任何事，**错的行号比没有行号更坏**：
     * 它会把人带到文件里另一个地方，而且看起来一切正常。
     */
    await expect(
      坞.locator(".diff-add").filter({ hasText: "作者后来加的一行" }).locator(".diff-num"),
    ).toHaveText("3")
    // 文件头把「我在看哪个文件」摆出来（钉在顶上的那条）
    await expect(坞.locator(".review-diff-head .review-path")).toHaveText("README.md")

    /**
     * ④ **产物那一半**：`out/` 被 `.gitignore` 挡着，`git diff HEAD` 一个字都不说。
     * 这一栏在，说明「git 答不出的那半，账本答得出」那条真的接上了。
     */
    await expect(坞.getByRole("heading", { name: "这次跑出来的产物" })).toBeVisible()
    await expect(坞.getByText(/git 忽略了这些/)).toBeVisible()
    /**
     * **这一条就是这一屏的立身之本**：两个都被 `.gitignore` 挡着，
     * 上面那半（`git diff HEAD`）一个字都不会说它——而账本记得。
     */
    /**
     * **收窄到产物那一栏**：这个路径在坞里出现两次（产物栏 + 下面那张变更卡），
     * `getByText` 是子串匹配、且严格模式，宽着写会一次命中两个。
     */
    const 产物们 = 坞.locator(".review-status.produced").locator("xpath=following-sibling::span")
    await expect(产物们).toHaveText(["figures/手放的.md", "out/工具写的.md"], { timeout: 30_000 })
  })
})

/**
 * **表格文件：先说结论，再看逐行差异**（2026-08-18，作者选的甲）。
 *
 * 这一条验的是这个功能存在的全部理由：*「某列单位 g → mg」* 在逐行 diff 里
 * 是「每一行都变了」，信息量接近零；而真相是一句话——**这一列乘了 1000**。
 *
 * 单元测试已经把 `比两张表()` 与「旧的那张从 `HEAD` 来」各验过一遍。
 * **这里验的是它真的走到了屏幕上**——那两件事在这个项目里被证明过不是一回事
 * （419 个测试全绿的那一版，打开之后点什么都没反应）。
 */
test.describe("审阅 · 表格文件在 diff 上方多一句结论", () => {
  test.use({ dawnOptions: { gitInit: true } })

  test("一列换了单位，摘要说「乘了 1000」，而不是「每一行都变了」", async ({ dawn }) => {
    const { page, workspace } = dawn
    const { writeFileSync } = await import("node:fs")
    const { execFileSync } = await import("node:child_process")
    const git = (...args: string[]) => execFileSync("git", args, { cwd: workspace, stdio: "pipe" })

    // ① 先把「旧的那一张」提交进 HEAD —— 摘要的旧版来自 `git show HEAD:`
    writeFileSync(`${workspace}/测量.csv`, "样品,质量\na,1\nb,2\nc,3\n")
    git("add", "-A")
    git("commit", "-qm", "原始测量")

    // ② 换单位：g → mg。**逐行 diff 会说「三行全变了」**
    writeFileSync(`${workspace}/测量.csv`, "样品,质量\na,1000\nb,2000\nc,3000\n")

    await 在项目里开会话(page)
    await 进审阅(page)

    const 坞 = page.locator(".right-dock")
    await 坞.getByRole("button", { name: /测量\.csv/ }).click()

    // ③ 结论在上面
    const 摘要 = 坞.locator(".table-diff")
    await expect(摘要).toContainText("整列乘了 1000", { timeout: 30_000 })
    /**
     * **被那句话解释掉的格不再逐格重复**——那正是噪声的来源。
     * 三行全部由「乘了 1000」解释得了，所以不该再冒出「另有 3 处单元格变化」。
     */
    await expect(摘要).not.toContainText("单元格变化")

    // ④ **逐行差异仍在下面**：摘要是我们的判定，diff 是 git 的原始事实
    await expect(坞.locator(".diff")).toContainText("1000")
  })
})
