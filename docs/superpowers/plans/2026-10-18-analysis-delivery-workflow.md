# Analysis Delivery Workflow Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User has approved execution; do not delegate without explicit request.

**Goal:** 在产物内整理可访问交付，生成基于实际输出的结果解读，保留独立运行与比较证据。

**Architecture:** `src/protocol/delivery.ts` 定义请求/记录。`src/delivery/service.ts` 负责有界取证、只读模型生成、独立新目录与会话记录；`src/delivery/verify.ts` 负责独立解释器和完整结果比较。后端只做当前会话/模型/技能/设置装配。`src/ui/analysis-delivery.tsx` 包装原产物预览，路线/Bot 携带文件路径进入同一流程。

**Tech Stack:** TypeScript/Zod、Node fs/child_process、React/nanostores、Vitest、Playwright/Electron，复用 pi 问一句与共享 mock。

## 1. 协议与后端生成
- [x] 在 `tests/delivery/service.test.ts` 写先红测试：未选文件拒绝；不执行脚本；真实证据进入生成；同名不覆盖；越界和软链拒绝；缺失/大文件引用；模型非法 JSON/缺结果解读失败；记录会话隔离及重启中断。
- [x] `npx vitest run tests/delivery/service.test.ts`，记录预期失败后，实现 `src/protocol/delivery.ts`、`src/delivery/service.ts`，逐步转绿。
- [x] 在 `src/protocol/operations.ts`、version/index 注册 list/create/cancel/verify 操作；`src/workbench/backend.ts` 校验本地 native 会话并装配当前模型、可见技能及配置解释器。补 server fixtures 和操作清单测试。

## 2. 运行验证
- [x] `tests/delivery/verify.test.ts` 先红：真实 Python 独立进程、参数数组、全新 output/tmp、退出失败/超时、完整表格比较、缺少输出部分验证、数值差异失败、未配置解释器不启动。
- [x] `src/delivery/verify.ts` 转绿：固定 argv，无 shell；超时清理本进程组；日志及退出码持久化；预先固定容差；不覆盖原结果/原脚本。

## 3. 产品界面
- [x] `tests/ui/analysis-delivery.test.tsx` 先红：选择/设置/默认仅整理/记录/关闭预览、过期响应隔离、等待确认和失败状态。
- [x] `src/ui/analysis-delivery.tsx`、`src/ui/state/delivery.ts`、样式、中文/英文文案；App 包装 ArtifactsPanel。路线/Bot 文件入口共用同一个组件；scope 包含 sessionId/workspace/connection。
- [x] 更新 `skills/analysis-delivery/SKILL.md` 的结果解读要求；在 `scripts/mock-analysis-delivery.mjs` 生成确定性证据驱动回复，由共享 mock 导入。

## 4. 实际验收
- [x] `e2e/analysis-delivery.spec.ts`：真实科研样例文件选择→生成结果解读→原文件/图片预览→独立验证→记录/日志→会话切换；缺失输出不能通过。
- [x] `npm run typecheck`、定向 Vitest、build、定向 Electron E2E；适当全量回归。
- [x] 打开单独 Electron 实际预览并完整跑科研交付案例；截图检查普通/窄坞/暗色，展示真实数值与验证证据。
- [x] 更新 `docs/DEVELOPMENT_HISTORY.md`、验收报告、计划勾选，独立分支本地提交。核对 main 不变、未推送、安装版未替换。


## 执行结果说明

- 后端按计划提供4个严格协议操作，协议8.20；当前会话模型无工具生成，独立 Python/R 仅在明确确认运行方案后启动。新增严格 UTF-8 解码，避免不同类别因替换字符被错误比较为一致。
- 当前实现对图像保留和预览，不做自动科学/视觉判定；图像作为比较项会报告未完成而不宣称一致。大/不可读输入只引用，旧验证目录保留。
- 科研演示使用共享确定性推理夹具，文件处理、Python计算和独立重跑为真实执行；不能用本验收推断真实LLM科研判断质量。
- 本分支按用户要求保留，不合并/推送/替换安装版。验收细节见 `docs/reviews/2026-10-18-analysis-delivery-workflow-verification.md`。
