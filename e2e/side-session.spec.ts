/**
 * 侧边对话（2026-09-24，spec `2026-09-24-侧边对话-design.md`）。**跑真实构建产物。**
 * 要证的是：两段真的同时跑、互不串台；坞里那段问进度时真调到 read_main_session、读到的是主对话此刻的。
 *
 * ## 为什么大多走项目会话
 *
 * 项目会话有分栏（「换到主区 / 拿下」之后能在页签里找到那段）。临时会话 2026-09-25 起也有地方
 * （侧栏「会话」那一组，`t:`）——作者的对话几乎全是临时会话，那条单独一个用例盯着（最后那个 describe）。
 *
 * ## 两处长得一样
 *
 * 主区与坞里是**同一个 `ConversationView`**：占位符、停止键、工具行都一模一样。
 * 所以每一处都先圈定范围——主区 `main.main`、坞里 `aside.right-dock`——不圈就是子串匹配撞两个。
 */
import type { Page } from "@playwright/test"
import { join, resolve } from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { test, expect, CANNED_REPLY, 在项目里开会话, 开一段临时会话, 进坞 } from "./fixtures.js"

const 主区 = (page: Page) => page.locator("main.main")
const 主区页签 = (page: Page) => page.locator(".topbar .session-tabs")
const 坞 = (page: Page) => page.locator("aside.right-dock")
const 框 = (区: ReturnType<typeof 主区>) => 区.getByPlaceholder(/输入问题/)

async function 说(区: ReturnType<typeof 主区>, 话: string) {
  await 框(区).fill(话)
  await 框(区).press("Enter")
}

/** 主区开一段项目会话、说「跑个长的」，等假模型开口——此后 `sleep` 拖住这一轮 */
async function 主区忙起来(page: Page) {
  await 在项目里开会话(page)
  await 说(主区(page), "跑个长的")
  await expect(主区(page).locator(".turns")).toContainText("我去跑一下。", { timeout: 30_000 })
}

/** 坞「对话」格 → 另开一段；等**只有挂着态才有**的 `.side-chat-head` */
async function 坞里另开一段(page: Page) {
  await 进坞(page, "对话")
  await 坞(page).getByRole("button", { name: "另开一段", exact: true }).click()
  await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
  await 框(坞(page)).waitFor({ timeout: 30_000 })
}

