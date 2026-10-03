import { render, screen, fireEvent } from "@testing-library/react"
import { StatusNotices } from "../../src/ui/status-notices.js"
import { $connection } from "../../src/ui/state/connection.js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { $notes, note } from "../../src/ui/state/connection.js"

beforeEach(() => { vi.useFakeTimers(); $notes.set([]) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); $notes.set([]) })

it("旧错误显示30秒后退出，新提示保留自己的显示时间", () => {
  note('未知的 agent "deepseek"')
  vi.advanceTimersByTime(20_000)
  note("新的提示")
  vi.advanceTimersByTime(10_000)
  expect($notes.get()).toEqual(["新的提示"])
  vi.advanceTimersByTime(20_000)
  expect($notes.get()).toEqual([])
})

it("同一错误重新出现时，旧计时器不能删除新的提示", () => {
  note("旧错误")
  vi.advanceTimersByTime(10_000)
  $notes.set([])
  note("旧错误")
  vi.advanceTimersByTime(20_000)
  expect($notes.get()).toEqual(["旧错误"])
  vi.advanceTimersByTime(10_000)
  expect($notes.get()).toEqual([])
})

it("可以关闭指定错误提示，当前连接状态保持不变", () => {
  note('未知的 agent "deepseek"')
  note("另一条提示")
  const connection = $connection.get()
  render(<StatusNotices notes={$notes.get()} />)
  fireEvent.click(screen.getByRole("button", { name: '关闭提示：未知的 agent "deepseek"' }))
  expect($notes.get()).toEqual(["另一条提示"])
  expect($connection.get()).toBe(connection)
})
