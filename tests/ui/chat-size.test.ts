import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { $chatSize, CHAT_SIZE_KEY, loadChatSize, setChatSize } from "../../src/ui/state/chat-size.js"

beforeEach(() => {
  localStorage.removeItem(CHAT_SIZE_KEY)
  document.documentElement.style.removeProperty("--dawn-chat-size")
  $chatSize.set(15)
})
afterEach(() => document.documentElement.style.removeProperty("--dawn-chat-size"))

describe("对话字号偏好", () => {
  it("初始正文更舒展，已有的 15px 偏好继续保留", () => {
    expect(loadChatSize()).toBe(17)
    localStorage.setItem(CHAT_SIZE_KEY, "15")
    expect(loadChatSize()).toBe(15)
    expect($chatSize.get()).toBe(15)
  })

  it("切换时同步更新状态、根令牌与本地存储", () => {
    setChatSize(19)
    expect($chatSize.get()).toBe(19)
    expect(document.documentElement.style.getPropertyValue("--dawn-chat-size")).toBe("19px")
    expect(localStorage.getItem(CHAT_SIZE_KEY)).toBe("19")
  })

  it("启动时还原已保存值，并拒绝范围外的旧值", () => {
    localStorage.setItem(CHAT_SIZE_KEY, "18")
    expect(loadChatSize()).toBe(18)
    expect(document.documentElement.style.getPropertyValue("--dawn-chat-size")).toBe("18px")

    localStorage.setItem(CHAT_SIZE_KEY, "25")
    expect(loadChatSize()).toBe(17)
    expect(document.documentElement.style.getPropertyValue("--dawn-chat-size")).toBe("17px")
  })
})
