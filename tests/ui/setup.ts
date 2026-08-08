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

beforeEach(resetAllState)
afterEach(cleanup)
