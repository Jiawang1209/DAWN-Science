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
  RIGHT_DOCK_两栏起点,
  clampDockWidth,
  loadRightDock,
  坞的上界,
  setRightDockTenant,
  setRightDockWidth,
  点开房客,
} from "../../src/ui/state/right-dock.js"

beforeEach(() => {
  /**
   * **给一个放得下的窗口**（2026-08-19）。
   *
   * jsdom 默认 `innerWidth` 是 1024，而坞的上界跟着窗口走
   * （`1024 - 侧栏 - 对话那一列` = 404）。不设的话，
   * 下面那几条验「记住宽度」「存不下也照样生效」的用例会被夹到 404，
   * **红在一个与它们要验的事情无关的理由上**。
   * 窗口宽度本身由 `坞的上界` 那一组用例专门验。
   */
  Object.defineProperty(window, "innerWidth", { value: 1600, configurable: true, writable: true })
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

/**
 * **坞不许被拉出窗口**（2026-08-19 修的一个既有缺陷）。
 *
 * `RIGHT_DOCK_MAX = 720` 这个数是对着足够宽的窗口说的。窗口只有 1280 时，
 * `.body` 那个网格的第三列照样吃 720px——量到过的：坞的盒子 `x=684, w=720`，
 * 右边界 1404，**超出 124px**，靠右那一栏（文件树）整个看不见。
 * 而屏幕上没有任何东西说这件事发生了：**它长得就像「树没渲染出来」**。
 */
describe("**坞的上界跟着窗口走**", () => {
  it("窗口够宽时就是 `RIGHT_DOCK_MAX`", () => {
    expect(坞的上界(1920, 264)).toBe(RIGHT_DOCK_MAX)
  })

  it("窗口不够宽时，让给侧栏与对话那两列", () => {
    // 1280 - 264（侧栏此刻真实宽度）- 420（对话那一列的承诺）
    expect(坞的上界(1280, 264)).toBe(596)
  })

  /**
   * **侧栏要用它此刻真正的宽度**。第一版拿 `SIDEBAR_MIN`（200）去算，
   * 而侧栏默认 264——上界多给了 64px，坞照样越界，只是越得少一点。
   * **算错的边界比没有边界更难发现**：它在某些宽度下看起来是对的。
   */
  it("侧栏更宽，上界就更小——不是拿 200 去算", () => {
    expect(坞的上界(1280, 320)).toBeLessThan(坞的上界(1280, 264))
  })

  /** 侧栏收起来时它真的是 0，那 264 就该还给坞 */
  it("侧栏收起来，那点宽度还给坞", () => {
    expect(坞的上界(1280, 0)).toBe(RIGHT_DOCK_MAX)
  })

  /**
   * **窄到放不下时不把坞压成一条缝**：那时它与「关掉」长得一模一样。
   * 越界那一头由 `.body` 的 `minmax(0, …)` 兜着。
   */
  it("窗口窄到离谱时，下界仍然是 `RIGHT_DOCK_MIN`", () => {
    expect(坞的上界(700, 264)).toBe(RIGHT_DOCK_MIN)
  })

  it("拖拽会被这个上界夹住", () => {
    setRightDockWidth(RIGHT_DOCK_MAX, 264)
    expect($rightDockWidth.get()).toBeLessThanOrEqual(坞的上界(undefined, 264))
  })

  /**
   * **读回来的那条不夹**（2026-08-19 定的）。存下来的是「这个人喜欢多宽」，
   * 而窗口小是此刻的事。启动时按小窗口把 720 改写成 404 并留在内存里，
   * 等于趁人不注意把他的偏好改了——他后来拖大窗口也回不去。
   */
  it("**启动读回来的偏好不被窗口改写**", () => {
    localStorage.setItem(RIGHT_DOCK_WIDTH_KEY, String(RIGHT_DOCK_MAX))
    expect(loadRightDock().width).toBe(RIGHT_DOCK_MAX)
  })

  /** 两栏起点要落在量程里，否则它要么永远够不到、要么永远成立 */
  it("两栏起点落在 `[MIN, MAX]` 之间", () => {
    expect(RIGHT_DOCK_两栏起点).toBeGreaterThan(RIGHT_DOCK_MIN)
    expect(RIGHT_DOCK_两栏起点).toBeLessThan(RIGHT_DOCK_MAX)
  })
})
