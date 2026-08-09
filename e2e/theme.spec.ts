/**
 * 主题（①-B″ · V2）。**跑真实构建产物。**
 *
 * 单元测试证明的是「类名开关是对的」。它证明不了这几样，而这几样才是用户遇到的：
 *   - `tokens.css` 有没有真的被打进产物
 *   - `.dawn-dark` 有没有真的改变屏幕上的像素
 *   - 重启之后选择还在不在
 *   - **实心按钮上的字读不读得清**
 *
 * 最后一条是这一版差点漏掉的：`--dawn-accent-solid` 造出来是为了让白字达标，
 * 然后 `.btn-primary` 仍然在用 `--dawn-accent`——**令牌建好了，调用点没接**。
 * 那正是本项目栽过七次的形态，所以它现在有一条常驻断言。
 */
import { test, expect } from "./fixtures.js"
import type { Page } from "@playwright/test"

/**
 * 解析 `getComputedStyle` 吐出来的颜色。
 *
 * Chromium 对 `color-mix()` 的结果会返回 `color(srgb r g b / a)`（分量 0–1），
 * 对普通颜色返回 `rgb(r, g, b)`（分量 0–255）。**两种都要认**——
 * 只认一种的话，换个令牌写法这条测试就会静默失效。
 */
function parseColor(s: string): { rgb: [number, number, number]; alpha: number } {
  const nums = s.match(/[\d.]+/g)?.map(Number) ?? []
  if (s.startsWith("color(")) {
    return { rgb: [nums[0]! * 255, nums[1]! * 255, nums[2]! * 255], alpha: nums[3] ?? 1 }
  }
  return { rgb: [nums[0]!, nums[1]!, nums[2]!], alpha: nums[3] ?? 1 }
}

/** WCAG 相对亮度 */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

async function styleOf(page: Page, sel: string) {
  return page.locator(sel).first().evaluate((el) => {
    const s = getComputedStyle(el)
    return { bg: s.backgroundColor, fg: s.color }
  })
}

async function switchTo(page: Page, label: string) {
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("radio", { name: label }).click()
  // 越过 100ms 的背景过渡，否则量到的是动画中间帧
  await page.waitForTimeout(200)
}

test("默认跟随系统，且系统是亮的时候界面就是亮的", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator("html.dawn-light")).toHaveCount(1)
  const { rgb } = parseColor((await styleOf(page, "body")).bg)
  expect(luminance(rgb), "亮色下应用底应当是浅的").toBeGreaterThan(0.8)
})

test("**能强制暗色** —— 这是这个 Task 存在的全部理由", async ({ dawn }) => {
  const { page } = dawn
  await switchTo(page, "暗色")
  await expect(page.locator("html.dawn-dark")).toHaveCount(1)
  const { rgb } = parseColor((await styleOf(page, "body")).bg)
  expect(luminance(rgb), "暗色下应用底应当是深的").toBeLessThan(0.05)
})

test("暗色下侧栏比内容区更深 —— 层次靠的是这个，不是装饰", async ({ dawn }) => {
  const { page } = dawn
  await switchTo(page, "暗色")
  const body = parseColor((await styleOf(page, "body")).bg)
  const side = parseColor((await styleOf(page, ".sidebar")).bg)
  expect(luminance(side.rgb)).toBeLessThan(luminance(body.rgb))
})

test("选择被记住 —— 重载之后还是暗色", async ({ dawn }) => {
  const { page } = dawn
  await switchTo(page, "暗色")
  const before = (await styleOf(page, "body")).bg
  await page.reload()
  await expect(page.locator("html.dawn-dark")).toHaveCount(1)
  expect((await styleOf(page, "body")).bg).toBe(before)
})

test("**userData 是隔离的** —— 上一个用例存的暗色不该漏过来", async ({ dawn }) => {
  // 这条守的是夹具本身。2026-08-09 之前 userData 用的是开发机上真实那一份，
  // 用例之间有暗管道，跑一次 e2e 还会改掉作者自己应用里的设置
  await expect(dawn.page.locator("html.dawn-light")).toHaveCount(1)
})

for (const theme of ["亮色", "暗色"]) {
  test(`${theme}下实心主按钮的文字达到 WCAG AA（4.5:1）`, async ({ dawn }) => {
    const { page } = dawn
    await switchTo(page, theme)
    // 设置页里的「保存」就是一个 btn-primary
    const { bg, fg } = await styleOf(page, ".btn-primary")
    const b = parseColor(bg)
    const f = parseColor(fg)
    expect(b.alpha, "实心按钮的底必须是不透明的，否则对比度无从谈起").toBe(1)
    const ratio = contrast(b.rgb, f.rgb)
    expect(
      ratio,
      `${theme}：主按钮 ${bg} 上的 ${fg} 只有 ${ratio.toFixed(2)}:1。用 --dawn-accent-solid`,
    ).toBeGreaterThanOrEqual(4.5)
  })
}

/**
 * **2026-08-09 由一张截图撞出来的生产缺陷。**
 *
 * composer 的 textarea 此前 `className` 是空的，样式来自 `.composer textarea`
 * ——那条规则是 `.control` 七条属性的逐字复制。抄到了长相，漏掉了行为：
 * `:focus-visible` 的聚焦环只挂在 `.control` 上。
 *
 * 于是全应用最主要的输入框用的是 **Chromium 默认聚焦环，取操作系统强调色**，
 * 与主题无关。在琥珀色系统上它看着像警告态。
 *
 * jsdom 验不了这个——它没有真实的 `:focus-visible` 与 outline 计算。
 */
test("主输入框的聚焦环用的是主题强调色，不是系统色", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: /新建会话/ }).click()
  const ta = page.locator(".composer textarea")
  await ta.click()

  const s = await ta.evaluate((el) => {
    const c = getComputedStyle(el)
    // **让浏览器自己把令牌解析成 rgb**。令牌原文可能是 `#10a37f`、`color-mix(...)`、
    // 或将来别的写法——自己解析等于把 CSS 的颜色语法在测试里重实现一遍
    const probe = document.createElement("span")
    probe.style.color = "var(--dawn-accent)"
    document.body.appendChild(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    return { outline: c.outlineColor, style: c.outlineStyle, accent }
  })
  // `auto` 是 Chromium 的默认环 —— 它取**操作系统**强调色，不受我们控制
  expect(s.style, "聚焦环必须由我们指定，不能是 Chromium 默认的 auto").not.toBe("auto")
  expect(s.outline, `聚焦环应当等于强调色 ${s.accent}`).toBe(s.accent)
})
