# 多篇论文精读与对照验收

日期：2026-10-25。基线 main `2f804fbf`；独立分支 `codex/literature-comparison`；实现提交 `e469d976d90ef342a0be55a2cd1d96374e1a4ca2`。

## 已交付

- 默认 model 档的内置 `literature-review`，可自动发现或显式调用；比较模板属于同技能的按需资源。项目覆盖、manual/off 和原工具权限保持。
- 用户给定材料 → 实际分页阅读 → 逐项事实/物理页/短摘 → 可比性与差异 → 三表 Excel 和 Markdown → 读回。明确全文可读与已读范围不同，缺失、未读与提取失败分开。
- 样本量保留单位、组别、生物重复和技术重复；原文、作者局限与模型归纳分开；同研究多报告不重复计独立证据。不宣称 OCR、自动全文获取、自动荟萃分析或证据点击跳页。
- 接入修复一：pi 展开技能正文不再改变用户执行/内核边界；正文不能授权，也不能误加禁令。用户真实限制、既有讨论状态及外侧快捷标记仍生效。
- 接入修复二：现有 PDF 解析器接收独立普通 Uint8Array，修复合法双页 PDF 在 Node Buffer 下的字符错误。未换解析器、未增加依赖。

## 实际验证

证据目录：`/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-research-plugins/`，下列文件以此为根。

| 验证 | 结果与证据 |
| --- | --- |
| 旧相关基线 | 7 文件 54 通过，`literature-review-baseline.log` |
| RED | 技能缺失、共享场景缺失；展开正文误判回归先失败；真实 Electron 的合法 PDF 字符错误先失败。`literature-review-red.log`、各次 Electron diagnostic/first/second/third 日志 |
| 完整 Vitest | 518 文件、5471 通过，10 原有跳过；`literature-review-full-tests-final.log` |
| 最终相关 Vitest | 17 文件、264 通过；`literature-review-related-final.log` |
| 类型与构建 | `literature-review-typecheck-final.log`、`literature-review-build-final.log`；固定预览另重新构建本实现提交 |
| PDF 到实际文件 | `literature-review-electron-fourth.log`：4/4；真实工具生成并读回 Excel 三表及 Markdown，验证 n/重复单位/页码/原文短摘、无公式注入、原输入 SHA256 不变；空白 PDF 模拟不可提取文字，未冒充全文；关闭 PDF、只讨论、文件缺失分别验证 |
| 既有回归 | `literature-review-electron-final.log`：43 场景首轮 42 通过，暗色设置栏 1 次视觉差异；两文献插件、Office、技能及工具选择等已有场景通过 |
| 视觉差异审阅与复验 | 463 个差异像素集中于输入框边线和计数字形，保留 `literature-review-visual-diff/`。不改截图/阈值/遮罩，单独重跑通过；随后 `literature-review-electron-verified.log` 20/20 通过，包含全部 14 个原视觉基线、4 个文献调研用例和 2 个真实权限边界用例 |
| 原生预览 | 固定本机隔离启动器启动实际分支 e469d976，1280/1280 无页面水平溢出，9 个内置技能、literature-review 已启用。`literature-review-native.png`；实际 Markdown 产物可预览，`literature-review-example/literature-review-flow.png` |
| 资料保留 | `literature-review-profile-before.json` / `literature-review-profile-check.json`：64 个原配置、会话及相关文件哈希全部不变、无缺失；未清空隔离资料目录 |
| 变更审阅 | 新增行参考产品标记 0；依赖、协议与视觉基线文件无变化。手工审查，没有启动审查子 agent |

示例实际文件在 `literature-review-example/论文对照.xlsx` 和 `literature-review-example/文献总结.md`；它们仅包含合成研究，不应作为真实科研结论引用。确定性模型由实际工具文本提取验收字段，证明工具、权限、文件和预览接线，不证明真实模型在任意论文上的提炼或科学推断质量。真实使用仍需研究者对照原页核验。

## 本地集成

已从 `2f804fbf` 快进合入本地 main（集成点 `8c52ffcf`），主目录重新运行 17 文件 264 项相关测试、typecheck、完整 build 均通过；真实构建上的文献调研、执行权限和全部原视觉基线合计 20/20 Electron 通过。对应 `literature-review-main-related.log`、`literature-review-main-typecheck.log`、`literature-review-main-build.log`、`literature-review-main-electron.log`。

主目录的 src/skills/agents/scripts/tests/e2e 与实现提交 e469d976 无差异，后续变化仅为文档记录。未推送、发布或替换安装版。保留分支工作树承载固定隔离预览。
