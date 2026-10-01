import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { FailedNotice } from "../../src/ui/failed-notice.js"

describe("FailedNotice", () => {
  it("固定标出失败原因，原始错误默认折叠并可展开", () => {
    const { container } = render(<FailedNotice text="模型调用失败" rawError="HTTP 401: invalid key" />)
    expect(screen.getByText("这一轮没做成")).toBeTruthy()
    expect(screen.getByText("模型调用失败")).toBeTruthy()
    const details = container.querySelector("details")!
    expect(details.open).toBe(false)
    expect(details.querySelector("pre")?.textContent).toBe("HTTP 401: invalid key")
    fireEvent.click(screen.getByText("查看原始错误"))
    expect(screen.getByText("HTTP 401: invalid key")).toBeTruthy()
  })

  it("没有单独原始错误时不重复显示折叠区", () => {
    const { container } = render(<FailedNotice text="检测到重复调用，已中止" />)
    expect(screen.getByText("这一轮没做成")).toBeTruthy()
    expect(container.querySelector("details")).toBeNull()
  })
})
