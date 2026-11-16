# 当前代码与文档文字清理计划

**目标**：移除当前源码注释和维护文档中的指定外部项目引用，保留技术理由和验收约束。

**范围**：源码、测试和实验代码仅修改注释；整理 `CLAUDE.md`、`docs/REFERENCES.md`、实体清单、Backlog、设计与计划中的相关叙述。Git 历史、`docs/validation/` 原始记录、`docs/DEVELOPMENT_HISTORY.md`、`spikes/FINDINGS.md`、许可证和版权声明保持原样。外部参考不改记为 DAWN 原创。

**架构**：不修改运行逻辑、协议、配置、依赖、用户数据及测试断言。构建产物由源文件重新生成。

**技术栈**：TypeScript、Markdown、esbuild、Vitest、Vite。

## 1. 建立基线

- [x] 扫描全部 Git 跟踪文件并按源码、维护文档、原始记录分类。
- [x] 运行 `tests/stuck-guard.test.ts` 与 `tests/kernel/channel.test.ts`，确认隔离工作树的基线。

## 2. 清理文字

- [x] 改写 `src/runtime/stuck-guard.ts`、`tests/stuck-guard.test.ts`、`tests/kernel/channel.test.ts`、`tests/kernel/interrupt.integration.test.ts`、`spikes/d-jupyter-kernel.ts` 及 ACP、工具输出、溯源与 e2e 中的引用注释，保留窗口检测与中断要求。
- [x] 按实际设计理由逐段整理命中文档，移除失效的外部路径、对比和来源统计条目，保留能力描述、数值限制、边界和现有其他参考。
- [x] 用内部规范或真实源码路径替换仍有维护价值的阅读入口；历史来源留在既有 Git 版本中。

## 3. 验证与交付

- [x] 复扫清理范围，确认目标字样及其同项目子组件名没有残留。
- [x] 比较每个修改过的 TypeScript 文件在清理前后的无注释编译结果，要求完全相同。
- [x] 核对原始验证记录、许可证、依赖与配置没有差异。
- [x] 运行受影响的既有测试、类型检查和完整构建；检查新构建产物。
- [x] 审阅 `git diff --check` 与逐文件差异，记录实际验证结果，保持改动在隔离分支供审阅。
