/**
 * 右侧坞的状态（`feat/远端文件` · 批 1，2026-08-17）。
 *
 * 这一层只有三件事值得钉：**夹边界**、**存过但读不懂要出声**、
 * **同一个房客按第二下要收起来**。三件都栽过或差点栽过。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  $rightDockOpen,
  $rightDockTenant,
  $rightDockWidth,
  RIGHT_DOCK_DEFAULT,
  RIGHT_DOCK_MAX,
  RIGHT_DOCK_MIN,
  RIGHT_DOCK_TENANT_KEY,
  RIGHT_DOCK_WIDTH_KEY,
  clampDockWidth,
  loadRightDock,
  setRightDockTenant,
  setRightDockWidth,
  点开房客,
} from "../../src/ui/state/right-dock.js"

beforeEach(() => {
  localStorage.clear()
  $rightDockOpen.set(false)
  $rightDockTenant.set("files")
  $rightDockWidth.set(RIGHT_DOCK_DEFAULT)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("宽度", () => {
  /**
   * **夹边界不是礼貌，是判据。** 拖出界之后坞能压到 0 宽，
   * 那时它与「关掉」长得一模一样，而把手跟着宽度走——人再也拖不回来。
   */
  it("拖出界要夹回来", () => {
    expect(clampDockWidth(10)).toBe(RIGHT_DOCK_MIN)
    expect(clampDockWidth(9999)).toBe(RIGHT_DOCK_MAX)
    expect(clampDockWidth(400)).toBe(400)
  })

  /** 非数一律回默认，**不静默留成 NaN**——NaN 宽度在样式上是「没有宽度」 */
  it("算出 NaN 时回到默认，不留 NaN", () => {
    expect(clampDockWidth(Number.NaN)).toBe(RIGHT_DOCK_DEFAULT)
    expect(clampDockWidth(Number.POSITIVE_INFINITY)).toBe(RIGHT_DOCK_DEFAULT)
  })

  it("设了就记住", () => {
    setRightDockWidth(420)
    expect(localStorage.getItem(RIGHT_DOCK_WIDTH_KEY)).toBe("420")
  })

  /**
   * **先生效，再尝试记住。** 存储写不进去（配额满、隐私模式）
   * 不该连这次拖拽都不给拖。
   */
  it("存储坏了，这一次拖动照样生效", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("配额满了")
    })
    vi.spyOn(console, "error").mockImplementation(() => {})
    setRightDockWidth(500)
    expect($rightDockWidth.get(), "存不下就连生效都不给，那是把两件事绑死了").toBe(500)
  })
})

describe("读回来", () => {
  it("没存过就是默认——**缺失不等于某个具体值**", () => {
    const r = loadRightDock()
    expect(r).toEqual({ tenant: "files", width: RIGHT_DOCK_DEFAULT })
  })

  it("存过的宽度也要夹一遍（存储里可能是上一版的上界）", () => {
    localStorage.setItem(RIGHT_DOCK_WIDTH_KEY, "5000")
    expect(loadRightDock().width).toBe(RIGHT_DOCK_MAX)
  })

  /**
   * **存过但读不懂要出声。** 静默回落会把「我明明拖宽过」
   * 变成一个查不出来的怪事。
   */
  it("认不出的面板名要报出来，并回落", () => {
    const 喊 = vi.spyOn(console, "error").mockImplementation(() => {})
    localStorage.setItem(RIGHT_DOCK_TENANT_KEY, "browser")
    expect(loadRightDock().tenant).toBe("files")
    expect(喊, "认不出的值被静默吞掉了").toHaveBeenCalled()
  })

  it("认不出的宽度要报出来，并回落", () => {
    const 喊 = vi.spyOn(console, "error").mockImplementation(() => {})
    localStorage.setItem(RIGHT_DOCK_WIDTH_KEY, "很宽")
    expect(loadRightDock().width).toBe(RIGHT_DOCK_DEFAULT)
    expect(喊).toHaveBeenCalled()
  })

  it("存过的面板名读得回来", () => {
    setRightDockTenant("review")
    expect(loadRightDock().tenant).toBe("review")
  })
})

describe("点房客", () => {
  it("没开就开，并切到它", () => {
    点开房客("review")
    expect($rightDockOpen.get()).toBe(true)
    expect($rightDockTenant.get()).toBe("review")
  })

  /**
   * **按第二下要收起来。** 写成「一律打开」的话，同一个快捷键按两次不会关，
   * 而人对切换键的预期就是能关。
   */
  it("开着且已经是它，再点一下收起来", () => {
    点开房客("files")
    点开房客("files")
    expect($rightDockOpen.get()).toBe(false)
  })

  /** 开着但是**别的**房客时，是切过去，不是关掉 */
  it("开着别的房客时，点一下是切过去而不是关掉", () => {
    点开房客("files")
    点开房客("review")
    expect($rightDockOpen.get(), "切换房客却把坞关了").toBe(true)
    expect($rightDockTenant.get()).toBe("review")
  })

  /** 关掉不该把「上次看的是谁」也忘掉——重开时要回到那一个 */
  it("收起来之后，房客还记得是谁", () => {
    点开房客("review")
    点开房客("review")
    expect($rightDockTenant.get()).toBe("review")
  })
})
