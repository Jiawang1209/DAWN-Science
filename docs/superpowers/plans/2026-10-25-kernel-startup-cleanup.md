# 内核清理实施计划

**Goal:** 清理不遗漏启动中的内核，关闭后的旧代码不再执行。
**Architecture:** 对话代次 + 清理屏障；收等待当时的启动 Promise，晚到实例只回收；执行队列检查所属代次。Native stop 立即开始且等待挂载层清理。
**Tech Stack:** TypeScript、Vitest、pi NativeRuntime、Python/ipykernel、Electron/Playwright。

- [x] 创建 codex/kernel-startup-cleanup，基线 2e4c26a0，挂载 2 文件 65 项通过。
- [x] 新增 tests/kernel/startup-cleanup.test.ts 与 tests/runtime/native-kernel-cleanup.test.ts，复现晚到启动/队列/退出与 Native stop 等待问题。
- [x] 修改 src/kernel/挂载.ts 的起中登记、清理代次、晚到处理、执行边界、收全部/有活内核；src/runtime/native.ts 的停止资源顺序与等待。
- [x] 真内核和真实 Electron 回归，保留标记未写入及进程回收证据；完成类型/构建/定向/全量验证。
- [x] 自审、更新 review 与 DEVELOPMENT_HISTORY，提交并快进 main，主目录复验。
- [x] 下一项长下载路径布局另建分支，不混入本切片。

依用户指示串行执行，不委派，不推送或替换安装版。
