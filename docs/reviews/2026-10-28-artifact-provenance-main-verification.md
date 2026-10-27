# 产物来源与极简留存：本地 main 最终检查

日期：2026-10-28（Asia/Shanghai）。用户批准先最终检查，再合入本地 main，明确暂不推送。

本地 main 已从 `846e1c35` 快进到实现提交 `4ab75bc4cd14cb7a2183bf0d2d2953fec7cad140`。源码位于 `/Users/liuyue/Desktop/Github_repos/dawn-science`。最终主目录复验全部通过。

## 最终审查及修正

直接审查版本/观察/执行的作用域与不可变性、预算化文件身份和整组发布、输入声明与观察归属、真实内核队列和环境关联、固定字节交付、删除集合修订校验、UI 异步作用域及极简入口。按仓库仅在用户明确要求时委派的约定，本轮未启动审查子 agent。

审查复现一处存储边界缺口：应用管理的 objects 目录被符号链接替换后，读取会接受其外部目标，删除也可能作用于该目标。新增 read/delete 两个回归先失败，再补充读取/删除前的祖先目录检查。校验不创建缺失目录，删除等待已登记恢复完成。现在拒绝被替换的目录，外部文件和原留存终态均不变。

修正后未发现其余阻断本次本地集成的问题。此结论限于所列代码审查与测试范围；不代表 OS 沙箱、全量输入/变量捕获、任意科研分析正确性或所有平台的生产验收。

## 实际验证

日志和备份目录：`/Users/liuyue/Documents/Codex/2026-10-28/dawn-artifact-main-merge/`。

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| 目录替换回归 RED | 两条失败，确认旧读/删行为未拒绝 | `dawn-artifact-merge-redirect-red.log` |
| 修正后相关服务/UI | 7 文件、31 项通过 | `dawn-artifact-merge-related.log` |
| 分支最终完整 Vitest | 534 文件、5621 项通过，10 原有跳过，含真实 Python/R | `dawn-artifact-merge-full-final.log` |
| 分支类型与完整构建 | 通过；既有 eval/大 chunk 提示仍在 | `dawn-artifact-merge-typecheck.log`、`dawn-artifact-merge-build.log` |
| 分支新增 Electron | 4/4 通过：预览内保留、固定旧副本、英文窄面板、后补身份与真实内核环境/Run | `dawn-artifact-merge-electron.log` |
| 分支原有 Electron | 30/30 通过，含真实交付、身份/表格/日志、全部 14 张原视觉基线 | `dawn-artifact-merge-regression.log` |
| 主目录集成回归 | 26 文件、430 项通过：存储/留存、真实内核、协议、交付、生命周期及 UI | `dawn-artifact-main-related.log` |
| 主目录类型与完整构建 | 通过 | `dawn-artifact-main-typecheck.log`、`dawn-artifact-main-build.log` |
| 主目录新增 Electron | 4/4 通过，实际构建和 Python/R 均从主目录运行 | `dawn-artifact-main-electron.log` |
| 主目录原视觉基线 | 14/14 通过；未改原截图、阈值或遮罩 | `dawn-artifact-main-visual.log` |
| 源码一致性 | 主目录 src/tests/e2e/package/锁文件与实现提交无差异；未修改原视觉截图、阈值或遮罩 | Git diff 和保全清单 |

以上真实模型推理仍未作为验收证据：Electron 的模型为共用确定性 mock；Python/R 内核、文件与独立交付验证实际执行。默认限额和来源缺口沿用现有设计。

## main 原有文档与资料保全

合并前 main 仅有本次设计阶段留下的两个未提交文档，未夹带其他代码改动：

- `docs/DEVELOPMENT_HISTORY.md` 的原设计新增段落完整包含在实现提交中。
- 原 `docs/superpowers/specs/2026-10-27-artifact-provenance-retention-design.md` 已由分支中的已批准/已实现状态版本承接。

先保存两份原始文件、SHA-256 和历史 patch，再仅对这两个路径做可恢复 stash，避免快进覆盖未提交文档。专用 stash：`581852cf4d22a77a371b72028ee6737fab569eb0`。逐项验证 stash 中两份原始字节与备份哈希一致，既有其他 stash 全部保留；没有将旧状态 pop 回 main 覆盖新方案。

证据：`main-premerge/`、`main-premerge.patch`、`main-premerge.json`、`premerge-stash.txt`、`main-preexisting-preservation-check.json`。合并和测试没有启动 main 的默认用户资料库，也没有替换安装应用、发布或部署。

## 保留状态

- 实现提交已经本地快进集成；本记录和开发历史作为文档收尾另行提交。
- 分支与独立工作树保留，因为当前原生体验预览仍从该目录运行，不删除它或清空已有体验数据。
- 没有执行 push/fetch/pull，`origin/main` 本地跟踪引用与合并前一致；没有创建或修改远端 PR。
