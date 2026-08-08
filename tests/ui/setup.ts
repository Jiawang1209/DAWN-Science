/**
 * @testing-library/react 的自动清理依赖全局 afterEach。
 * 本项目没开 vitest 的 `globals`，所以必须显式挂——否则每次 render 的结果
 * 会累积在同一个 document 里，表现为「查到多个元素」而不是「查不到」，
 * 很容易被误读成实现有问题。
 */
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(cleanup)
