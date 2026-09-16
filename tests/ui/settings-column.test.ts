/**
 * 右边那一列的一条规则（规格 `2026-09-16-设置右栏`）：
 *
 * > **设置活着的时候，右边那一列归设置；设置一关，上一位房客回来。**
 *
 * 作者原话：*「如果右边有面板的话，那么恢复之后是有面板的；
 * 如果右边没有面板的话，那么恢复之后就没面板。」*
 *
 * ## Round 2（code review：CHANGES REQUESTED，两个 Critical）
 *
 * C1：`开设置栏` 此前在**每一次**调用时都重记「被顶掉的是谁」——命令面板跳分类
 * 走的正是 `开设置栏(section)` 这条路（Task 6 接线之后），第二次调用会把第一次
 * 记下的坞房客覆盖成 `undefined`，坞从此回不来。
 *
 * C2：`开设置栏` 此前完全不管 `$view`——从整页直接开窄栏会让两种形状同屏，
 * 而不是整页让位给窄栏。
 *
 * 下面补的用例先红后绿：`beforeEach` 补上 `$被顶掉的房客` 的重置（此前两条
 * mutation 能存活正是因为用例之间在借上一条留下的状态），新增的用例分别钉死
 * C1、C2，以及「关掉设置读的是记忆、不是坞此刻的值」与 `坞上位()`。
 */
import { beforeEach, describe, expect, it } from "vitest"
import { $view, $settingsSection } from "../../src/ui/state/view.js"
import { $rightDockOpen, $rightDockTenant, setRightDockOpen, setRightDockTenant } from "../../src/ui/state/right-dock.js"
import {
  $settingsColumnOpen,
  $被顶掉的房客,
  $设置在场,
  关掉设置,
  开设置栏,
  展开设置,
  收起设置,
  坞上位,
} from "../../src/ui/state/settings-column.js"

beforeEach(() => {
  localStorage.clear()
  $view.set("conversation")
  $rightDockOpen.set(false)
  $rightDockTenant.set("files")
  $settingsColumnOpen.set(false)
  $settingsSection.set(undefined)
  // **此前没重置这个，两条 mutation 能存活正是因为借了上一条用例留下的记忆**
  $被顶掉的房客.set(undefined)
})

describe("设置栏与坞互斥", () => {
  it("坞开着 → 开设置 → 坞让位", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    开设置栏()
    expect($settingsColumnOpen.get()).toBe(true)
    expect($rightDockOpen.get()).toBe(false)
  })

  it("**关掉设置，被顶掉的那一位自己回来**", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    开设置栏()
    关掉设置()
    expect($settingsColumnOpen.get()).toBe(false)
    expect($rightDockOpen.get()).toBe(true)
    expect($rightDockTenant.get()).toBe("notebook")
  })

  it("**来时右边空的，走时右边就空的**——不是「关掉设置就给你开个面板」", () => {
    开设置栏()
    关掉设置()
    expect($rightDockOpen.get()).toBe(false)
  })

  it("开设置栏可以直接钻进某一项（命令面板那条路）", () => {
    开设置栏("mcp")
    expect($settingsSection.get()).toBe("mcp")
    expect($settingsColumnOpen.get()).toBe(true)
  })

  it("**关掉设置读的是被顶掉那一刻记下的房客，不是坞此刻挂着谁**（钉死 mutant：删掉 setRightDockTenant 也全绿）", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    开设置栏()
    // 设置开着期间坞不该被谁动，但即便被动了，关掉设置也该回放记忆而不是抄坞此刻的值
    $rightDockTenant.set("files")
    关掉设置()
    expect($rightDockTenant.get()).toBe("notebook")
  })

  it("**命令面板跳分类不会覆盖被顶掉的记忆**（C1：坞开着 → 开设置 → 再跳一项 → 关掉设置，坞必须回来）", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    开设置栏()
    开设置栏("mcp") // 设置已经在场，这一下只是换分类，不该重记「顶掉了谁」
    关掉设置()
    expect($rightDockOpen.get()).toBe(true)
    expect($rightDockTenant.get()).toBe("notebook")
  })

  it("**从整页直接开窄栏，整页让位**（C2：不能两种形状同屏）", () => {
    $view.set("settings")
    开设置栏("models")
    expect($view.get()).toBe("conversation")
    expect($settingsColumnOpen.get()).toBe(true)
    expect($settingsSection.get()).toBe("models")
  })

  it("**整页设置开着、坞也开着时跳分类，坞照样要回得来**（R2-1：`$设置在场` 在整页时已经是 true，" +
    "只问「在不在场」会让这一下的顶掉悄悄溜过记账）", () => {
    $view.set("settings")
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    开设置栏("mcp")
    关掉设置()
    expect($rightDockOpen.get()).toBe(true)
    expect($rightDockTenant.get()).toBe("notebook")
  })
})

describe("展开与收起", () => {
  it("展开 → 整页，而那一列**空着**（作者选的）", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("files")
    开设置栏("models")
    展开设置()
    expect($view.get()).toBe("settings")
    expect($settingsColumnOpen.get()).toBe(false)
    expect($rightDockOpen.get()).toBe(false) // 不是把面板放回来
    expect($settingsSection.get()).toBe("models") // 选中项不变
  })

  it("收起 → 回到那一列，选中项仍然不变", () => {
    开设置栏("models")
    展开设置()
    收起设置()
    expect($view.get()).toBe("conversation")
    expect($settingsColumnOpen.get()).toBe(true)
    expect($settingsSection.get()).toBe("models")
  })

  it("**从整页直接关掉，被顶掉的那一位照样回来**", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("artifacts")
    开设置栏()
    展开设置()
    关掉设置()
    expect($view.get()).toBe("conversation")
    expect($rightDockOpen.get()).toBe(true)
    expect($rightDockTenant.get()).toBe("artifacts")
  })
})

describe("坞上位", () => {
  it("坞要上位：设置让开", () => {
    开设置栏()
    坞上位()
    expect($settingsColumnOpen.get()).toBe(false)
  })

  it("**坞上位之后，这次回程的记忆作废**——不会把人这次自己挑的房客又换回上一位", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    开设置栏() // 记下：被顶掉的是 notebook
    坞上位() // 人不等设置关，直接把坞叫回来
    setRightDockTenant("files") // 这次人自己挑的是「文件」
    setRightDockOpen(true)
    // 万一后面哪条路径又调用了一次关掉设置（此刻设置早已经不在场，这里只为钉死记忆已经作废）
    关掉设置()
    expect($rightDockTenant.get()).toBe("files")
  })
})

describe("设置在场", () => {
  it("是响应式的（computed）——订阅它的人会收到变化通知，不是只有主动 .get() 才拿得到新值", () => {
    const 见过: boolean[] = []
    const 撤 = $设置在场.listen((v) => 见过.push(v))
    开设置栏()
    关掉设置()
    撤()
    expect(见过).toEqual([true, false])
  })

  it("窄栏、整页都算在场", () => {
    expect($设置在场.get()).toBe(false)
    开设置栏()
    expect($设置在场.get()).toBe(true)
    展开设置()
    expect($设置在场.get()).toBe(true)
    收起设置()
    expect($设置在场.get()).toBe(true)
  })
})
