# M1 原位错误反馈 Implementation Plan

> 使用 superpowers:executing-plans 在当前会话单线执行。用户已明确原位警告/报错的方案；保留原功能和布局。本批完成后不进入M2。

**Goal:** 解释器保存有问题时，让用户在原输入框处收到清楚提示，修正后提示消失。

**Architecture:** 沿用setInterpreter的problem回执，App按语言及路径匹配反馈；Settings使用已有field-error样式展示，原始原因折叠保留。普通情况没有新内容。

**Tech Stack:** 现有React/TypeScript、Vitest/Testing Library、Electron/Playwright，无新增依赖。

- [x] 在tests/ui/interpreter-save-errors.test.tsx对原KernelsPanel写失败用例，基线缺少原位报错，确认断言失败而非加载异常。
- [x] 修改src/ui/Settings.tsx：增加可选saveProblems，原字段标记错误，详细原因默认收起；编辑后撤下旧反馈。
- [x] 修改src/ui/App.tsx：配置保存失败交给对应字段；首启与请求异常沿用已有机制；按语言隔离回执，保留另一语言设置。
- [x] 修改src/ui/i18n/en.ts：补两条文案；不修改样式和后端。
- [x] 新增e2e/interpreter-save-errors.spec.ts，走实际保存入口验证失败与恢复、原检测入口和窄设置。
- [ ] 类型、全量单测、构建及相关Electron回归通过，实际预览无新增诊断区域；保存错误/恢复截图及检查记录。
- [ ] 更新docs/reviews/2026-10-20-runtime-diagnostics-verification.md、维护台账和开发历史；本地提交、快进合并、复验，保留预览，不推送或替换安装版。

```bash
npx vitest run tests/ui/interpreter-save-errors.test.tsx tests/ui/interpreter-picker.test.tsx tests/ui/settings.test.tsx tests/ui/i18n.test.ts tests/ui/design-contract.test.ts
npm run typecheck
npm test
npm run build
npx playwright test e2e/interpreter-save-errors.spec.ts e2e/first-run-default.spec.ts e2e/provider-test.spec.ts e2e/environment.spec.ts e2e/kernels.spec.ts e2e/analysis-delivery.spec.ts
git diff --check
```

QA：普通状态与原设置一致；失效路径只有对应字段出现红字，详情默认收起；不弹重复底栏错误；修改路径撤下旧反馈，正确保存清错；R不被Python错误影响；原保存/候选检测、首启及交付仍可用；实际窄栏、暗色、原位提示和恢复状态均留存证据。
