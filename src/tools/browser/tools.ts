/**
 * 浏览器插件的**工具面**（2026-08-25，学自 dsh-reef；15 个工具、四族）。
 *
 * 端走了它两样最值钱的设计：
 * - **snapshot 文本优先**：innerText（截断说明白）+ 链接清单 + 输入框计数——不带视觉的模型直接能「看」；
 * - **elements 给现成选择器**：`#id` / `tag[name="…"]` 拼好交出去，agent 不用先 eval 摸一轮 DOM。
 *
 * 产物纪律：截图落工作区 `.dawn/screenshots/` 并自动清理（7 天 / 200 张，只扫直属文件）；
 * 下载经页面上下文（带 Cookie）落工作区。复用 office 插件的定义 DSL（shape.ts）。
 */
import { mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve as pathResolve, sep } from "node:path"
import type { Office工具定义 } from "../office/shape.js"
import { 开标签, 要页面, 列标签, 切标签, 关标签, 状态, 关浏览器 } from "./session.js"

const 默认超时 = 10_000

/**
 * 解析一个**下载写入目标**,确保它落在工作区内(审查 debug E2)。
 * 与 `files/access.ts` 的 `resolveInWorkspace` 同一道守卫,但那条要求目标已存在
 * (它是读取用);下载写的是新文件,父目录还可能不存在,所以单列一个写入版:
 *   ① 拒绝绝对路径(把守卫判断权交给调用方等于没守卫);
 *   ② `resolve` 归一化后字符串前缀比对,挡 `../../x` 逃逸;
 *   ③ `mkdir` 父目录后对**父目录** realpath 再验一次,挡符号链接逃逸
 *      (工作区里若有个软链指向外面,字符串比对看不出来)。
 * 浏览器工具不过权限门(见审查清单 B1),这道守卫是 browser_download 唯一的边界。
 */
export function 工作区内写入目标(workspace: string, 相对: string): string {
  if (相对.startsWith("/") || /^[A-Za-z]:[\\/]/.test(相对)) {
    throw new Error("只能下载到工作区内(不接受绝对路径)")
  }
  const root = realpathSync(workspace)
  const 目标 = pathResolve(root, 相对)
  if (目标 !== root && !目标.startsWith(root + sep)) {
    throw new Error(`拒绝:「${相对}」在工作区之外`)
  }
  mkdirSync(dirname(目标), { recursive: true })
  const 父 = realpathSync(dirname(目标))
  if (父 !== root && !父.startsWith(root + sep)) {
    throw new Error(`拒绝:「${相对}」的父目录经符号链接指到了工作区之外`)
  }
  return 目标
}

/** 截图清理（学 reef 的双阈值）：7 天 / 200 张，只清直属 .png——别人放进目录的活着 */
export function 清截图(目录: string, 现在 = Date.now(), 最老天数 = 7, 最多张 = 200): number {
  let entries: string[]
  try {
    entries = readdirSync(目录).filter((n) => n.endsWith(".png"))
  } catch {
    return 0
  }
  const 带时间 = entries
    .map((n) => {
      try {
        return { n, at: statSync(join(目录, n)).mtimeMs }
      } catch {
        return undefined
      }
    })
    .filter((x): x is { n: string; at: number } => x !== undefined)
    .sort((a, b) => b.at - a.at)
  const 要删 = new Set<string>()
  const 线 = 现在 - 最老天数 * 24 * 3600 * 1000
  for (const x of 带时间) if (x.at < 线) 要删.add(x.n)
  for (const x of 带时间.slice(最多张)) 要删.add(x.n)
  for (const n of 要删) rmSync(join(目录, n), { force: true })
  return 要删.size
}

/** eval 的结果净化成 lossless JSON（学 reef）：函数 / DOM / 循环引用降级成字符串 */
export function 净化(v: unknown): unknown {
  try {
    return JSON.parse(
      JSON.stringify(v, (_k, x) => {
        if (typeof x === "function") return `[function]`
        if (typeof x === "bigint") return String(x)
        return x
      }) ?? "null",
    )
  } catch {
    return String(v)
  }
}

