/**
 * 外观设置（①-B″ · V2）。
 *
 * **界面上没有入口的功能等于不存在。** 本项目栽过七次的那类缺陷
 * ——「内部模型完整，用户可见的那一端没人接线」——在这里的形态就是：
 * `state/theme.ts` 测试全绿，但应用里点不到任何地方切主题。
 */
import { beforeEach, describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { AppearancePanel } from "../../src/ui/Settings.js"
import { $theme } from "../../src/ui/state/theme.js"
import { setSystemPrefersDark } from "./setup.js"

beforeEach(() => {
  setSystemPrefersDark(false)
  document.documentElement.className = ""
  $theme.set("system")
  localStorage.clear()
})

describe("外观设置 · 三个选项都在", () => {
  it("跟随系统 / 亮色 / 暗色", () => {
    render(<AppearancePanel />)
    for (const label of [/跟随系统/, /亮色/, /暗色/]) {
      expect(screen.getByRole("radio", { name: label })).toBeTruthy()
    }
  })

  it("**当前选中的可辨识，且不只靠颜色** —— DESIGN.md：no meaning by color alone", () => {
    render(<AppearancePanel />)
    // aria-checked 让选中态进入无障碍树，而不只是一个高亮的 class
    expect(screen.getByRole("radio", { name: /跟随系统/ }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: /暗色/ }).getAttribute("aria-checked")).toBe("false")
  })
})

describe("外观设置 · 点了要真的生效", () => {
  it("点暗色 → html 上挂 .dawn-dark", () => {
    render(<AppearancePanel />)
    fireEvent.click(screen.getByRole("radio", { name: /暗色/ }))
    expect(document.documentElement.classList.contains("dawn-dark")).toBe(true)
    expect($theme.get()).toBe("dark")
  })

  it("点了之后选中态跟着走", () => {
    render(<AppearancePanel />)
    fireEvent.click(screen.getByRole("radio", { name: /亮色/ }))
    expect(screen.getByRole("radio", { name: /亮色/ }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: /跟随系统/ }).getAttribute("aria-checked")).toBe("false")
  })

  it("**选择被记住** —— 重启后还是它", () => {
    render(<AppearancePanel />)
    fireEvent.click(screen.getByRole("radio", { name: /暗色/ }))
    expect(localStorage.getItem("dawn.global.theme")).toBe("dark")
  })
})

describe("外观设置 · 跟随系统时要说清当前落在哪一边", () => {
  it("系统是暗的，就说它现在是暗的 —— 不能让人对着「跟随系统」四个字猜", () => {
    setSystemPrefersDark(true)
    const { container } = render(<AppearancePanel />)
    expect(container.textContent).toMatch(/当前.*暗色/)
  })

  it("明确选过之后不再显示这句 —— 没有歧义就不加噪音", () => {
    const { container } = render(<AppearancePanel />)
    fireEvent.click(screen.getByRole("radio", { name: /暗色/ }))
    expect(container.textContent).not.toMatch(/当前.*暗色/)
  })
})
