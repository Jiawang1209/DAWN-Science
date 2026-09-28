/**
 * 侧栏各组的收起 / 展开要跨重启活着（2026-09-28 作者要的）。
 *
 * 作者：每次打开，「服务器」那组连同机器都是摊开的——收起来，重开又弹开。
 * 定案：*「记住你的收起 / 展开状态，服务器下的机器默认也按照状态进行」*——**只加记忆，不改默认值**。
 *
 * 两份状态各一个 key（它们本来就是组件里的两份 state）：
 *   - 收起的组与机器（「最近」「项目」「服务器」「会话」、各台机器的 connectionId）
 *   - 项目文件夹的手动展开 / 收起（路径 → 布尔；没记的仍走「当前会话所在的自动展开」）
 * key 里写 `global`：它们不属于某段会话，是这个人怎么摆侧栏（与侧栏宽度同一类）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  SIDEBAR_FOLDED_KEY,
  SIDEBAR_PROJECTS_OPEN_KEY,
  读收起的组,
  记收起的组,
  读项目展开,
  记项目展开,
} from "../../src/ui/state/sidebar.js"

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe("收起的组与机器", () => {
  it("**没存过就是默认值**：只有「最近」收着（机器、服务器、项目、会话都摊开）", () => {
    expect([...读收起的组()]).toEqual(["最近"])
  })

  it("存下再读回：收起的机器重开仍收着", () => {
    记收起的组(new Set(["服务器", "conn-gs191"]))
    expect(JSON.parse(localStorage.getItem(SIDEBAR_FOLDED_KEY)!)).toEqual(["服务器", "conn-gs191"])
    expect(new Set(读收起的组())).toEqual(new Set(["服务器", "conn-gs191"]))
  })

  it("**展开过「最近」也记得**：存下的是空集就是空集，不回到默认", () => {
    记收起的组(new Set())
    expect([...读收起的组()]).toEqual([])
  })

  it("存储里是垃圾：出声，回到默认", () => {
    const 吵 = vi.spyOn(console, "error").mockImplementation(() => {})
    localStorage.setItem(SIDEBAR_FOLDED_KEY, "{不是数组")
    expect([...读收起的组()]).toEqual(["最近"])
    localStorage.setItem(SIDEBAR_FOLDED_KEY, JSON.stringify([1, 2]))
    expect([...读收起的组()]).toEqual(["最近"])
    expect(吵).toHaveBeenCalledTimes(2)
  })

  it("写不进去：出声、不抛", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    const 吵 = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => 记收起的组(new Set(["服务器"]))).not.toThrow()
    expect(吵).toHaveBeenCalled()
  })
})

describe("项目文件夹的展开", () => {
  it("没存过：空的（全走「当前会话所在的自动展开」）", () => {
    expect(读项目展开().size).toBe(0)
  })

  it("存下再读回：开的与明确收起的都记得", () => {
    记项目展开(new Map([["/a/tmp", true], ["/b/test", false]]))
    expect(JSON.parse(localStorage.getItem(SIDEBAR_PROJECTS_OPEN_KEY)!)).toEqual({ "/a/tmp": true, "/b/test": false })
    expect(读项目展开()).toEqual(new Map([["/a/tmp", true], ["/b/test", false]]))
  })

  it("存储里是垃圾：出声，回到空的；混进非布尔的那一条丢掉", () => {
    const 吵 = vi.spyOn(console, "error").mockImplementation(() => {})
    localStorage.setItem(SIDEBAR_PROJECTS_OPEN_KEY, "[1]")
    expect(读项目展开().size).toBe(0)
    localStorage.setItem(SIDEBAR_PROJECTS_OPEN_KEY, JSON.stringify({ "/a": true, "/b": "yes" }))
    expect(读项目展开()).toEqual(new Map([["/a", true]]))
    expect(吵).toHaveBeenCalledTimes(2)
  })
})
