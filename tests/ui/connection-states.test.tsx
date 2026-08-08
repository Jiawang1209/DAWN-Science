/**
 * 五种加载态（Task 3.6 · S3）。
 *
 * Hermes `AGENTS.md`：
 * > *"The states around loading are distinct experiences — empty, loading,
 * > reconnecting, degraded/stale, and exhausted-recovery **each deserve their
 * > own honest copy and their own way out**."*
 *
 * 此前 DAWN 只有两态：`ready` 布尔 + `fatal` 字符串。后果是三件事被混成一件：
 *   - 「正在连」和「连不上了」长得一样（都是那句「连接中…」）
 *   - 「后端挂了」和「还没选项目」都占满全屏（后者根本不该）
 *   - 重试**无界**，最终表现为一个永远转不完的圈
 *
 * 最后一条 Hermes 单独点名过：*"Retries are bounded and end in a real recovery
 * affordance — **never an infinite spinner or a hot loop**."*
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  $connection,
  MAX_CONNECT_ATTEMPTS,
  connectFailed,
  connectStarted,
  connectSucceeded,
  markStale,
  resetAllState,
} from "../../src/ui/state/index.js"
import { ConnectionSurface } from "../../src/ui/connection.js"

beforeEach(resetAllState)

describe("状态机 · 五种态各自可达", () => {
  it("初始是 connecting", () => {
    expect($connection.get().phase).toBe("connecting")
  })

  it("成功 ⇒ ready", () => {
    connectSucceeded()
    expect($connection.get().phase).toBe("ready")
  })

  it("首次失败仍在重试范围内 ⇒ reconnecting，且带第几次", () => {
    connectStarted()
    connectFailed("网络不通")
    const c = $connection.get()
    expect(c.phase).toBe("reconnecting")
    expect(c.phase === "reconnecting" && c.attempt).toBe(1)
  })

  it("**重试有界**：用尽后进 exhausted，不再无限转圈", () => {
    for (let i = 0; i < MAX_CONNECT_ATTEMPTS; i++) connectFailed("后端没响应")
    const c = $connection.get()
    expect(c.phase).toBe("exhausted")
    expect(c.phase === "exhausted" && c.attempts).toBe(MAX_CONNECT_ATTEMPTS)
    // 原因要留着——没有原因的失败无法排查
    expect(c.phase === "exhausted" && c.reason).toContain("后端没响应")
  })

  it("已连上之后数据可能过期 ⇒ degraded，**但不是断线**", () => {
    connectSucceeded()
    markStale("刷新失败，显示的是上一次的数据")
    const c = $connection.get()
    expect(c.phase).toBe("degraded")
    // degraded 的关键：**后端仍可用**，界面不该被全屏挡住
    expect(c.phase === "degraded" && c.reason).toMatch(/上一次/)
  })

  it("degraded 之后再成功一次就回 ready —— 降级不是单向门", () => {
    connectSucceeded()
    markStale("拿不到最新的")
    connectSucceeded()
    expect($connection.get().phase).toBe("ready")
  })

  it("exhausted 之后可以重新开始 —— 出路必须真的能走", () => {
    for (let i = 0; i < MAX_CONNECT_ATTEMPTS; i++) connectFailed("挂了")
    connectStarted()
    expect($connection.get().phase).toBe("connecting")
  })
})

describe("界面 · 每一态都有自己的文案和自己的出路", () => {
  const surface = (onRetry = vi.fn(), onOpenSettings = vi.fn()) =>
    render(<ConnectionSurface onRetry={onRetry} onOpenSettings={onOpenSettings} />)

  it("ready 时什么都不挡 —— 全屏启动画面只留给真正不可用的后端", () => {
    connectSucceeded()
    const { container } = surface()
    expect(container.textContent).toBe("")
  })

  it("connecting 有文案，但**不出现字面「加载中」**（走 Loader）", () => {
    const { container } = surface()
    expect(container.textContent).not.toMatch(/加载中/)
    expect(container.textContent!.length).toBeGreaterThan(0)
  })

  it("reconnecting 说清这是第几次，而不是笼统地转圈", () => {
    connectFailed("超时")
    const { container } = surface()
    expect(container.textContent).toMatch(/\d/)
  })

  it("exhausted 给出真的能点的重试", () => {
    for (let i = 0; i < MAX_CONNECT_ATTEMPTS; i++) connectFailed("挂了")
    const onRetry = vi.fn()
    surface(onRetry)
    screen.getByRole("button", { name: /重试|再试/ }).click()
    expect(onRetry).toHaveBeenCalled()
  })

  it("exhausted 把原因显示出来 —— 没有原因的失败无法排查", () => {
    for (let i = 0; i < MAX_CONNECT_ATTEMPTS; i++) connectFailed("配置文件坏了")
    const { container } = surface()
    expect(container.textContent).toContain("配置文件坏了")
  })

  it("**degraded 不挡住界面**：它是一条横幅，不是全屏", () => {
    connectSucceeded()
    markStale("显示的是上一次的数据")
    const { container } = surface()
    expect(container.textContent).toContain("上一次")
    // 全屏遮罩会让「后端还能用」这个事实变得不可用
    expect(container.querySelector(".boot-overlay")).toBeNull()
  })

  it("connecting / exhausted 才用全屏 —— 那才是真的不可用", () => {
    const { container, unmount } = surface()
    expect(container.querySelector(".boot-overlay")).not.toBeNull()
    unmount()
    for (let i = 0; i < MAX_CONNECT_ATTEMPTS; i++) connectFailed("挂了")
    const second = surface()
    expect(second.container.querySelector(".boot-overlay")).not.toBeNull()
  })
})
