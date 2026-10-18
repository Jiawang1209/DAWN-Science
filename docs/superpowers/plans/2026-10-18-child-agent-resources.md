# 子 Agent 资源接入实施计划

> **For agentic workers:** 使用 superpowers:executing-plans 在当前会话逐项执行；实现由当前会话完成；仅按 requesting-code-review 技能安排独立只读复审。用户已授权设计范围与独立分支实施，最终保留分支供审阅。

**Goal:** 为普通子 Agent 和旧 Team 增加按需只读技能与相关记忆查询，并保持 Bot 兼容。

**Architecture:** 父侧统一筛选、分页及授权资源；子进程通过既有 NDJSON 双向管道查询。只传工具标志，不灌入全量内容，沿用既有转录事件。

**Tech Stack:** TypeScript、pi Skill loader、MemoryStore、Node 子进程、Typebox、Vitest、Electron、共享推理 mock。

## Task 1: 只读资源服务

Files: 新建 `src/subagent/resources.ts`、`tests/subagent/resources.test.ts`。

- [x] 先写真实临时目录测试：三级技能覆盖、manual/off 遮蔽、记忆开关和分支隔离、分页及参考路径越界；运行 `npx vitest run tests/subagent/resources.test.ts` 确认缺少资源服务而失败。
- [x] 实现 `createResourceHost(options)`，公开 `call(name, params)`；资源 ID 由服务签发；建立惰性只读目录；`resource_search` 支持 kind/query/offset/limit，`resource_read` 支持 id/path/offset/limit，报告续读位置与来源。
- [x] 重跑该文件，类型检查；验证禁用同名技能不会暴露下层版本，未确认/归档记忆不会进入目录。

## Task 2: 父子 RPC 和工具

Files: 修改 `src/subagent/{protocol,executor,child}.ts`、`src/team/runner.ts`；新建 `src/subagent/resource-tools.ts` 和桥接测试。

- [x] 先加真子进程管道测试：普通任务资源往返、single/parallel/chain/续问，Team 资源与成员工具共存，未知调用拒绝。
- [x] 执行上述测试，记录新行为失败。
- [x] Context 增加资源访问器工厂，内部 spec 增加可选 resources 标志；启用时普通 stdin 保持可写并处理仅允许的资源请求，未启用仍 EOF 兼容。Team 将资源调用与原 onCall 分流。
- [x] 子侧注册 Typebox 只读工具，复用父调用回应机制，清理超时和已完成回调，提示按需查询与资源不扩权。
- [x] 重跑进程、停止、超时、续问与 Team 测试。

## Task 3: NativeRuntime 接线

Files: 修改 `src/runtime/native.ts`，新建资源装配测试。

- [x] 通过可捕获内部 spec 的真子入口测试，先确认 NativeRuntime 未传资源标志；写明期望后运行见红。
- [x] 从已有技能路径、开关、MemoryStore、workspace/branch 创建父侧访问器；普通任务与旧 Team 复用工厂，远端不读取本机项目资源，沿用权限门的只读检查。
- [x] 跑 NativeRuntime、技能、记忆、Team 和 Bot 相关回归。

## Task 4: 实际构建验收

Files: 修改共享 `scripts/mock-inference-server.mjs`，新建资源 mock 和真实构建链路测试。

- [x] 先写模型端确定性多轮测试，要求依次 resource_search/read 技能与记忆；运行见红。
- [x] 为共享 mock 添加按当前用户轮与已完成工具匹配的验收分支，保证不干扰旧 mock。
- [x] 构建并跑 Electron-as-Node 子入口、真实 NativeRuntime 和旧 Team 链路，核对工具记录、正文、恢复和提示词无预注入。
- [x] 跑全量 Vitest、typecheck、build、必要的 Electron 回归和 diff 检查。记录基线与新增行为的边界。

## Task 5: 文档和分支交付

Files: 更新 `CLAUDE.md`、`docs/DEVELOPMENT_HISTORY.md`，新增 `docs/reviews/2026-10-18-child-agent-resources-verification.md`。

- [x] 自查资源访问作用域、取消/超时、只读边界、同名停用遮蔽、分页与错误输出；只修本功能范围问题。
- [x] 记录实际命令和结果、mock/真实模型边界、已知限制；更新本计划完成项。
- [x] 验证干净主工作区未改变，保留 `codex/child-agent-resources`，不合并、不推送、不替换安装版。

验收结果与已知基线失败见 `docs/reviews/2026-10-18-child-agent-resources-verification.md`。
