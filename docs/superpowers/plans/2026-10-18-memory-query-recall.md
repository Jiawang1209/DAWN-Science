# 子 Agent 长词组记忆检索实施计划

> 当前工作树内按 superpowers:executing-plans 逐项执行；用户已明确授权修复，保留独立分支，不合并、不推送。

**Goal:** 让真实草地案例的长词组查询召回已有相关记忆，同时控制无关结果。

**Architecture:** 父侧 `resources.ts` 在已有可见索引上调用独立纯检索函数，过滤→归一化/评分→稳定排序→分页。工具说明提示候选确认和缩短查询；协议与读取权限不变。

**Tech Stack:** TypeScript、Intl.Segmenter、Vitest、真实 Electron/子进程。

- [x] 在 `tests/subagent/resources.test.ts` 加入实际长词组失败回归、精确优先、排序分页、无关查询、重复词、中英混合、归一化及作用域检查。先运行 `npx vitest run tests/subagent/resources.test.ts`，观察新增召回断言因返回0而失败。
- [x] 创建 `src/subagent/resource-search.ts`，提供 `searchResources<T extends SearchableResource>(entries: readonly T[], query: string): T[]`。精确命中优先；仅记忆允许至少两个分词匹配；按命中数/字数/目录序稳定排序，技能保持字面匹配。`resources.ts` 先过滤kind再调用，之后分页。
- [x] 更新 `src/subagent/resource-tools.ts` 的工具说明：长查询可关键词匹配、结果需read确认、可缩短查询或空查询列目录。重跑相关资源/NativeRuntime测试；补真实子进程长查询验证。
- [x] 运行全量单测、typecheck、build及资源Electron验收；在隔离真实预览追加旧长查询→实际resource_read核验，保留旧记录。
- [x] 按 requesting-code-review 做独立只读复审，处理可复现问题；更新开发历史、检索设计和验收记录，提交当前独立分支，核对main不变。
