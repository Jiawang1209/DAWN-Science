/**
 * 主题色（2026-08-23 作者要的：*「在外观的地方设置一个颜色选择器，一键改为其他颜色」*）。
 *
 * **只动一个种子**：整张样式表里的强调色全从 `--theme-accent` 派生（设计契约守着「无裸色值」），
 * 所以换色 = 把四个 `--theme-user-accent*` 写到 `<html>` 的行内样式上，其余由 `tokens.css` 的 `color-mix` 算。
 *
 * **亮 / 暗各一个**：同一个色在暗底上要提亮一档才不沉进背景（绿的就是 #10a37f → #19c37d），
 * 人只选一次，暗色那一支由 `暗色变体` 算。**按钮上的字**由 `按钮字色` 按亮度判：浅色主题色配白字读不出来。
 *
 * **活着跟着它，对错不跟**：`--dawn-live` 派生自主题色；`--dawn-success` / `--dawn-danger` 仍是固定的红绿。
 *
 * 与 `theme.ts` 同一条顺序：先生效，再尝试记住。作用域是「这台机器上这个人」——不跟项目走。
 */
import { atom } from "nanostores"
import { setValue } from "./identity.js"

export const ACCENT_STORAGE_KEY = "dawn.global.accent"

/** 默认绿：与 tokens.css 里写的那一对一致，是**同一个数的两个家**——这里的单元测试读 tokens.css 对它 */
export const DEFAULT_ACCENT = "#10a37f"

/** 预置色：名字给人看，值给 CSS。深浅都挑成「白字压得住」的一档 */
export const ACCENT_PRESETS: readonly { name: string; hex: string }[] = [
  { name: "绿", hex: DEFAULT_ACCENT },
  { name: "蓝", hex: "#2f6feb" },
  { name: "紫", hex: "#7c5cff" },
  { name: "橙", hex: "#e0701a" },
  { name: "粉", hex: "#d6336c" },
  { name: "灰", hex: "#5d5d5d" },
]

export const $accent = atom<string>(DEFAULT_ACCENT)

const HEX = /^#[0-9a-f]{6}$/i

export function isHex(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v)
}

function toRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")
  return `#${c(r)}${c(g)}${c(b)}`
}

/** `#10a37f` → `rgb(16, 163, 127)`：取色器旁边那一格给人看、也给人改（2026-08-23 作者要的） */
export function hex转三元组(hex: string): string {
  const [r, g, b] = toRgb(hex)
  return `rgb(${r}, ${g}, ${b})`
}

/** 收 `rgb(16, 163, 127)` / `16,163,127` / `16 163 127`；不合法或超 255 → undefined */
export function 三元组转hex(text: string): string | undefined {
  const m = /^\s*(?:rgba?\(\s*)?(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)?\s*$/i.exec(text)
  if (!m) return undefined
  const v = [m[1], m[2], m[3]].map(Number)
  if (v.some((n) => n > 255)) return undefined
  return toHex(v[0]!, v[1]!, v[2]!)
}

/** WCAG 相对亮度（0 黑 … 1 白） */
export function 相对亮度(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * 暗底上用的那一支：往白兑 14%。
 * 绿的算出来是 #32ac90，与手调的 #19c37d 同一档亮度——够用，且对任何色相都成立。
 */
export function 暗色变体(hex: string): string {
  const [r, g, b] = toRgb(hex)
  const k = 0.14
  return toHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k)
}

/** 按钮上的字：主题色够深就用白字，否则用深字。阈值 0.4 是「白字对比 ≥ 3:1」的那条线附近 */
export function 按钮字色(hex: string): string {
  return 相对亮度(hex) > 0.4 ? "#0d0d0d" : "#ffffff"
}

const 变量们 = ["--theme-user-accent", "--theme-user-accent-dark", "--theme-user-on-accent", "--theme-user-on-accent-dark"] as const

export function applyAccent(hex: string, el: HTMLElement = document.documentElement): void {
  // **默认绿不写行内样式**：tokens.css 里那对手调的值（暗色 #19c37d）比算出来的准，视觉基线也按它存的
  if (hex === DEFAULT_ACCENT) {
    for (const k of 变量们) el.style.removeProperty(k)
    return
  }
  const 暗 = 暗色变体(hex)
  el.style.setProperty("--theme-user-accent", hex)
  el.style.setProperty("--theme-user-accent-dark", 暗)
  el.style.setProperty("--theme-user-on-accent", 按钮字色(hex))
  el.style.setProperty("--theme-user-on-accent-dark", 按钮字色(暗))
}

export function setAccent(hex: string): void {
  if (!isHex(hex)) {
    console.error(`[accent] 不是一个六位十六进制颜色：${JSON.stringify(hex)}，忽略`)
    return
  }
  const v = hex.toLowerCase()
  setValue($accent, v)
  applyAccent(v)
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, v)
  } catch (e) {
    console.error("[accent] 无法保存主题色，本次切换仍然生效，但重启后不会被记住：", e)
  }
}

export function loadAccent(): string {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(ACCENT_STORAGE_KEY)
  } catch (e) {
    console.error("[accent] 无法读取已保存的主题色，回落到默认：", e)
  }
  let v = DEFAULT_ACCENT
  if (isHex(stored)) v = stored.toLowerCase()
  else if (stored !== null) console.error(`[accent] 存储里的主题色无法识别：${JSON.stringify(stored)}，回落到默认`)
  $accent.set(v)
  applyAccent(v)
  return v
}
