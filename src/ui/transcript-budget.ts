/**
 * 一次放进 DOM 的转录块数（2026-09-22，`perf-render`，学自 Hermes `thread/list.tsx` 的 render budget）。
 *
 * 40 块 ≈ 20 轮一问一答。Hermes 用的是约 300 个 message part，形状同源、单位不同：
 * 我们的一块是一整条发言（里面可能有十几个 markdown 块），比它的 part 重得多。
 *
 * **不是配置项**：它是个性能阈值，不是口味；真要看更早的，屏幕上那颗按钮就是入口。
 *
 * **单独一个文件**，因为 e2e 也要用它算「说几句才超预算」，而 `views.tsx` 一路带进 CSS，
 * Node 直接 import 会当场报 `Unknown file extension ".css"`。
 */
export const 默认转录预算 = 40
