import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // 集成测试要起真实进程（PTY、SQLite、Jupyter 内核），默认 5s 不够
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
