/**
 * 视觉基线（①-B″ · V1）。**跑真实构建产物，两个主题各存一份。**
 *
 * 它回答的是别的测试回答不了的一个问题：**「我改样式的时候，到底改了什么？」**
 * 断言能证明「聚焦环是强调色」「主按钮对比度达标」，但证明不了
 * 「侧栏没有莫名其妙宽了 8px」「某个面的底色被顺手改掉了」。
 *
 * ## 这类测试最常见的死法，以及这里怎么防
 *
 * **假报警 → 条件反射 `--update-snapshots` → 从此什么都不证明。**
 * 所以确定性必须先解决，而不是靠调大容差糊过去：
 *
 * | 不确定的来源 | 处理 |
 * |---|---|
 * | 过渡动画（`transition: background-color 100ms`） | `animations: "disabled"` |
 * | 光标闪烁 | `caret: "hide"` |
 * | 会话状态 starting → alive | 截图前等到 `.state.alive` |
 * | **耗时 `.dur`（跟墙上时钟走）** | `mask` 遮掉，见下 |
 * | **会话行的 `agent · HH:MM`（同上）** | 同样 `mask` 遮掉 |
 * | 窗口尺寸 | `BrowserWindow` 固定 1280×840 |
 * | 模型回复 | 假模型的固定暗号 |
 * | 状态栏那句「未配置任何 API key」要等 providers 加载 | 截图前等它出现 |
 * | **广色域屏上饱和色的合成漂移** | `--force-color-profile=srgb`（见 fixtures） |
 *
 * 最后一条是这一版最花时间的：收紧阈值后八张图开始随机红一两张，每次 3000–5000 像素。
 * diff 图指得很清楚——**只有饱和色的区域在变，所有中性灰一个像素都没动**，
 * 而且按钮的整块底都在变、不只是文字边缘，所以不是抗锯齿。
 * macOS 的广色域屏上，Chromium 有时按 sRGB 合成、有时按 P3。
 * **那是采集环境的问题，不是应用的问题**，所以修在夹具里，
 * 而不是靠调大容差把真实的颜色漂移一起放过去。
 *
 * **遮罩是有代价的，必须说出来**：`.dur` 被遮掉之后，那一小块就**不再受这层保护**。
 * 遮罩不是"让它过"，是"声明这里不覆盖"——不写清楚的话，
 * 一个被遮掉的区域会悄悄退出测试而没人知道。
 *
 * ## 容差用绝对像素数，不用比例
 *
 * `maxDiffPixelRatio` 看着更"讲道理"，但它对这类界面是错的：
 * **一条 1px 发丝线横跨 1000px 的面板，改掉它只动 1000 个像素**，
 * 而 1280×840 的 0.2% 就是 2150 个——比例容差会把它整个放过去。
 * 绝对上限 100 只容得下几个抖动的像素，容不下任何结构性改动。
 *
 * ## 两个已知边界
 *
 * 1. **基线是 macOS 的**（文件名里的 `-darwin` 就是这个意思）。换平台跑会全红，
 *    那不是回归，是没有那个平台的基线。将来上 CI 必须在 macOS 上跑，或者补一套。
 * 2. 基线**只覆盖这四个屏 × 两个主题**。别的屏改坏了它不会说话。
 */
import { test, expect, CANNED_REPLY } from "./fixtures.js"
import type { Page } from "@playwright/test"

/**
 * 切主题，**并且回到对话页**。
 *
 * 最后那一步不是可有可无：设置页的右上角按钮此时已经是「返回」而不是「设置」。
 * 第一版把「回不回」交给调用点判断，于是「设置」这一屏走到 `go` 里又点了一次
 * 「设置」——**那个按钮已经不在了**，30 秒超时。
 * 每个屏都从同一个起点出发，就没有这个分叉。
 */
async function setTheme(page: Page, label: "亮色" | "暗色") {
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("radio", { name: label }).click()
  await expect(page.locator(label === "暗色" ? "html.dawn-dark" : "html.dawn-light")).toHaveCount(1)
  await page.getByRole("button", { name: "返回" }).click()
}