export function browser工具定义(workspace: string): { 族: string; 名: string; 工具: Office工具定义[] }[] {
  const 浏览: Office工具定义[] = [
    {
      name: "browser_open",
      description:
        "在共享浏览器里打开一个 URL（headless，复用系统 Edge/Chrome）。之后用 browser_snapshot 读内容、browser_elements 找可点的东西、browser_click / browser_type 操作。浏览器在多段对话间共享。",
      parameters: {
        url: { type: "string", required: true, description: "完整 URL（含协议）" },
        new_tab: { type: "boolean", description: "开新标签（默认在当前标签导航）" },
      },
      execute: async (args) => {
        if (args.new_tab) {
          const t = await 开标签(String(args.url))
          return { content: `已在新标签 ${t.id} 打开 ${t.page.url()}\n标题：${await t.page.title()}` }
        }
        const page = await 要页面()
        await page.goto(String(args.url), { waitUntil: "domcontentloaded", timeout: 默认超时 })
        return { content: `已打开 ${page.url()}\n标题：${await page.title()}` }
      },
    },
    {
      name: "browser_tabs",
      description: "标签页管理：list 列出全部；switch/close 按 id 操作。",
      parameters: {
        action: { type: "string", required: true, enum: ["list", "switch", "close"] },
        id: { type: "string", description: "switch/close 的目标标签 id" },
      },
      execute: async (args) => {
        if (args.action === "list") {
          const 列 = 列标签()
          if (列.length === 0) return { content: "没有开着的标签。" }
          return { content: 列.map((t) => `${t.active ? "* " : "  "}${t.id}  ${t.url}`).join("\n") }
        }
        const id = String(args.id ?? "")
        if (args.action === "switch") return { content: 切标签(id) ? `已切到 ${id}` : `没有标签 ${id}` }
        return { content: (await 关标签(id)) ? `已关 ${id}` : `没有标签 ${id}` }
      },
    },
    {
      name: "browser_back",
      description: "后退一页。",
      parameters: {},
      execute: async () => {
        const page = await 要页面()
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 默认超时 }).catch(() => {})
        return { content: `现在在 ${page.url()}` }
      },
    },
    {
      name: "browser_reload",
      description: "刷新当前页。",
      parameters: {},
      execute: async () => {
        const page = await 要页面()
        await page.reload({ waitUntil: "domcontentloaded", timeout: 默认超时 })
        return { content: `已刷新 ${page.url()}` }
      },
    },
    {
      name: "browser_wait",
      description: "等一个选择器出现，或干等几毫秒。",
      parameters: {
        selector: { type: "string", description: "等它出现（CSS 选择器）" },
        ms: { type: "integer", description: "没给 selector 时干等的毫秒数（≤10000）" },
      },
      execute: async (args) => {
        const page = await 要页面()
        if (args.selector) {
          await page.waitForSelector(String(args.selector), { timeout: 默认超时 })
          return { content: `出现了：${args.selector}` }
        }
        await page.waitForTimeout(Math.min(Number(args.ms ?? 1000), 10_000))
        return { content: "等完了。" }
      },
    },
    {
      name: "browser_status",
      description: "浏览器状态：开没开、几个标签、当前 URL。",
      parameters: {},
      execute: async () => {
        const s = 状态()
        return {
          content: s.open
            ? `开着（${s.channel}）· ${s.tabs} 个标签 · 当前 ${s.activeUrl || "（空标签）"}`
            : "浏览器没开。任何 browser_* 工具会自动把它拉起来。",
        }
      },
    },
    {
      name: "browser_close",
      description: "关掉共享浏览器（多段对话共享——关了别的对话也得重启它；不确定就别关）。",
      parameters: {},
      execute: async () => {
        await 关浏览器()
        return { content: "浏览器已关。" }
      },
    },
  ]

  const 读页: Office工具定义[] = [
    {
      name: "browser_snapshot",
      description:
        "读取当前页：正文文本（截断会说明）、前 N 条链接、输入框计数。**这是纯文本模型「看」网页的方式**——先 snapshot 再决定点哪儿。",
      parameters: {
        max_text: { type: "integer", description: "正文最多字符（默认 8000）" },
        max_links: { type: "integer", description: "最多列几条链接（默认 40）" },
      },
      execute: async (args) => {
        const page = await 要页面()
        const maxT = Math.min(Number(args.max_text ?? 8000), 40_000)
        const maxL = Math.min(Number(args.max_links ?? 40), 200)
        const d = await page.evaluate(
          ([mt, ml]) => {
            const text = document.body ? document.body.innerText : ""
            const links = Array.from(document.querySelectorAll("a"))
              .slice(0, ml as number)
              .map((a) => `- ${(a.textContent ?? "").trim().slice(0, 120)} → ${(a as HTMLAnchorElement).href}`)
            const inputs = document.querySelectorAll("input, textarea, select").length
            return { text: text.slice(0, mt as number), truncated: text.length > (mt as number), links, inputs }
          },
          [maxT, maxL],
        )
        return {
          content: [
            `URL：${page.url()}`,
            `标题：${await page.title()}`,
            `输入框：${d.inputs} 个`,
            "",
            d.text + (d.truncated ? `\n…（正文截断于 ${maxT} 字符，调大 max_text 或用 browser_eval 精确取）` : ""),
            "",
            d.links.length > 0 ? `链接（前 ${d.links.length} 条）：\n${d.links.join("\n")}` : "（没有链接）",
          ].join("\n"),
        }
      },
    },
    {
      name: "browser_elements",
      description:
        "列出可交互元素（input/textarea/select/button/链接）：类型、名字、占位符、文本，**并给出现成的 CSS 选择器**——直接喂给 browser_click / browser_type，不用自己摸 DOM。",
      parameters: {
        max: { type: "integer", description: "最多列几个（默认 60，上限 200）" },
      },
      execute: async (args) => {
        const page = await 要页面()
        const max = Math.min(Math.max(Number(args.max ?? 60), 1), 200)
        const 列 = await page.evaluate((maxN: number) => {
          const out: string[] = []
          const seen = new Set<string>()
          for (const el of Array.from(document.querySelectorAll("input, textarea, select, button, a[href]")) as HTMLElement[]) {
            if (out.length >= maxN) break
            const r = el.getBoundingClientRect()
            if (r.width === 0 && r.height === 0) continue
            const i = el as HTMLInputElement
            const sel = el.id
              ? `#${CSS.escape(el.id)}`
              : i.name
                ? `${el.tagName.toLowerCase()}[name="${i.name}"]`
                : ""
            const 描 = [
              el.tagName.toLowerCase() + (i.type ? `:${i.type}` : ""),
              i.placeholder ? `placeholder=「${i.placeholder}」` : "",
              el.getAttribute("aria-label") ? `aria=「${el.getAttribute("aria-label")}」` : "",
              (el.innerText || "").trim().slice(0, 60),
              sel ? `→ ${sel}` : "→（没有稳定选择器，用文本定位或 browser_eval）",
            ].filter(Boolean).join("  ")
            if (seen.has(描)) continue
            seen.add(描)
            out.push(描)
          }
          return out
        }, max)
        return { content: 列.length > 0 ? 列.join("\n") : "这一页没有可交互元素。" }
      },
    },
  ]

  const 操作: Office工具定义[] = [
    {
      name: "browser_click",
      description: "点击一个元素（CSS 选择器，browser_elements 会给现成的）。",
      parameters: { selector: { type: "string", required: true, description: "CSS 选择器" } },
      execute: async (args) => {
        const page = await 要页面()
        await page.click(String(args.selector), { timeout: 默认超时 })
        await page.waitForLoadState("domcontentloaded").catch(() => {})
        return { content: `点了 ${args.selector}\n现在在 ${page.url()}` }
      },
    },
    {
      name: "browser_type",
      description: "往一个输入框里打字。clear 先清空；submit 打完按回车。",
      parameters: {
        selector: { type: "string", required: true, description: "CSS 选择器" },
        text: { type: "string", required: true, description: "要打的字" },
        clear: { type: "boolean", description: "先清空（默认追加）" },
        submit: { type: "boolean", description: "打完按回车" },
      },
      execute: async (args) => {
        const page = await 要页面()
        const sel = String(args.selector)
        if (args.clear) await page.fill(sel, String(args.text), { timeout: 默认超时 })
        else {
          await page.click(sel, { timeout: 默认超时 })
          await page.keyboard.type(String(args.text))
        }
        if (args.submit) await page.keyboard.press("Enter")
        return { content: `已输入。现在在 ${page.url()}` }
      },
    },
    {
      name: "browser_press",
      description: "按一个键（Enter / Tab / Escape / ArrowDown …）。",
      parameters: { key: { type: "string", required: true, description: "键名" } },
      execute: async (args) => {
        const page = await 要页面()
        await page.keyboard.press(String(args.key))
        return { content: `按了 ${args.key}` }
      },
    },
    {
      name: "browser_eval",
      description: "在页面上下文执行一段 JS，返回值净化成 JSON。snapshot/elements 不够用时的精确手段。",
      parameters: { code: { type: "string", required: true, description: "JS 表达式或语句（其返回值会被带回）" } },
      execute: async (args) => {
        const page = await 要页面()
        const r = await page.evaluate((code: string) => {
          // eslint-disable-next-line no-eval
          return eval(code)
        }, String(args.code))
        return { content: JSON.stringify(净化(r), null, 1) ?? "undefined" }
      },
    },
  ]

  const 产物: Office工具定义[] = [
    {
      name: "browser_screenshot",
      description: "把当前页截图存进工作区 .dawn/screenshots/（自动清理：7 天 / 200 张）。给人看的；模型读页面用 browser_snapshot。",
      parameters: {
        full_page: { type: "boolean", description: "整页长图（默认视口）" },
      },
      execute: async (args) => {
        const page = await 要页面()
        const 目录 = join(workspace, ".dawn", "screenshots")
        mkdirSync(目录, { recursive: true })
        const 名 = `${new Date().toISOString().replace(/[:.]/g, "-")}.png`
        await page.screenshot({ path: join(目录, 名), fullPage: args.full_page === true })
        const 清了 = 清截图(目录)
        return { content: `截图存到 .dawn/screenshots/${名}${清了 > 0 ? `（顺手清了 ${清了} 张过期的）` : ""}` }
      },
    },
    {
      name: "browser_download",
      description: "把一个 URL 的内容下载进工作区（经页面上下文发请求，带着当前 Cookie——登录后的文件也拿得到）。",
      parameters: {
        url: { type: "string", required: true, description: "要下载的 URL" },
        save_as: { type: "string", description: "存成的相对路径（默认按 URL 尾段取名，落工作区根）" },
      },
      execute: async (args) => {
        const page = await 要页面()
        const url = String(args.url)
        const resp = await page.request.get(url, { timeout: 30_000 })
        if (!resp.ok()) throw new Error(`下载失败：HTTP ${resp.status()} ${url}`)
        const body = await resp.body()
        // URL 尾段兜底:以 `/` 结尾或取到空串时退回默认名(审查 debug E10:空串不是 nullish,?? 不兜)
        const 尾 = url.split("/").pop()?.split("?")[0]?.trim()
        const 名 = String(args.save_as ?? (尾 || "下载文件"))
        // 目录穿越守卫:save_as="../../x" 或经软链逃逸都在这里被拦下
        const 目标 = 工作区内写入目标(workspace, 名)
        writeFileSync(目标, body)
        return { content: `已下载 ${body.byteLength} 字节 → ${名}` }
      },
    },
  ]

  return [
    { 族: "browse", 名: "浏览", 工具: 浏览 },
    { 族: "read", 名: "读页", 工具: 读页 },
    { 族: "act", 名: "操作", 工具: 操作 },
    { 族: "artifact", 名: "产物", 工具: 产物 },
  ]
}
