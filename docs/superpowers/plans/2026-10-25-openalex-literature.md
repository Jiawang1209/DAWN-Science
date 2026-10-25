# OpenAlex 文献检索 Implementation Plan

> 使用 executing-plans 在当前会话逐项执行；不委派子 agent。

**Goal:** 交付可按需启用的查询、DOI 核验和真实记录保存流程。

**Architecture:** 固定官方 API 的受限客户端 → 会话级记录缓存与三件工具 → 既有插件/权限/方案/产物接线。无需新协议或依赖。

**Tech Stack:** TypeScript、fetch、TypeBox、现有 React 插件界面、Vitest、Electron/Playwright。

- [x] 1. 验证已有插件/权限相关基线；写客户端用例覆盖请求参数、精确 DOI、缺失摘要、HTTP 状态、取消与预算，确认失败。
- [x] 2. 实现 src/literature/client.ts 的 `OpenAlexClient.search/getByDoi`，输出来源时间和结构化元数据，固定域名、预算和无分页。
- [x] 3. 写三件工具的失败用例，覆盖缓存隔离、选择、唯一保存、符号链接、取消和只读范围；实现 src/literature/tools.ts 与 save.ts。
- [x] 4. 在 plugins.ts、native.ts、wiring.ts、backend.ts 接开关与默认关闭；将查询放入只读门，保存接现有写权限门；UI 补说明和英文，更新既有插件数量断言。
- [x] 5. 增加共享推理场景和本地固定 OpenAlex API 夹具，真实 Electron 验证用户路径、失败、持久开关、保存和源记录一致性；固定夹具不冒充在线服务。
- [x] 6. 运行相关单元/集成、全部 UI、类型、构建和 Electron。验证既有视觉基线保持不变，失败先检查实际 diff，保持阈值；原生预览检查；用客户端完成少量真实服务查询并保存证据。
- [x] 7. 审阅新增品牌命名、依赖/权限/路径与取消边界；记录验收和开发历史，提交分支，按已授权流程本地合并和主目录复验，不推送。
