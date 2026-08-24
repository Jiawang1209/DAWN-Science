/**
 * 浏览器插件的**会话层**（2026-08-25，学自 dsh-reef 的 browser 模块，解读见
 * `ccb_hive_code_learn/dsh-reef-浏览器-解读.md`）。
 *
 * **复用系统浏览器**：playwright-core + channel 探测（msedge → chrome），不下载 Chromium——
 * 「给 agent 配浏览器」的安装成本是零。探测不到就说人话（装一个，或 `npx playwright install chromium`）。
 *
 * **一台共享浏览器**（v1 单 profile，headless）：多段会话共用同一个浏览器进程与标签页表——
 * 与 reef 相同的取舍；工具描述里写明「共享」。产物（截图 / 下载）落**调用方会话的工作区**。
 *
 * 首次调用工具时才启动（lazy）；关掉（browser_close）之后再调会重新启动。
 */
import type { Browser, Page } from "playwright-core"

interface 标签 {
  id: string
  page: Page
}

let 浏览器: Browser | null = null
let 频道: string | undefined
const 标签们 = new Map<string, 标签>()
let 活跃: string | null = null
let 计数 = 0

/** 访问历史（给坞的实时画面页签用；最多 50 条，学 reef） */
export const 历史: { url: string; title: string; at: string }[] = []

function 记历史(url: string, title: string): void {
  历史.unshift({ url, title, at: new Date().toISOString() })
  if (历史.length > 50) 历史.length = 50
}

async function 启动(): Promise<Browser> {
  if (浏览器?.isConnected()) return 浏览器
  const { chromium } = await import("playwright-core")
  const 错们: string[] = []
  for (const channel of ["msedge", "chrome"]) {
    try {
      浏览器 = await chromium.launch({ channel, headless: true })
      频道 = channel
      return 浏览器
    } catch (e) {
      错们.push(`${channel}: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`)
    }
  }
  // 最后试 playwright 自装的 Chromium（如果用户装过）
  try {
    浏览器 = await chromium.launch({ headless: true })
    频道 = "chromium"
    return 浏览器
  } catch (e) {
    错们.push(`chromium: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`)
  }
  throw new Error(`本机没探测到可用的浏览器（试过 Edge / Chrome / Chromium）。装一个 Edge 或 Chrome，或跑 npx playwright install chromium。\n${错们.join("\n")}`)
}

export async function 开标签(url?: string): Promise<标签> {
  const b = await 启动()
  const page = await b.newPage()
  const id = `tab-${++计数}`
  const t = { id, page }
  标签们.set(id, t)
  活跃 = id
  page.on("close", () => {
    标签们.delete(id)
    if (活跃 === id) 活跃 = [...标签们.keys()].at(-1) ?? null
  })
  page.on("load", () => {
    void page.title().then((title) => 记历史(page.url(), title)).catch(() => {})
  })
  if (url) await page.goto(url, { waitUntil: "domcontentloaded" })
  return t
}

/** 当前活跃的页面；没有就开一个空的（工具们的入口——**没有「先 open 才能用」的暗规矩**） */
export async function 要页面(): Promise<Page> {
  const t = 活跃 ? 标签们.get(活跃) : undefined
  if (t && !t.page.isClosed()) return t.page
  return (await 开标签()).page
}

export function 列标签(): { id: string; url: string; title: string; active: boolean }[] {
  return [...标签们.values()].map((t) => ({
    id: t.id,
    url: t.page.url(),
    // title() 是异步的；列表用 url 兜底，真标题走 status 单页取
    title: "",
    active: t.id === 活跃,
  }))
}

export function 切标签(id: string): boolean {
  if (!标签们.has(id)) return false
  活跃 = id
  return true
}

export async function 关标签(id: string): Promise<boolean> {
  const t = 标签们.get(id)
  if (!t) return false
  await t.page.close().catch(() => {})
  return true
}

export function 状态(): { open: boolean; channel: string; tabs: number; activeUrl: string } {
  const t = 活跃 ? 标签们.get(活跃) : undefined
  return {
    open: Boolean(浏览器?.isConnected()),
    channel: 频道 ?? "",
    tabs: 标签们.size,
    activeUrl: t && !t.page.isClosed() ? t.page.url() : "",
  }
}

export async function 关浏览器(): Promise<void> {
  await 浏览器?.close().catch(() => {})
  浏览器 = null
  标签们.clear()
  活跃 = null
}

/** 旁观面（2026-08-25，坞「网页」格「agent 旁观」页签）：便宜的状态 + 历史，轮询用它 */
export async function 旁观(): Promise<{
  open: boolean
  channel: string
  activeUrl: string
  activeTitle: string
  tabs: number
  history: { url: string; title: string; at: string }[]
}> {
  const s = 状态()
  const t = 活跃 ? 标签们.get(活跃) : undefined
  const activeTitle = s.open && t && !t.page.isClosed() ? await t.page.title().catch(() => "") : ""
  return { open: s.open, channel: s.channel, activeUrl: s.activeUrl, tabs: s.tabs, activeTitle, history: [...历史] }
}

/**
 * 活跃页截一帧（PNG 的 base64）。**不走 `要页面()`**——那条会 lazy 启动浏览器，
 * 而旁观面只看不推：没开就抛，话写给人看。
 */
export async function 截一帧(): Promise<string> {
  const t = 活跃 ? 标签们.get(活跃) : undefined
  if (!浏览器?.isConnected() || !t || t.page.isClosed()) {
    throw new Error("浏览器没开——agent 用过之后这里才有画面。")
  }
  return (await t.page.screenshot()).toString("base64")
}
