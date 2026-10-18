# 子 Agent 面板收口实施计划

> 使用 superpowers:executing-plans 在当前独立工作树实施，用户已确认设计并授权修改；完成后保留分支，不合并/推送。

**Goal:** 把窄坞里的完整对话行改为清楚、紧凑、可检查的子 Agent 过程。

**Architecture:** 子面板单独组织紧凑消息与结果；ToolRow 增加可选可读摘要，主区默认呈现不变；使用现有角色名册和组件/令牌。

**Tech Stack:** React、nanostores、现有 Markdown/ThinkingBlock/ToolRow、CSS tokens、Vitest、Electron/Playwright。

- [x] 新增组件测试，验证无重复头像、摘要不暴露资源ID、展开保留原文、原交回文本不被改写、单滚动区与固定续问区。运行观察新行为失败。
- [x] 添加 `subagent-presentation.ts` 纯投影：从转录识别答复及真实资源摘要；测试空结果、失败、非JSON和续问边界。
- [x] 修改 `subagent-pane.tsx`、局部 CSS；ToolRow 可选 summary 不改变默认路径；主区角色名册仅用于本项目子面板名称。
- [x] 运行子面板、i18n、design-contract 和资源链路测试，修复问题；补充必要的可判定设计约束。
- [x] 修改资源 Electron 用例使用稳定工具属性，增加宽窄/亮暗/长内容/失败几何断言及截图，检验展开参数、续问、真正退出重启。
- [x] 完成全量单测、typecheck、build、相关Electron、独立只读复审；更新 DESIGN、历史与验收说明，保留分支供查看。
