# 工作目录迁移与输入框修复实施计划

**Goal:** 修复已确认的两条运行时/布局回归，保留会话恢复和原生文本自动高度。
**Architecture:** 在现有后端集中管理事件接线；在共用 CSS 中仅限制空 textarea 的尺寸。
**Tech Stack:** TypeScript、Electron、React、Vitest、Playwright。

- [x] 在 tests/workbench/workspace-rehome.test.ts 用真实 NativeRuntime 和 SQLite 验证迁移后仍收到一次 output/turn_usage，重复迁移与恢复不翻倍；先运行确认失败。
- [x] 保留 e2e/task-workspace.spec.ts 两条原失败断言；扩展 e2e/side-session.spec.ts 的 1280/1920 几何用例，验证侧边真实输入增高和清空后收回；运行原构建确认失败。
- [x] src/workbench/backend.ts 提取共用接线入口，创建、恢复、迁移成功调用；迁移后补 started 与 config_options，退出/宿主收摊清理订阅。
- [x] src/ui/styles.css 添加 .composer-field:placeholder-shown { field-sizing: fixed; height: 44px; }，保留其他 content sizing 规则。
- [x] 运行相关 Vitest、typecheck、build、迁移/恢复/侧边/输入框 Electron 回归；检查截图和量测，保留日志到 tmp/workspace-composer-fix-verification。
- [x] 自行复查差异、更新唯一开发历史、确认原工作区六个文件 SHA256 未变。用户未要求提交、合并或推送，本轮保留可审阅分支改动。

## 执行结果

新增后端回归先失败（迁移后收到 0 条 output），修复后通过；原 Electron 4 项先失败再通过。截图发现空占位提示仍折行滚动，新增无滚动断言先 2/2 失败，再用仅空值生效的 white-space/overflow 规则修复。最终相关 7 个 Vitest 文件 200/200 通过；最后样式调整后复验 3 文件 99/99；扩大单测排除已知 app-default-client 后 349 文件 4185 通过、10 跳过。类型检查、构建、diff check 与最终 Electron 40/40 通过。宿主收摊通过 stopAll 的 exited 释放订阅，不在停止回合收尾前提前退订。日志与截图见 tmp/workspace-composer-fix-verification。