test.describe("侧边对话 · native", () => {
  test.use({
    dawnOptions: {
      toolCall: [
        /**
         * 主区那段：拖住这一轮。**这是给坞里的时间预算，用例从不等它跑完**——收尾时整个应用被关掉。
         * 所以放得远远的（120 秒）：满负荷的全量 e2e 里坞那段起得慢，也不会因为主区先跑完
         * 而红在「正在跑：bash」上、看起来像产品 bug。
         */
        { toolName: "bash", args: { command: "sleep 120" }, when: "跑个长的", say: "我去跑一下。" },
        { toolName: "read_main_session", args: {}, when: "主对话跑到哪了" },
      ],
    },
  })

  test("**两段同时跑不串台**；坞里问进度真调到 read_main_session、读到的是主对话此刻的", async ({ dawn }) => {
    const { page } = dawn
    await 主区忙起来(page)
    await 坞里另开一段(page)

    await test.step("坞里说一句：坞里有回复，主区没有这句；主区那段仍在跑", async () => {
      await 说(坞(page), "你好")
      await expect(坞(page).locator(".turns")).toContainText(CANNED_REPLY, { timeout: 30_000 })
      await expect(主区(page).locator(".turns")).not.toContainText("你好")
      /** 回复那一侧也不许串：主区自己的罐头回复要等 sleep 跑完才来，此刻出现只可能是坞里漏过来的 */
      await expect(主区(page).locator(".turns")).not.toContainText(CANNED_REPLY)
      await expect(坞(page).locator(".turns")).not.toContainText("跑个长的")
      await expect(主区(page).getByRole("button", { name: "停止", exact: true })).toBeVisible()
      /** native 那段看得见主对话：「看不见」的提示这里不许出现（ACP 那条只证了它会出现） */
      await expect(坞(page).locator(".side-chat-caveat")).toHaveCount(0)
    })

    await test.step("坞里问进度：调到 read_main_session，结果里是主对话此刻的", async () => {
      await 说(坞(page), "主对话跑到哪了")
      const 工具 = 坞(page).locator(".tool").filter({ hasText: "read_main_session" })
      await expect(工具).toHaveCount(1, { timeout: 30_000 })
      await expect(工具).toHaveAttribute("data-status", "ok", { timeout: 30_000 })
      await 工具.locator(".tool-head").click()
      const 结果 = 工具.locator(".tool-result")
      await expect(结果).toContainText("跑个长的")
      await expect(结果).toContainText("正在跑：bash")
      /** 主区那一轮在这期间一直没停——读到「正在跑」本身就证明两段是同时的 */
      await expect(主区(page).getByRole("button", { name: "停止", exact: true })).toBeVisible()
      await expect(主区(page).locator(".tool")).toHaveCount(1)
      await expect(主区(page).locator(".tool").filter({ hasText: "read_main_session" })).toHaveCount(0)
    })
  })

  /**
   * **坞里那段长得像主区那段**（2026-09-25，作者：「做一个类似于主对话框的效果」）。
   * 作者点名三处：A 输入框看不出边、B 没有主区那样的头（大标题、用量、导出对话）和轮次刻度尺、C 整段不像一块区域。
   */
  test("**坞里那段长得像主区**：输入卡看得出边、一行头（标题 + 用量 + 导出对话 + 换到主区 + ×）、刻度尺放得下才画", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await 坞里另开一段(page)
    for (const 话 of ["你好", "再说一句", "第三句"]) {
      await 说(坞(page), 话)
      await expect(坞(page).locator(".turn.agent")).toHaveCount(["你好", "再说一句", "第三句"].indexOf(话) + 1, { timeout: 30_000 })
    }
    const 格 = 坞(page).locator(".side-chat")

    await test.step("A/C：卡面与底不同色（此前坞底 panel 与卡面 input 同值，白卡贴白底）", async () => {
      /** 一块东西「看上去」的底：往上找第一层不透明的（中间几层多半是透明的，只比自己会假绿） */
      const 看上去的底 = (el: Element) => {
        let n: Element | null = el
        while (n && getComputedStyle(n).backgroundColor === "rgba(0, 0, 0, 0)") n = n.parentElement
        return n ? getComputedStyle(n).backgroundColor : ""
      }
      const 卡 = await 格.locator(".composer-box").evaluate(看上去的底)
      const 底 = await 格.locator(".composer").evaluate(看上去的底)
      /**
       * **「看得出边」= 底色不同，或者卡上有一道看得见的描边**（2026-10-01 放宽，C16）。
       * 对话区换成纯白（学 dsh）之后卡与底同为白，边改由 `.composer-card` 的发丝线给——dsh 也是这么做的。
       * 两样都没有才算退回「白卡贴白底」。
       */
      // 量**不聚焦**时的卡：聚焦时描边让位给强调色聚焦环（`.composer-card:focus-within`），那时边当然看得见
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      const 边 = await 格.locator(".composer-card").evaluate((el) => {
        const s = getComputedStyle(el)
        return { 宽: parseFloat(s.borderTopWidth), 色: s.borderTopColor }
      })
      const 有边 = 边.宽 > 0 && 边.色 !== "rgba(0, 0, 0, 0)" && 边.色 !== "transparent"
      expect(卡 !== 底 || 有边, `卡 ${卡} / 底 ${底} / 描边 ${边.宽}px ${边.色}`).toBe(true)
      const 主区底 = await 主区(page).locator(".composer").evaluate(看上去的底)
      expect(底, "坞里那段的底就是主区那块底").toBe(主区底)
    })

    await test.step("B：只有一行头，就是 `.conv-head`；五样都在、都常驻", async () => {
      await expect(格.locator("header")).toHaveCount(1)
      const 头 = 格.locator("header.conv-head")
      await expect(头.locator(".side-chat-title")).toHaveText("你好")
      await expect(头.locator(".session-usage")).toHaveCount(0)
      await expect(格.locator(".composer .session-usage")).toContainText("3 轮")
      for (const 名 of ["导出对话", "换到主区", "从坞里拿下"]) {
        const b = 头.getByRole("button", { name: 名, exact: true })
        await expect(b).toBeVisible()
        expect(await b.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
      }
      // 大字：与主区 `.conv-title` 同一档
      const [坞字, 主字] = await Promise.all([
        头.locator(".side-chat-title").evaluate((el) => getComputedStyle(el).fontSize),
        page.locator(".topbar .conv-title").evaluate((el) => getComputedStyle(el).fontSize),
      ])
      expect(坞字).toBe(主字)
      // 导出的是坞里这段：mock 回的轮数就是它的 3 轮
      await 头.getByRole("button", { name: "导出对话", exact: true }).click()
      await expect(头).toContainText("已导出 3 轮")
    })

    await test.step("B：刻度尺——坞默认宽放得下就画；压到 344px 以下收起，正文把留白要回去", async () => {
      await expect(格.locator(".turn-nav")).toBeVisible()
      await 坞(page).evaluate((el) => {
        ;(el as HTMLElement).style.width = "300px"
      })
      await expect(格.locator(".turn-nav")).toBeHidden()
      const 左 = await 格.locator(".turns").evaluate((el) => getComputedStyle(el).paddingLeft)
      expect(左).toBe("12px")
    })
  })

  test("**换到主区 / 从坞里拿下**，三颗按钮都看得见（opacity 1）", async ({ dawn }) => {
    const { page } = dawn
    await 主区忙起来(page)
    await 进坞(page, "对话")

    const 另开 = 坞(page).getByRole("button", { name: "另开一段", exact: true })
    await expect(另开).toBeVisible()
    expect(await 另开.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")

    await 坞里另开一段(page)
    await 说(坞(page), "你好")
    await expect(坞(page).locator(".turns")).toContainText(CANNED_REPLY, { timeout: 30_000 })

    const 换 = 坞(page).getByRole("button", { name: "换到主区", exact: true })
    const 拿下 = 坞(page).getByRole("button", { name: "从坞里拿下", exact: true })
    for (const b of [换, 拿下]) {
      await expect(b).toBeVisible()
      expect(await b.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
    }

    await test.step("换到主区：主区是坞里那段，坞里是原主那段", async () => {
      await 换.click()
      await expect(page.locator(".topbar .conv-title")).toContainText("你好")
      await expect(坞(page).locator(".side-chat-title")).toContainText("跑个长的")
      await expect(坞(page).locator(".turns")).toContainText("我去跑一下。")
      /** 先等主区真换成坞里那段的内容，再断言原主那段不在——否则否定句可能赶在重渲染之前成立 */
      await expect(主区(page).locator(".turns")).toContainText(CANNED_REPLY)
      await expect(主区(page).locator(".turns")).not.toContainText("跑个长的")
    })

    await test.step("从坞里拿下：坞格回空态，那段仍在会话页签里", async () => {
      await 坞(page).getByRole("button", { name: "从坞里拿下", exact: true }).click()
      /** 等标题而不是 `.side-chat-empty`：后者「正在打开」的加载态也有 */
      await expect(坞(page).getByRole("heading", { name: "坞里的对话", exact: true })).toBeVisible()
      await expect(坞(page).locator(".side-chat-head")).toHaveCount(0)
      const 原主页签 = 主区页签(page).locator(".session-tab-title").filter({ hasText: "跑个长的" })
      await expect(原主页签).toHaveCount(1)
      await 原主页签.click()
      await expect(主区(page).locator(".turns")).toContainText("我去跑一下。")
      await expect(主区(page).getByRole("button", { name: "停止", exact: true })).toBeVisible()
    })
  })
})

/**
 * **临时会话也有地方**（2026-09-25，作者真机上撞的：他的对话几乎全是临时会话，上一版坞里只剩一行灰字）。
 * 主区是一段临时会话时，坞里「另开一段」建的是**又一段临时会话**，主区不动，新那段落进侧栏「会话」那一组。
 */
test.describe("侧边对话 · 临时会话", () => {
  test("主区是临时会话：坞里「另开一段」看得见、建出一段临时会话，主区不动", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page, "起个头")
    /** 前提：主区真是一段临时会话——散的会话没有分栏，「会话」那一组里只有它 */
    await expect(page.locator(".topbar .conv-title")).toContainText("起个头")
    await expect(主区页签(page)).toHaveCount(0)
    await expect(page.locator(".session-list > li")).toHaveCount(1)

    await 进坞(page, "对话")
    const 另开 = 坞(page).getByRole("button", { name: "另开一段", exact: true })
    await expect(另开).toBeVisible()
    expect(await 另开.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
    await expect(坞(page).getByText("这段对话不属于任何项目，坞里没法另开", { exact: true })).toHaveCount(0)

    await 另开.click()
    await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
    await 框(坞(page)).waitFor({ timeout: 30_000 })

    await 说(坞(page), "坞里开的头")
    await expect(坞(page).locator(".turns")).toContainText(CANNED_REPLY, { timeout: 30_000 })
    /** 主区还是原来那段：标题没换、坞里那句没串过去 */
    await expect(page.locator(".topbar .conv-title")).toContainText("起个头")
    await expect(主区(page).locator(".turns")).not.toContainText("坞里开的头")
    /** 新那段是一段临时会话：落进侧栏「会话」那一组，不是哪个项目底下 */
    await expect(page.locator(".session-list > li")).toHaveCount(2, { timeout: 30_000 })
    await expect(page.locator(".session-list .sess .name").filter({ hasText: "坞里开的头" })).toBeVisible({ timeout: 30_000 })
  })
})

const 假ACP = resolve(import.meta.dirname, "..", "scripts", "fake-acp-agent.mjs")

test.describe("侧边对话 · ACP", () => {
  test.use({
    dawnOptions: {
      providersYaml: `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-flash
    capabilities: [chat, exec]
  claude-acp:
    kind: acp
    command: node
    args: ["${假ACP}"]
    capabilities: [chat, exec]
`,
    },
  })

  test("**ACP 那段挂进坞，直说它看不见主对话**", async ({ dawn }) => {
    const { page } = dawn
    /** 先在项目里建一段 ACP 会话，再由夹具建一段 ds-chat 并切过去（最新的排最前） */
    await page.locator(".app-shell").waitFor({ timeout: 60_000 })
    await page.evaluate(async () => {
      const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> } }
      const r = (await w.dawn.invoke("listProjects", {})) as { data?: { workspace: string }[] }
      await w.dawn.invoke("createTask", { agentId: "claude-acp", workspace: r.data?.[0]?.workspace })
    })
    await 在项目里开会话(page)
    /** 前提：主区是 native 那段——它有模型 pill，ACP 会话没有（acp-agent.spec.ts 盯着那条） */
    await expect(主区(page).locator(".composer-card .model-pill")).toHaveCount(1)

    await 进坞(page, "对话")
    const 挑 = 坞(page).locator(".side-chat-pick")
    await expect(挑).toHaveCount(1)
    await 挑.click()
    await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
    await expect(坞(page).getByText("这个 agent 看不见主对话", { exact: true })).toBeVisible()
  })
})

