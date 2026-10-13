import { expect, it } from "vitest"
import { fitDockTabs, dockTabOrder } from "../../src/ui/dock-tabs.js"
const widths = new Map(dockTabOrder.map(who => [who, 60]))
it("宽时全部可见，不为已经消失的更多按钮占位", () => {
  expect(fitDockTabs(widths, dockTabOrder.length * 60, 40, 0, "files")).toEqual([...dockTabOrder])
})
it("窄时先预留更多按钮与当前面板，再按固定顺序放入其他标签", () => {
  expect(fitDockTabs(widths, 220, 40, 0, "chat")).toEqual(["files", "artifacts", "chat"])
})
it("角标或英文使标签变宽时会收回，不挤压操作按钮", () => {
  const larger = new Map(widths); larger.set("artifacts", 110)
  expect(fitDockTabs(larger, 220, 40, 0, "files")).toEqual(["files", "artifacts"])
})
it("空间极窄时也保留当前面板，忽略不足以放入的标签", () => {
  expect(fitDockTabs(widths, 70, 40, 0, "chat")).toEqual(["chat"])
})
it("所有间隙参与计算且当前面板不改变标签排序", () => {
  expect(fitDockTabs(widths, 225, 40, 4, "review")).toEqual(["files", "review"])
})
