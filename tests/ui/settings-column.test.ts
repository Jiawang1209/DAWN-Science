/**
 * 右边那一列的一条规则（规格 `2026-09-16-设置右栏`）：
 *
 * > **设置活着的时候，右边那一列归设置；设置一关，上一位房客回来。**
 *
 * 作者原话：*「如果右边有面板的话，那么恢复之后是有面板的；
 * 如果右边没有面板的话，那么恢复之后就没面板。」*
 */
import { beforeEach, describe, expect, it } from "vitest"
import { $view, $settingsSection } from "../../src/ui/state/view.js"
import { $rightDockOpen, $rightDockTenant } from "../../src/ui/state/right-dock.js"
import {
  $settingsColumnOpen,
  关掉设置,
  开设置栏,
  展开设置,
  收起设置,
} from "../../src/ui/state/settings-column.js"

beforeEach(() => {
  localStorage.clear()
  $view.set("conversation")
  $rightDockOpen.set(false)
  $rightDockTenant.set("files")
  $settingsColumnOpen.set(false)
  $settingsSection.set(undefined)
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