/**
 * **坞里那段对话的团队 chip 打开的是它自己的团队**（2026-09-29）。此前 `$团队` 只载主区那段：
 * 主区没组队时点坞里的 chip，团队格说「这段会话没有团队」。从标签栏进团队格仍看主区那段（行为照旧）。
 */
test.describe("侧边对话 · 团队 chip", () => {
  test.use({
    dawnOptions: {
      gitInit: true,
      toolCall: [
        {
          toolName: "team_create",
          when: "审一遍这个仓库",
          args: {
            name: "审稿小队",
            goal: "把这个仓库审一遍",
            members: [{ name: "踏勘", agent: "scout", role: "先看一眼" }],
            tasks: [{ id: "t1", subject: "看看仓库里有什么", assignee: "踏勘" }],
          },
        },
      ],
    },
  })

  test("**点坞里的团队 chip → 团队格是坞里那段的队，并写明来源；从标签栏进回到主区那段**", async ({ dawn }) => {
    const { page, workspace } = dawn
    mkdirSync(join(workspace, ".dawn", "agents"), { recursive: true })
    writeFileSync(
      join(workspace, ".dawn", "agents", "scout.md"),
      "---\nname: scout\ndescription: scout\n---\n你是 scout。用一句话回答。\n",
    )
    await 在项目里开会话(page)
    await 坞里另开一段(page)
    await 说(坞(page), "/team 审一遍这个仓库")
    await expect(坞(page).locator(".tool").filter({ hasText: "team_create" }).first()).toHaveAttribute("data-status", "ok", {
      timeout: 60_000,
    })

    await 主区(page).locator('.composer textarea').fill('主会话原草稿，不应改变')
    await 坞(page).locator(".side-chat .chip-group .chip").first().click()
    const overview=page.getByRole('region',{name:'运行总览',exact:true})
    const auto=overview.getByRole('region',{name:'自动安排',exact:true})
    await expect(auto.locator('input[type="number"]')).toHaveCount(0)
    await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('只计算 input.csv 的均值')
    await expect(auto.getByRole('button',{name:'生成安排',exact:true})).toBeEnabled()
    await auto.getByRole('button',{name:'生成安排',exact:true}).click()
    await expect(auto).toContainText('1 个任务块')
    await expect(主区(page).locator('.composer textarea')).toHaveValue('主会话原草稿，不应改变')
    await expect(主区(page).locator('.plan-card')).toHaveCount(0)
    await 进坞(page,'对话')
    await expect(坞(page).locator('.plan-card')).toContainText('1 个任务块')
    await 坞(page).locator(".side-chat .chip-group .chip").first().click()
    await 坞(page).getByText("团队管理与原始记录", { exact: true }).click()
    const 格 = 坞(page).locator(".team-panel")
    await expect(格).toBeVisible({ timeout: 30_000 })
    await expect(格.locator(".team-name")).toHaveText("审稿小队")
    await expect(格.locator('[data-team-source="side"]')).toBeVisible()

    await 进坞(page, "对话")
    await 进坞(page, "团队")
    // 空态不在 `.team-panel` 里（`.team-empty-wrap`）——按坞整格判
    await expect(坞(page)).toContainText("这段会话没有团队")
    await expect(坞(page).locator('[data-team-source="side"]')).toHaveCount(0)
  })
})

