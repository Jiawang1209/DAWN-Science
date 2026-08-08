import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    // 刻意不在根层写 include：两个 project 都会继承它，导致每个测试跑两遍
    // 集成测试要起真实进程（PTY、SQLite、Jupyter 内核），默认 5s 不够
    testTimeout: 20_000,
    hookTimeout: 20_000,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/ui/**"],
        },
      },
      {
        // UI 组件测试要 DOM。三条硬要求（产出标注 / 成本不可见 / 溯源原因）
        // 都是「显示了什么」，只能在这里验
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["tests/ui/**/*.test.tsx", "tests/ui/**/*.test.ts"],
        },
      },
    ],
  },
})
