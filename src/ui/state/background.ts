/** 外层、对话与设置背景：独立保存，共用明暗派生和颜色校验。 */
import { atom } from "nanostores"
import { isHex, 相对亮度 } from "./accent.js"
import { setValue } from "./identity.js"

export const BACKGROUND_STORAGE_KEY = "dawn.global.background"
export const DEFAULT_BACKGROUND = "#f6f6f3"
export const DEFAULT_CONTENT_BACKGROUND = "#ffffff"

function blend(hex: string, target: number, amount: number): string {
  return "#" + [1, 3, 5].map(i => {
    const value = parseInt(hex.slice(i, i + 2), 16)
    return Math.round(value + (target - value) * amount).toString(16).padStart(2, "0")
  }).join("")
}

/** 同一色相分别用于明暗外观；足够浅/深的自选色直接保留。 */
export function backgroundVariants(hex: string): { light: string; dark: string } {
  const luminance = 相对亮度(hex)
  return {
    light: luminance >= 0.6 ? hex : blend(hex, 255, 0.85),
    dark: luminance <= 0.045 ? hex : blend(hex, 0, 0.82),
  }
}

function createBackgroundPreference(storageKey: string, variables: readonly [string, string], attribute: string) {
  const store = atom<string | null>(null)
  const apply = (hex: string | null, el: HTMLElement = document.documentElement): void => {
    if (hex === null) {
      for (const key of variables) el.style.removeProperty(key)
      el.removeAttribute(attribute)
      return
    }
    const { light, dark } = backgroundVariants(hex)
    el.style.setProperty(variables[0], light)
    el.style.setProperty(variables[1], dark)
    el.setAttribute(attribute, "custom")
  }
  const set = (hex: string | null): void => {
    if (hex !== null && !isHex(hex)) {
      console.error("[background] 无法识别背景颜色，忽略：", storageKey, hex)
      return
    }
    const value = hex?.toLowerCase() ?? null
    setValue(store, value)
    apply(value)
    try {
      if (value === null) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, value)
    } catch (error) {
      console.error("[background] 无法保存背景色，本次切换仍然生效，但重启后不会被记住：", storageKey, error)
    }
  }
  const load = (): string | null => {
    let value: string | null = null
    try {
      const stored = localStorage.getItem(storageKey)
      if (isHex(stored)) value = stored.toLowerCase()
      else if (stored !== null) console.error("[background] 存储里的背景色无法识别，回落默认：", storageKey, stored)
    } catch (error) {
      console.error("[background] 无法读取已保存的背景色，回落默认：", storageKey, error)
    }
    store.set(value)
    apply(value)
    return value
  }
  return { storageKey, store, apply, set, load }
}

const shellBackground = createBackgroundPreference(BACKGROUND_STORAGE_KEY,
  ["--theme-user-background-light", "--theme-user-background-dark"], "data-background")
export const $background = shellBackground.store
export const applyBackground = shellBackground.apply
export const setBackground = shellBackground.set
export const loadBackground = shellBackground.load

export const chatBackground = createBackgroundPreference("dawn.global.chatBackground",
  ["--theme-user-chat-background-light", "--theme-user-chat-background-dark"], "data-chat-background")
export const settingsBackground = createBackgroundPreference("dawn.global.settingsBackground",
  ["--theme-user-settings-background-light", "--theme-user-settings-background-dark"], "data-settings-background")
