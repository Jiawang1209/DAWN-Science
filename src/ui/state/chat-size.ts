import { atom } from "nanostores"

export type ChatSize = 13 | 14 | 15 | 16 | 17 | 18 | 19
export const CHAT_SIZE_KEY = "dawn.global.chat-font-size"
export const DEFAULT_CHAT_SIZE: ChatSize = 15
export const $chatSize = atom<ChatSize>(DEFAULT_CHAT_SIZE)

function 是字号(value: number): value is ChatSize {
  return Number.isInteger(value) && value >= 13 && value <= 19
}

function 应用字号(value: ChatSize): void {
  document.documentElement.style.setProperty("--dawn-chat-size", `${value}px`)
}

export function setChatSize(value: number): void {
  if (!是字号(value)) {
    console.error(`[chat-size] 对话字号超出 13–19 范围：${value}`)
    return
  }
  $chatSize.set(value)
  应用字号(value)
  try {
    localStorage.setItem(CHAT_SIZE_KEY, String(value))
  } catch (error) {
    console.error("[chat-size] 无法保存对话字号，本次切换仍然生效：", error)
  }
}

export function loadChatSize(): ChatSize {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(CHAT_SIZE_KEY)
  } catch (error) {
    console.error("[chat-size] 无法读取对话字号，使用默认 15px：", error)
  }

  let size = DEFAULT_CHAT_SIZE
  if (saved !== null) {
    const parsed = Number(saved)
    if (是字号(parsed)) size = parsed
    else console.error(`[chat-size] 存储的对话字号无法识别：${JSON.stringify(saved)}，使用默认 15px`)
  }

  $chatSize.set(size)
  应用字号(size)
  return size
}
