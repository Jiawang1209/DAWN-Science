/**
 * **回复时卡不卡：量，不断言**（2026-09-22，分支 `perf-streaming`）。
 *
 * 起因：Windows 上的朋友说「太卡」，作者确认是**回复的时候**卡。读代码的嫌疑是
 * 转录挂在最顶层的 `App` 上（`useStore($items)`），而 `src/ui` 里没有一处 `memo`——
 * 模型每吐一段，整棵树（侧栏、坞、所有历史消息的 markdown）都要重算。
 * **那是读出来的，不是量出来的**。这份文件先把基线量下来，改之前改之后各跑一次比数字。
 *
 * 两轮，各起一次应用：
 * - **重画**：注入一个假的 React DevTools 钩子，数每次提交里真正重跑了的组件。
 *   钩子本身有开销，所以这一轮**不看时间**。
 * - **时间**：不注入钩子；量长任务（>50ms 的主线程占用）与帧间隔。
 *   另用 CDP 把 CPU 降速 4 倍，近似一台普通的 Windows 笔记本。
 *
 * 每轮同一个剧本：空对话量一次 → 攒到 10 轮历史再量 → 攒到 30 轮再量。
 * 历史每轮都是 `LONG_REPLY`（约 2000 字，5 个代码块、5 张表），量的那一轮用「慢慢说」
 * 按真模型的节奏吐（6 字一段、15ms 一段，约 340 次更新）。
 *
 * 结果打在控制台，同时写进 `perf-results/<PERF_LABEL>-<轮>.json`（已 gitignore）。
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Page } from "@playwright/test"
import { test, 开一段临时会话, 等进了对话 } from "./fixtures.js"

/** 每段 LONG_REPLY 里「最后一段。」出现 5 次——数它就知道完成了几段回复，且不用读整页 innerText */
const 每段回复的标记数 = 5
const 标记 = "最后一段。"

const 输入框 = (page: Page) => page.getByPlaceholder(/今天帮你做些什么/)

async function 已完成回复数(page: Page): Promise<number> {
  return page.evaluate(
    ([m, k]) => Math.floor(((document.querySelector(".turns")?.textContent ?? "").split(m as string).length - 1) / (k as number)),
    [标记, 每段回复的标记数] as const,
  )
}

async function 说一句并等完(page: Page, 话: string, 之前: number): Promise<void> {
  await 输入框(page).fill(话)
  await 输入框(page).press("Enter")
  await page.waitForFunction(
    ([m, k, n]) =>
      ((document.querySelector(".turns")?.textContent ?? "").split(m as string).length - 1) >= (k as number) * (n as number),
    [标记, 每段回复的标记数, 之前 + 1] as const,
    { polling: 500, timeout: 120_000 },
  )
}

async function 攒历史到(page: Page, 目标: number): Promise<void> {
  for (let n = await 已完成回复数(page); n < 目标; n++) await 说一句并等完(page, `长回复 第${n + 1}轮`, n)
}

/** 注入在 React 加载之前：假装自己是 DevTools，拿到每一次提交的根 */
function 装重画计数(): void {
  type Fiber = {
    tag: number
    type: unknown
    child: Fiber | null
    sibling: Fiber | null
    alternate: Fiber | null
    flags: number
  }
  const 组件标签 = new Set([0, 1, 11, 14, 15]) // Function / Class / ForwardRef / Memo / SimpleMemo
  const 名字 = (f: Fiber): string => {
    const t = f.type as { displayName?: string; name?: string; render?: { name?: string }; type?: { name?: string } } | null
    return t?.displayName || t?.name || t?.render?.name || t?.type?.name || "(匿名)"
  }
  let 上一棵 = new WeakSet<object>()
  const 统计 = { 在量: false, 提交: 0, 重跑: 0, 组件总数: 0, 按名字: {} as Record<string, number> }
  ;(window as unknown as { __重画: typeof 统计 }).__重画 = 统计
  ;(window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject: () => 1,
    checkDCE: () => {},
    onScheduleFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
    onPostCommitFiberRoot: () => {},
    onCommitFiberRoot: (_id: number, root: { current: Fiber }) => {
      // **没被碰过的子树里还是上一次那批对象**；克隆过的才是新对象，克隆时 flags 被清空。
      // 新对象上带着 `PerformedWork`（= 1）的，组件函数这一次真的跑了。
      // 第一版按「props 引用变没变」判，把 memo 拦下的那些也算成了重跑（memo 外壳的 props 每次都是新对象）。
      const 这一棵 = new WeakSet<object>()
      const 栈: Fiber[] = [root.current]
      let 重跑 = 0
      let 组件 = 0
      while (栈.length) {
        const f = 栈.pop()!
        这一棵.add(f)
        if (组件标签.has(f.tag)) {
          组件++
          if (!上一棵.has(f) && (f.flags & 1) !== 0) {
            重跑++
            if (统计.在量) 统计.按名字[名字(f)] = (统计.按名字[名字(f)] ?? 0) + 1
          }
        }
        if (f.sibling) 栈.push(f.sibling)
        if (f.child) 栈.push(f.child)
      }
      上一棵 = 这一棵
      if (统计.在量) {
        统计.提交++
        统计.重跑 += 重跑
        统计.组件总数 = 组件
      }
    },
  }
}

type 一次测量 = Record<string, unknown>

