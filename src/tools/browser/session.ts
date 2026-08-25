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
/** **全局最近活跃标签**:给坞「旁观」那格用(它旁观的是「agent 的浏览器」这一整个,不分会话) */
let 活跃: string | null = null
let 计数 = 0
/**
 * **每段会话自己的活跃标签**(审查 debug E6)。浏览器进程共享,但活跃标签不能共享——
 * 否则两段会话同时用,B 的 `要页面()` 会拿到 A 打开的页,B 的截图/下载落进 B 的工作区却是 A 的页面(跨工作区越界)。
 * 会话不给 id 时(坞旁观、测试)退回全局那条,行为不变。
 */
const 会话活跃 = new Map<string, string>()
/** 标签归谁:一段会话只看得见、切得动、关得掉自己开的标签 */
const 标签主 = new Map<string, string>()

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

export async function 开标签(url?: string, 会话?: string): Promise<标签> {
  const b = await 启动()
  const page = await b.newPage()
  const id = `tab-${++计数}`
  const t = { id, page }
  标签们.set(id, t)
  活跃 = id // 全局最近活跃(坞旁观用)
  if (会话) {
    会话活跃.set(会话, id)
    标签主.set(id, 会话)
  }
  page.on("close", () => {
    标签们.delete(id)
    const 主 = 标签主.get(id)
    标签主.delete(id)
    if (活跃 === id) 活跃 = [...标签们.keys()].at(-1) ?? null
    // 这段会话的活跃标签关了,退回它自己剩下的标签里最后开的那个
    if (主 && 会话活跃.get(主) === id) {
      const 它的 = [...标签主.entries()].filter(([, s]) => s === 主).map(([tid]) => tid)
      const 下一个 = 它的.at(-1)
      if (下一个) 会话活跃.set(主, 下一个)
      else 会话活跃.delete(主)
    }
  })
  page.on("load", () => {
    void page.title().then((title) => 记历史(page.url(), title)).catch(() => {})
  })
  if (url) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" })
    } catch (e) {
      // **goto 失败别把这张空白页留成活跃标签**(审查 debug E10)。此前抛异常前 tab 已进表、已设活跃,
      // 下一次操作就落在一张 about:blank 上,症状是「打开失败了,可后面的 snapshot/截图却对着空白页」。
      // 关掉它(close 处理会摘表并重挑活跃),再把原因如实抛出去。
      await page.close().catch(() => {})
      throw e
    }
  }
  return t
}

/**
 * 当前活跃的页面；没有就开一个空的（工具们的入口——**没有「先 open 才能用」的暗规矩**）。
 * **给了会话 id 就用这段会话自己的活跃标签**(审查 debug E6):不给才退回全局那条。
 */
export async function 要页面(会话?: string): Promise<Page> {
  const 目标id = 会话 ? 会话活跃.get(会话) : 活跃
  const t = 目标id ? 标签们.get(目标id) : undefined
  if (t && !t.page.isClosed()) {
    活跃 = t.id // 摸过就更新全局最近活跃(坞旁观跟着这段会话)
    return t.page
  }
  return (await 开标签(undefined, 会话)).page
}

export function 列标签(会话?: string): { id: string; url: string; title: string; active: boolean }[] {
  // 给了会话就只列它自己开的(审查 debug E6);不给列全部(坞用)
  const 活 = 会话 ? 会话活跃.get(会话) : 活跃
  return [...标签们.values()]
    .filter((t) => !会话 || 标签主.get(t.id) === 会话)
    .map((t) => ({
      id: t.id,
      url: t.page.url(),
      // title() 是异步的；列表用 url 兜底，真标题走 status 单页取
      title: "",
      active: t.id === 活,
    }))
}

export function 切标签(id: string, 会话?: string): boolean {
  if (!标签们.has(id)) return false
  // 只切得动自己的标签(审查 debug E6):别把别的会话的页抢过来当活跃
  if (会话 && 标签主.get(id) !== 会话) return false
  活跃 = id
  if (会话) 会话活跃.set(会话, id)
  return true
}

export async function 关标签(id: string, 会话?: string): Promise<boolean> {
  const t = 标签们.get(id)
  if (!t) return false
  if (会话 && 标签主.get(id) !== 会话) return false // 只关得掉自己的
  await t.page.close().catch(() => {})
  return true
}

export function 状态(会话?: string): { open: boolean; channel: string; tabs: number; activeUrl: string } {
  const 活 = 会话 ? 会话活跃.get(会话) : 活跃
  const t = 活 ? 标签们.get(活) : undefined
  return {
    open: Boolean(浏览器?.isConnected()),
    channel: 频道 ?? "",
    tabs: 会话 ? [...标签主.values()].filter((s) => s === 会话).length : 标签们.size,
    activeUrl: t && !t.page.isClosed() ? t.page.url() : "",
  }
}

export async function 关浏览器(): Promise<void> {
  await 浏览器?.close().catch(() => {})
  浏览器 = null
  标签们.clear()
  活跃 = null
  会话活跃.clear()
  标签主.clear()
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
