# Crossref 文献索引 Implementation Plan

> 采用 superpowers:executing-plans 在当前会话逐项执行。项目要求只有用户明确委派时才使用子 agent，本项不委派。

**Goal:** 增加无需密钥、审批或机构订阅的第二个论文索引来源。

**Architecture:** 共用有界请求、文献类型和安全保存；Crossref 客户端负责固定官方 URL 和字段转换；独立插件/缓存/工具名接现有 native 会话与权限。

**Tech Stack:** 既有 TypeScript、fetch、TypeBox、Vitest、Electron/Playwright，不新增依赖。

## 1. 客户端和节流

- [x] 运行既有文献与方案基线：`npx vitest run tests/literature tests/integration/mock-literature.test.ts tests/policy/plan-mode.test.ts`，先确认通过。
- [x] 新建 `tests/literature/crossref-client.test.ts`，用 `Response.json({status:'ok',message:{'total-results':1,items:[{DOI:'10.1234/example',title:['Soil paper'],published:{'date-parts':[[2024]]}}]}})` 驱动 `new CrossrefClient({fetch:network}).search({query:'soil',fromYear:2020,limit:5})`，断言来源、官方域名、无认证、年份/type/rows 及日期精度；再覆盖异常响应、摘要和节流，运行至确认失败。
- [x] 实现 `src/literature/crossref.ts`；共享读取提取到 `src/literature/request.ts`，保留 `src/literature/client.ts` 对外导出和 OpenAlex 行为。执行 `npx vitest run tests/literature`，原测试及新增客户端测试均须通过。

## 2. 工具、插件和读写门

- [x] 新建 `tests/literature/crossref-tools.test.ts`、扩展 wiring 测试，先断言 `crossref_search/crossref_lookup_doi/crossref_save` 的装配、Crossref 清单来源与另一个会话 ID 拒绝，运行确认缺失行为。
- [x] 修改 `src/literature/tools.ts` 的共同工厂，新增 `crossrefTools` 和元数据族；修改 `save.ts` 根据 `origin.source` 写实际来源。设置目录仍必填并复用原安全规则。
- [x] 在 `src/tools/plugins.ts`、`src/store/settings.ts`、`src/electron/wiring.ts`、`src/runtime/native.ts` 装配默认关闭的 crossref；`crossref_save:['directory']` 加入写门。将两项查询登记到 `src/policy/plan-mode.ts`、`execution-boundary.ts`、`src/runtime/analysis-route-evidence.ts`。
- [x] 新卡复用 `src/ui/skills.tsx` 的版式，增加匿名访问与新会话说明及 `src/ui/i18n/en.ts` 英文，更新插件总数相关断言为 5，默认启用数仍为 3。执行文献/方案/既有插件相关测试。

## 3. 真实界面与网络

- [x] 增加 `scripts/fake-crossref-server.mjs`、共享 mock 场景，接 `scripts/dev-mock.mjs`、`e2e/fixtures.ts`；`DAWN_FAKE_CROSSREF` 仅接受 127.0.0.1 的 HTTP 夹具，保留实际官方请求 URL。
- [x] 新建 `e2e/crossref-literature.spec.ts`，从设置开启、新会话发送验收请求，核对文件 JSON 来源和 Markdown 预览，关闭后新会话无查询；补限流/零结果/方案只读。先 `npm run build` 完成，再跑相关 Electron，期间不重建同一目录。
- [x] `npm test -- --maxWorkers=4`、`npm run typecheck`、`npm run build`，以及文献/插件/方案/讨论/产物与 `e2e/visual.spec.ts` 用例全部通过；不得为通过修改视觉阈值。
- [x] 生产客户端实测关键词、已知 DOI、未收录 DOI，保存原始来源结果和实际保存清单。固定原生 launcher 检查插件和清单阅读，无横向溢出。

## 4. 本地集成

- [ ] 新增 `docs/reviews/2026-10-25-crossref-literature-verification.md`，更新用户使用说明、CLAUDE 入口和开发历史；复核权限、来源、限流/取消、命名与依赖。
- [ ] 提交独立分支，主目录 `git merge --ff-only codex/crossref-literature`，复验主目录类型、构建、相关单元与 Electron，补记实际证据并保持 Git 干净；不推送。