/**
 * **新建任务那一屏打开坞里的对话 → 另开的是普通对话**（2026-09-29 作者报的）：
 * 此前主区没会话时坞退到「当前项目」（人上一次待过的那个），没选文件夹，坞里那段却建在那个文件夹里。
 * 夹具自带一个项目，正好是那个「上一次待过的」。
 */
test("**新建任务那一屏：坞里另开一段是普通对话，不带文件夹**", async ({ dawn }) => {
  const { page } = dawn
  await 主区(page).locator(".composer-card").waitFor({ timeout: 30_000 })
  await 坞里另开一段(page)
  // 坞里那段落在侧栏「会话」那一组，不在「项目」下
  const 分区 = await page.locator(".sidebar .side-section").allTextContents()
  expect(分区.some((t) => t.startsWith("会话"))).toBe(true)
  await expect(page.locator(".proj-list .proj-item")).toHaveCount(0)
  // 坞里输入卡上没有文件夹名
  await expect(坞(page).locator(".composer-card .ws-chip-label")).toHaveCount(0)
})

/**
 * **坞里的输入卡与主区同高、底边对齐**（2026-09-29，作者选的「底边对齐 + 同高」）。
 * 文字区与底边固定；Nov15约定仅允许极窄容器的工具栏多一行，常规宽度仍量完整外卡同高。
 */