async function 量一轮回复(page: Page, 模式: "重画" | "时间", cpu降速: number): Promise<一次测量> {
  const 历史 = await 已完成回复数(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu降速 })

  await page.evaluate((模式) => {
    const w = window as unknown as Record<string, unknown>
    if (模式 === "重画") {
      const s = w["__重画"] as { 在量: boolean; 提交: number; 重跑: number; 按名字: Record<string, number> }
      Object.assign(s, { 在量: true, 提交: 0, 重跑: 0, 按名字: {} })
      return
    }
    const p = { 长任务: [] as number[], 帧: [] as number[], 停: false, 起: performance.now() }
    w["__时间"] = p
    const ob = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) p.长任务.push(e.duration)
    })
    ob.observe({ type: "longtask" })
    w["__时间观察"] = ob
    let 上 = performance.now()
    const 一帧 = (t: number) => {
      p.帧.push(t - 上)
      上 = t
      if (!p.停) requestAnimationFrame(一帧)
    }
    requestAnimationFrame(一帧)
  }, 模式)

  const t0 = Date.now()
  await 说一句并等完(page, `慢慢说 长回复 第${历史 + 1}轮`, 历史)
  const 墙钟 = Date.now() - t0

  const 原始 = await page.evaluate((模式) => {
    const w = window as unknown as Record<string, unknown>
    if (模式 === "重画") {
      const s = w["__重画"] as { 在量: boolean; 提交: number; 重跑: number; 组件总数: number; 按名字: Record<string, number> }
      s.在量 = false
      return { ...s, 按名字: { ...s.按名字 } }
    }
    const p = w["__时间"] as { 长任务: number[]; 帧: number[]; 停: boolean }
    p.停 = true
    ;(w["__时间观察"] as PerformanceObserver).disconnect()
    return { 长任务: p.长任务, 帧: p.帧 }
  }, 模式)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  await cdp.detach()

  const 基本 = { 历史轮数: 历史, cpu降速: `${cpu降速}x`, 墙钟毫秒: 墙钟 }
  if (模式 === "重画") {
    const r = 原始 as { 提交: number; 重跑: number; 组件总数: number; 按名字: Record<string, number> }
    const 前几 = Object.entries(r.按名字).sort((a, b) => b[1] - a[1]).slice(0, 12)
    return {
      ...基本,
      提交次数: r.提交,
      组件总数: r.组件总数,
      每次提交平均重跑: r.提交 ? Math.round(r.重跑 / r.提交) : 0,
      重跑总数: r.重跑,
      重跑最多的组件: Object.fromEntries(前几),
    }
  }
  const r = 原始 as { 长任务: number[]; 帧: number[] }
  const 帧 = [...r.帧].sort((a, b) => a - b)
  const 分位 = (q: number) => Math.round(帧[Math.min(帧.length - 1, Math.floor(帧.length * q))] ?? 0)
  const 长 = r.长任务
  return {
    ...基本,
    长任务数: 长.length,
    长任务总毫秒: Math.round(长.reduce((a, b) => a + b, 0)),
    最长任务毫秒: Math.round(Math.max(0, ...长)),
    主线程被占比例: `${Math.round((长.reduce((a, b) => a + b, 0) / 墙钟) * 100)}%`,
    帧数: 帧.length,
    帧间隔p50: 分位(0.5),
    帧间隔p95: 分位(0.95),
    帧间隔最大: Math.round(帧.at(-1) ?? 0),
    卡帧数_超50ms: 帧.filter((x) => x > 50).length,
  }
}

async function 跑剧本(page: Page, 模式: "重画" | "时间"): Promise<一次测量[]> {
  await 开一段临时会话(page)
  await 等进了对话(page)
  const 结果: 一次测量[] = []
  结果.push(await 量一轮回复(page, 模式, 1))
  // 对照：没有历史时降速 4 倍是什么样——分清「降速本身的代价」与「历史越长越卡」
  结果.push(await 量一轮回复(page, 模式, 4))
  await 攒历史到(page, 10)
  结果.push(await 量一轮回复(page, 模式, 1))
  结果.push(await 量一轮回复(page, 模式, 4))
  await 攒历史到(page, 30)
  结果.push(await 量一轮回复(page, 模式, 1))
  结果.push(await 量一轮回复(page, 模式, 4))
  return 结果
}

function 记下(名: string, 结果: 一次测量[]): void {
  // 不放 `test-results/`：Playwright 每跑一次就清空它，上一轮的数字会没
  const 目录 = "perf-results"
  mkdirSync(目录, { recursive: true })
  const 标签 = process.env["PERF_LABEL"] ?? "当前"
  writeFileSync(join(目录, `${标签}-${名}.json`), JSON.stringify(结果, null, 2))
  console.log(`\n==== ${标签} · ${名} ====`)
  console.log(JSON.stringify(结果, null, 2))
}

test.describe.configure({ mode: "serial" })

test("回复时的重画次数", async ({ dawn }) => {
  const { page } = dawn
  await page.addInitScript(装重画计数)
  // `开一段临时会话` 里会 reload——钩子在那之后、React 加载之前就位
  const 结果 = await 跑剧本(page, "重画")
  const 钩子接上了 = await page.evaluate(() => (window as unknown as { __重画?: { 组件总数: number } }).__重画?.组件总数 ?? 0)
  if (!钩子接上了) throw new Error("React 没有接上假 DevTools 钩子——重画数全是 0，不能当数据用")
  记下("重画", 结果)
})

test("回复时的卡顿（时间）", async ({ dawn }) => {
  const 结果 = await 跑剧本(dawn.page, "时间")
  记下("时间", 结果)
})
