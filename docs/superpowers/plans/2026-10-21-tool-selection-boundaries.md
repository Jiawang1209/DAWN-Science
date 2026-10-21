# 工具选择边界实施计划

**Goal:** 让状态查询先读已有结果，复杂计算再选择Python/R，并向模型准确表达远端执行位置。
**Architecture:** policy共享选择指引接入NativeRuntime；run_code说明移除宽泛的探索偏向；远端执行上下文不改变本机资源加载路径，shell结果报告实际cwd变化。
**Tech Stack:** TypeScript、pi、Vitest、Playwright Electron、共享假推理服务。

- [x] 建立独立worktree与codex/tool-selection-boundaries，相关3文件81项基线通过。
- [x] tests/runtime/tool-selection.test.ts先断言真实系统提示包含现成摘要优先、足够就回答、远端执行目录与本机元数据分离；原实现失败。
- [x] 现有远端tools测试增加cd结果中报告新目录，原实现失败；内核说明测试不再鼓励任意探索起内核。
- [x] 新policy指引接入NativeRuntime，调整run_code说明，修复远端cwd结果提示。
- [x] 相关回归、全量测试、类型及构建；Electron捕获真实请求，检查轻量读取流程、明确讨论限制和远端上下文。
- [x] 独立假服务预览查询进度与分析入口区别，保留截图/请求核验，不连接真实SSH或模型。
- [x] 补开发历史、核验报告及证据；保持分支，未提交、合并、推送。

- [x] 依用户补充细化内核强制禁令与显式入口优先级，支持@Python及全部小写写法；新增回归先红，最终核验通过。
