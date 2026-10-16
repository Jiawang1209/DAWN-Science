# 询问框布局 Implementation Plan

**Goal:** 常见选项问题无需滚动，长内容也始终可以直接回答与提交。

**Architecture:** QuestionCard 头部、正文、回答区三段 flex 布局；composer 按聊天容器高度约束，只有正文溢出滚动。沿用既有状态和协议。

**Tech Stack:** React、CSS、Vitest、Playwright Electron。

## 执行与 QA 清单

- [x] 在 `e2e/question-card-layout.spec.ts` 使用既有 `toolCall` mock 定义截图同类三选项、长八选项与纯输入三题；断言默认窗口正文无溢出，输入/按钮在容器内。
- [x] 构建运行新用例，确认旧版因正文显示不全或操作裁切而失败。
- [x] `src/ui/question-card.tsx` 分出 `.question-card-body` / `.question-card-footer`，切题滚动复位；错误放固定回答区。
- [x] `src/ui/styles.css` 改自然高度 + 容器上限 + flex 收缩，仅正文滚动；选项边框、主题选中状态、焦点、文字层次。
- [x] `tests/ui/design-contract.test.ts` 扫描禁止整卡滚动；旧 `e2e/user-questions.spec.ts` 从 300px 改为实际可见性断言。
- [x] 跑单测、设计契约、typecheck、build、全部询问框和选中文字对比度 e2e。
- [x] QA：普通三选项、长八选项滚动前后、900×650、小侧栏、纯输入、导航复位、收起恢复、真实提交、亮暗、错误重试。截图与数字边界检查相互印证。
- [x] 保存效果图并提供可操作的隔离 Electron 预览；用户验收后授权本地提交与快进合并 main，不推送。

## 实际验证

- 初始相关单测 99 通过；旧版三选项 Electron 回归因溢出 55px 失败。
- 修改后相关单测与设计契约 101 通过；typecheck、build 通过。
- 三个新增布局用例、六个原有问答用例、一个选中文字对比度用例共 10 项通过。最后焦点样式调整后重跑布局与对比度 4 项通过。
- 截图与隔离演示位于 `artifacts/question-card-layout/`；预览保留普通单题三选项，按钮为提交答案。实图复核了普通、暗色小窗口与窄侧栏的回答区显示。
- 构建仍有既有 direct-eval 和大 chunk 提示；e2e 夹具重载日志带既有页面加载取消及个别 ResizeObserver 提示，均未影响本次用例结果。
- 验收前分支 `codex/question-card-layout`；当时未提交、未合并、未推送。

- 用户追加外框参考：改为与主输入框聚焦环一致的 2px 主题色描边。build 与布局、对比度 4 项 Electron 检查通过，已刷新独立演示及截图；普通三选项正文溢出仍为 0。

## 本地集成验证

用户已确认效果并授权合并 main。最终版合并前重跑相关单测与设计契约 101 项、询问框与对比度 Electron 10 项（20.7 秒）全部通过；typecheck、build、diff 检查通过。采用本地提交与 fast-forward，保留隔离预览工作树和证据，不推送、不替换安装版。
