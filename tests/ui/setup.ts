/**
 * @testing-library/react 的自动清理依赖全局 afterEach。
 * 本项目没开 vitest 的 `globals`，所以必须显式挂——否则每次 render 的结果
 * 会累积在同一个 document 里，表现为「查到多个元素」而不是「查不到」，
 * 很容易被误读成实现有问题。
 *
 * **2026-08-09 追加状态重置。** 界面状态搬进 `src/ui/state/` 之后，
 * 那些 atom 是**模块级单例**——同一个进程里跨测试一直活着。
 * 不重置的后果是具体的：一个测试留下的 `$activeProjectId` 指向了下一个
 * 测试里并不存在的项目，「新建会话」按钮于是一直禁用，
 * 表现为**「点了没反应」，而不是一条清楚的错误**。
 *
 * DOM 要洗，状态也要洗。少洗哪一样，测试之间就有暗管道。
 */
import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach } from "vitest"
import { resetAllState } from "../../src/ui/state/index.js"

/**
 * jsdom 没有实现 `ResizeObserver`，但真实 Chromium 有。
 *
 * `use-stick-to-bottom`（贴底滚动）与终端的重算宽度都依赖它。
 * **这是测试环境的缺口，不是实现的缺陷**——所以补一个不做事的替身，
 * 而不是为了迁就 jsdom 去改生产代码。
 *
 * **代价要说清楚**：贴底滚动的真实行为（用户上滚后不被拽回）
 * 在 jsdom 里验不了，只能靠 Task 3.10 的 Playwright 在真浏览器里验。
 * 这里的替身只保证「渲染不崩」。
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
}

beforeEach(resetAllState)
afterEach(cleanup)
