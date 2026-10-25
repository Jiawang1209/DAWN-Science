# 交付比较修复实施计划

**Goal:** 防止编号、类别和不安全数值在交付核验中误判一致。
**Architecture:** 保留 CSV 原始值和 JSON 数值 source；统一十进制规范比较及保守容差入口，不新增协议。
**Tech Stack:** TypeScript、Vitest、Python 标准库、Electron/Playwright。

- [x] 核实独立 codex/delivery-comparison 工作区基线 de6ebf84 干净；原 compare 3 项通过；确认现有 Node 提供 JSON reviver source。
- [x] tests/delivery/compare.test.ts：加入 CSV/JSON 原文、类别、大整数、下溢、零容差、连续小数正反例，运行并保留预期失败证据。
- [x] src/delivery/numbers.ts 与 verify.ts：实现精确保留、数值比较和角色规则；更新 analysis-delivery.tsx 与英文同义文案。
- [x] tests/delivery/verify.test.ts：真实独立 Python 进程验证差异不能落 passed，原参照与 verification.json 保留；e2e/analysis-delivery.spec.ts 验证真实 UI 状态。
- [x] 完成 delivery/UI/后端定向、typecheck、完整 build、全量 Vitest 和相关 Electron；自审后记录 review 与 DEVELOPMENT_HISTORY。
- [x] 提交本切片并快进本地 main；主目录构建/类型/定向/Electron 复验；记录精确提交、日志与边界。
- [ ] 从验证后的 main 为 SSH 握手期间断开创建新分支，后续改动不混入本分支。

依用户逐项授权，原会话串行执行，不委派子 agent；使用 executing-plans 的验证检查点。无需重复请求已授权的本地提交合并。