for (const [宽, 高] of [[1280, 900], [1920, 1080]] as const) {
  test(`**${宽} 宽：输入正文同高且底边对齐，拖动分栏仅允许极窄底栏折行**`, async ({ dawn }) => {
    const { page, app } = dawn
    await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [宽, 高])
    await 开一段临时会话(page, "你好")
    await 坞里另开一段(page)
    const measure = (area: import("@playwright/test").Locator) => area.locator(".composer-card").evaluate(el => {
      const card = el.getBoundingClientRect()
      const footer = el.querySelector<HTMLElement>(".composer-footer")!
      const foot = footer.getBoundingClientRect()
      const field = el.querySelector<HTMLTextAreaElement>("textarea.composer-field")!
      const body = el.querySelector<HTMLElement>(".composer-input-wrap")!
      // Container queries use the nearest size container's content width, not the dock/screen width.
      let container = footer.parentElement!
      while (getComputedStyle(container).containerType === "normal") container = container.parentElement!
      const style = getComputedStyle(container)
      const width = container.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
      const extraConfig = Boolean(footer.querySelector(".config-pill, .composer-status:not(:empty)"))
      const mayWrap = width <= 320 || (width <= 360 && extraConfig)
      const rows: { center: number; height: number }[] = []
      for (const child of Array.from(footer.children)) {
        const rect = child.getBoundingClientRect()
        if (!rect.width || !rect.height) continue
        const center = (rect.top + rect.bottom) / 2
        const row = rows.find(row => Math.abs(row.center - center) <= 4)
        if (row) row.height = Math.max(row.height, rect.height)
        else rows.push({ center, height: rect.height })
      }
      const footStyle = getComputedStyle(footer)
      const naturalHeight = rows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, rows.length - 1) * Number.parseFloat(footStyle.rowGap)
        + Number.parseFloat(footStyle.paddingTop) + Number.parseFloat(footStyle.paddingBottom)
        + Number.parseFloat(footStyle.borderTopWidth) + Number.parseFloat(footStyle.borderBottomWidth)
      const buttons = Array.from(footer.querySelectorAll("button")).map(button => button.getBoundingClientRect()).filter(rect => rect.width && rect.height)
      return {
        height: card.height, bottom: card.bottom, footerHeight: foot.height,
        fieldHeight: field.getBoundingClientRect().height, bodyHeight: body.getBoundingClientRect().height,
        width, rows: rows.length, mayWrap, naturalFooter: Math.round(foot.height - naturalHeight) === 0,
        contained: buttons.length > 0 && buttons.every(rect => rect.left >= foot.left && rect.right <= foot.right && rect.top >= foot.top && rect.bottom <= foot.bottom)
          && footer.scrollWidth <= footer.clientWidth && footer.scrollHeight <= footer.clientHeight,
      }
    })
    const initial = await Promise.all([measure(主区(page)), measure(坞(page))])
    const 量 = async () => {
      const pair = await Promise.all([measure(主区(page)), measure(坞(page))])
      const [主, 侧] = pair
      return {
        主体高差: Math.round(Math.abs((主.height - 主.footerHeight) - (侧.height - 侧.footerHeight))),
        底差: Math.round(Math.abs(主.bottom - 侧.bottom)),
        输入高度固定: pair.every((card, i) => card.fieldHeight === initial[i]!.fieldHeight && card.bodyHeight === initial[i]!.bodyHeight)
          && 主.fieldHeight === 侧.fieldHeight && 主.bodyHeight === 侧.bodyHeight,
        底栏合规: pair.every(card => card.contained && card.naturalFooter && (card.rows === 1 || (card.mayWrap && card.rows === 2))),
        常规宽整卡同高: 主.mayWrap || 侧.mayWrap || Math.round(Math.abs(主.height - 侧.height)) === 0,
      }
    }
    const expectedGeometry = { 主体高差: 0, 底差: 0, 输入高度固定: true, 底栏合规: true, 常规宽整卡同高: true }
    await expect.poll(量, { timeout: 10_000 }).toEqual(expectedGeometry)
    const input = 框(坞(page))
    const 空高 = await input.evaluate(el => el.getBoundingClientRect().height)
    const 主高 = await 主区(page).locator("textarea.composer-field").evaluate(el => el.getBoundingClientRect().height)
    expect(空高).toBe(主高)
    for (const text of ["第一行\n第二行\n第三行", "移动分栏后文字继续换行".repeat(60), ""]) {
      await input.fill(text)
      expect(await input.evaluate(el => el.getBoundingClientRect().height)).toBe(空高)
      await expect.poll(量).toEqual(expectedGeometry)
    }
    const sash = 坞(page).getByRole("separator", { name: "调整面板宽度" })
    const dragTo = async (width: number) => {
      // aria-valuenow updates before the grid transition finishes; hit the sash
      // at its settled position rather than the preceding animation frame.
      await page.locator(".body").evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))) })
      const grip = (await sash.boundingBox())!
      const previous = Number(await sash.getAttribute("aria-valuenow"))
      const x = grip.x + grip.width / 2, y = grip.y + grip.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + previous - width, y, { steps: 8 })
      await page.mouse.up()
      await expect(sash).toHaveAttribute("aria-valuenow", String(width))
    }
    // The 1280px window caps its dock at 600px to reserve the main conversation.
    for (const sideWidth of (宽 === 1920 ? [280, 360, 440, 600, 720] : [280, 360, 440, 600])) {
      await dragTo(sideWidth)
      await input.fill("只在侧边输入的长草稿".repeat(80))
      await expect.poll(量).toEqual(expectedGeometry)
      expect(await input.evaluate(el => el.getBoundingClientRect().height)).toBe(空高)
      expect(await input.evaluate(el => el.scrollHeight)).toBeGreaterThan(空高)
    }
    await dragTo(480)
    await input.fill("")
    await expect.poll(量).toEqual(expectedGeometry)
    await 主区(page).locator("textarea.composer-field").fill("主区与侧边保持相同高度，文字可以自动换行。")
    await input.fill("侧边输入较长的文字，也在相同高度的框内换行和滚动。".repeat(12))
    await input.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll", { bubbles: true })) })
    const geometry = await page.locator(".composer-card").evaluateAll(cards => cards.map(card => {
      const field = card.querySelector("textarea")!, rect = card.getBoundingClientRect()
      return { width: rect.width, height: rect.height, fieldHeight: field.clientHeight, scrollHeight: field.scrollHeight }
    }))
    const geometryPath = test.info().outputPath("composer-geometry.json")
    writeFileSync(geometryPath, JSON.stringify(geometry, null, 2))
    await test.info().attach("composer-geometry", { path: geometryPath, contentType: "application/json" })
    const clip = await page.locator(".composer-card").evaluateAll(cards => {
      const boxes = cards.map(card => card.getBoundingClientRect())
      const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y))
      return { x, y, width: Math.max(...boxes.map(b => b.right)) - x, height: Math.max(...boxes.map(b => b.bottom)) - y }
    })
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => { document.documentElement.classList.toggle("dawn-dark", theme === "dark"); document.documentElement.classList.toggle("dawn-light", theme === "light") }, theme)
      const screenshotPath = test.info().outputPath(`composer-cards-${theme}.png`)
      await page.screenshot({ path: screenshotPath, clip, animations: "disabled", scale: "css" })
      await test.info().attach(`composer-cards-${theme}`, { path: screenshotPath, contentType: "image/png" })
      await expect.poll(量).toEqual(expectedGeometry)
    }
    await test.info().attach("aligned-composers", { body: await page.screenshot(), contentType: "image/png" })
  })
}
