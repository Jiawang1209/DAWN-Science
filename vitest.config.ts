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
          // 内核集成测试单独一组，理由见下
          exclude: ["tests/ui/**", "tests/kernel/*.integration.test.ts"],
        },
      },
      {
        /**
         * **起真内核的测试必须串行。**
         *
         * 2026-08-10：`channel.integration` 的 R 那条**单独跑必过、
         * 全量跑偶尔红**（30s 等不到 iopub 的 stream）。这个形状指向并发：
         * vitest 默认**按文件并行**，而 `launch.integration` 同时也在起真内核。
         *
         * `spawnteract` 给每个内核分配 ZMQ 端口，两边同时起就会抢——
         * 抢输的那个连到错的端点，一条消息都收不到。
         * **症状与「内核坏了」一模一样，所以它曾经复现不出来、也查不出原因。**
         *
         * 这一组关掉文件级并行。**代价是慢几秒，换掉一个间歇红的测试**——
         * 间歇红的测试比没有测试更坏：它教人忽略红色。
         */
        extends: true,
        test: {
          name: "kernel",
          environment: "node",
          include: ["tests/kernel/*.integration.test.ts"],
          fileParallelism: false,
        },
      },
      {
        // UI 组件测试要 DOM。三条硬要求（产出标注 / 成本不可见 / 溯源原因）
        // 都是「显示了什么」，只能在这里验
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          setupFiles: ["tests/ui/setup.ts"],
          include: ["tests/ui/**/*.test.tsx", "tests/ui/**/*.test.ts"],
        },
      },
    ],
  },
})