async function startSession(page: Page) {
  await page.getByRole("button", { name: /新建会话/ }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()
  // **等到状态落定**。starting → alive 是一次真实的状态迁移，
  // 在它中间截图会得到一张随时机变化的图
  await expect(page.locator(".session-list .state.alive")).toBeVisible()
}

/** 四个屏。每个负责把界面开到那个状态，然后返回 */
const SCREENS: { name: string; go: (page: Page) => Promise<void> }[] = [
  {
    name: "空态",
    // 一个会话都没有时的首页。主动作 + agent pill + 侧栏空态
    go: async (page) => {
      await expect(page.getByRole("button", { name: /用 .* 开始/ })).toBeVisible()
    },
  },
  {
    name: "对话",
    // transcript + markdown + composer + pill。**界面的主战场**
    go: async (page) => {
      await startSession(page)
      await page.getByPlaceholder(/回车发送/).fill("请说一句话")
      await page.getByRole("button", { name: "发送", exact: true }).click()
      await expect(page.getByText(CANNED_REPLY)).toBeVisible()
    },
  },
  {
    name: "设置",
    // 面板 + 表单控件 + radiogroup
    go: async (page) => {
      await page.getByRole("button", { name: "设置", exact: true }).click()
      await expect(page.getByRole("radiogroup", { name: "主题" })).toBeVisible()
      // **等数据本身，不是等骨架。** radiogroup 是同步渲染的，凭证列表不是；
      // 只等前者会在数据到达之前截图 —— 这条正是第一次跑出来的假报警
      // 2026-08-10 设置改成 Section > Row > Control：凭证不再是一条 `.cred`，
      // 而是一行里的一个表单。**等的还是同一件事**——凭证数据到了没有
      // 折叠里还有几十个（pi 认识的其余 provider），所以不数总数——
      // **等的还是同一件事**：凭证数据到了没有
      await expect(page.locator(".set-control .cred-form").first()).toBeVisible()
    },
  },
  {
    name: "命令面板",
    // 浮层 + 遮罩 + 分组列表 + **不可用那一条的样子**
    go: async (page) => {
      await expect(page.getByRole("button", { name: /用 .* 开始/ })).toBeVisible()
      await page.keyboard.press("ControlOrMeta+k")
      await expect(page.getByRole("dialog", { name: "命令面板" })).toBeVisible()
      // 等到列表画完再截，否则会截到只有输入框的那一帧
      await expect(page.getByRole("option", { name: /中止当前回合/ })).toBeVisible()
    },
  },
  {
    name: "项目概览",
    // 多个面板并排 + 列表 + 空态
    go: async (page) => {
      await page.getByRole("button", { name: "项目概览" }).click()
      // 同上：`.panels` 是骨架。等到面板都挂上，否则会截到「少一块」的中间态
      await expect(page.locator(".panels .panel")).not.toHaveCount(0)
      await expect(page.getByText("还没有记录")).toBeVisible()
    },
  },
]

for (const theme of ["亮色", "暗色"] as const) {
  for (const screen of SCREENS) {
    test(`${screen.name} · ${theme}`, async ({ dawn }) => {
      const { page } = dawn
      await setTheme(page, theme)
      await screen.go(page)

      /**
       * **等状态栏落定。**
       *
       * 收紧阈值之后跑出的假报警是 3000–5000 像素级的，那不是抗锯齿，
       * 是**有东西时有时无**：状态栏那句「未配置任何 API key……」要等
       * `providers` 加载完才出现，而那行字本身就有几千像素。
       * 它随机命中不同的屏，看着像"图片对比不稳定"，其实是一场普通的竞态。
       *
       * 这条等待放在**所有**屏之前，因为状态栏在每一屏都在。
       */
      await expect(page.locator(".statusbar .caveat")).toBeVisible()

      /**
       * **把指针挪到一个不会悬停任何东西的角落。**
       *
       * `screen.go()` 里点过按钮，指针就停在最后点的那个位置上。
       * 只要那个位置将来长出一个有 hover 态的元素，基线就会开始飘——
       * 而且飘得极像"图片对比不稳定"。
       *
       * 2026-08-09 真的撞上了：空态原本那片空白被四张建议卡片占了，
       * 指针恰好落在第一张上，于是同一份代码两次跑出两张图，
       * **差异正好是那一张卡的 hover 底色**（17056 像素，其余分毫不差）。
       *
       * 与上面那条同类：**逐像素阈值是 0，任何"有时有有时无"都会说话。**
       * 该消除的是不确定性本身，不是把阈值放宽。
       */
      await page.mouse.move(0, 0)

      /**
       * **把鼠标挪开。**
       *
       * 走到某一屏往往要点几下，点完鼠标就停在最后那个按钮上——
       * 于是 `:hover` 生效（`.btn-primary:hover { filter: brightness(1.08) }`），
       * 而截图那一刻它有没有合成完是碰运气的。
       *
       * 表现为「只有那一个按钮在变、别的一个像素不动」，
       * 看着像图片对比不稳定，其实是**测试自己把界面留在了 hover 态**。
       */
      await page.mouse.move(0, 0)

      await expect(page).toHaveScreenshot(`${screen.name}-${theme}.png`, {
        animations: "disabled",
        caret: "hide",
        // **唯一跟墙上时钟走的东西。** 遮掉它，也就等于声明这一小块不在覆盖范围内
        /**
         * **会话行的副行也跟墙上时钟走**（2026-08-10 起它显示 `agent · HH:MM`）。
         * 不遮的话这张基线每过一分钟就自己红一次——**逐像素阈值是 0**，
         * 而一个每分钟红一次的基线，一周之内就会被人条件反射地 update 掉，
         * 那时它什么都不再证明。与 `.dur` 是同一条理由。
         */
        mask: [
          page.locator(".dur"),
          page.locator(".session-list .sess .sub"),
          /**
           * **那个数字来自 pi 的模型目录**（「其余 pi 认识的 provider（39）」），
           * 目录一更新它就变。和时钟是同一类：**外面世界的东西不进逐像素基线**。
           */
          page.locator(".more-providers > summary"),
        ],
        /**
         * **逐像素必须完全一致**（默认是 0.2 的色距容差）。
         *
         * 这个值是试出来的，不是拍的。验证过程记在这里，因为结论反直觉：
         *
         * | threshold | ΔRGB=(2,5,5) 的强调色漂移 | 描边浓度 8%→10% |
         * |---|---|---|
         * | 0.2（默认） | 全绿 —— 漏掉 | 全绿 —— 漏掉 |
         * | 0.02 | 全绿 —— **仍然漏掉** | 全绿 —— 仍然漏掉 |
         * | **0** | 4 条红 | 8 条红 |
         *
         * 也就是说**只要留任何色距容差，令牌的微小漂移就是看不见的**——
         * 而那恰恰是最该被自动抓住的一类回归：肉眼发现不了，改动却是真的。
         *
         * 敢用 0，前提是采集环境已经确定（`--force-color-profile=srgb`，见 fixtures）。
         * 在钉死色彩配置之前，0.02 就已经随机红一两张了。
         *
         * `maxDiffPixels: 100` 仍然留着：它兜的是"万一有几个像素抖"，
         * 而不是"允许颜色不一样"。两者不是一回事。
         */
        threshold: 0,
        maxDiffPixels: 100,
      })
    })
  }
}
