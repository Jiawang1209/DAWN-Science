/**
 * 性能测量的配置（2026-09-22，分支 `perf-streaming`）。
 *
 * **不进 `test:e2e`**：它不断言对错，只量数字，而且一轮要几分钟。
 * 文件名是 `*.perf.ts`，默认的 `*.spec.ts` 匹配不到它；只有这份配置认它。
 * 跑法：`npm run build && npm run perf:streaming`
 */
import { defineConfig } from "@playwright/test"
import base from "./playwright.config.js"

export default defineConfig({
  ...base,
  testMatch: "**/*.perf.ts",
  timeout: 20 * 60_000,
})
