# 默认分析交付规范实施计划

> 按已批准设计在当前独立 worktree 内逐项执行，使用 executing-plans；不委派、不合并、不推送。

**Goal:** 交付默认生成分析报告，按步骤说明采用的脚本、调用方式、输入输出及结果，不嵌入脚本全文。

**Architecture:** 扩展现有生成响应的可选结构化步骤，兼容旧响应与旧记录；新增纯报告组装模块，依据实际复制文件构造链接、校验调用目标、标明建议与真实记录。复用现有交付及独立验证协议，更新内置 analysis-delivery。

**Tech Stack:** TypeScript / Zod、Vitest、React、现有 Electron / Playwright。

## 1. 失败回归与规范

- [x] 在 `tests/delivery/service.test.ts` 复现新主报告缺失、已有分步脚本仍被错误认定缺少脚本。
- [x] 在 `tests/skills/default-analysis-delivery.test.ts` 通过真实 loader 核对触发范围和报告规则；确认旧规范缺少调用说明。
- [x] 扩展 `src/protocol/delivery.ts` 生成响应的可选 `steps`；每步限定一个已选脚本、可选 argv、输入/输出引用与说明，禁止模型提供已执行标志。

## 2. 确定性组装

- [x] 新建 `src/delivery/report.ts`，输入真实文件索引与模型叙述，输出分析报告/README/缺口。不再次读取工作区，不加入代码全文。
- [x] 程序生成文件相对链接和安全引用的调用命令；未知路径不输出链接，缺少 argv 明确未知。默认命令标为建议未执行。
- [x] 仅从后端提供的留存来源中识别有完成事实的简单直接 Python/Rscript 调用；复杂 Shell 或不匹配的目标不猜。模型不得决定执行状态。
- [x] `service.ts` 先完成脚本副本和验证计划，再组装 `分析报告.md`，保持旧 interpretation 角色。已有脚本不强制再生成总脚本。
- [x] 单测覆盖中文空格、参数转义、无脚本、缺失/超限、未知引用、留存副本与实时文件不同、旧响应，以及真实/建议调用的区分。

## 3. 技能、界面和真实流程

- [x] 更新既有 `skills/analysis-delivery/SKILL.md`，保存原有执行授权和独立验证边界。
- [x] 更新交付说明、按钮和双语；旧记录仍能打开原报告，不增加模式或面板。
- [x] 更新共享 `scripts/mock-analysis-delivery.mjs`，按传入实际脚本给出步骤，不编造实际执行状态。
- [x] Electron 验收选择已有 Python/R 分步脚本、图片和表格，生成报告，显示调用方式、不嵌入代码、图片解码、文件链接可用；复验旧交付、独立 Python/R 验证及原视觉。

## 4. 交付

- [x] `npx vitest run tests/delivery tests/skills/default-analysis-delivery.test.ts tests/ui/analysis-delivery.test.tsx tests/workbench/analysis-delivery-backend.test.ts`、`npm run typecheck`、`npm run build`、全量单测与相关 Electron。
- [x] 复核 diff、更新开发历史与验收记录并本地提交。正常退出旧预览，备份并核对隔离资料，用本机标准启动器启动此分支，在专用样例中展示实际生成的报告。
