# GEO 数据集插件实施计划

> 按 superpowers:executing-plans 在当前隔离分支依次执行，不委派。设计与开工已获用户确认；每个数据源独立验证后才合并本地 main。

**Goal:** 默认开启的 GEO 检索、GSE 详情与真实清单保存，并保留已有关闭设置。
**Architecture:** Node fetch + NCBI 进程级共享限流 + 会话级缓存；接入现有插件/写门/产物/方案策略。
**Tech Stack:** TypeScript, TypeBox, Electron, Vitest, Playwright。

- [x] 基线：`npm test -- --maxWorkers=4 tests/literature tests/integration/mock-literature.test.ts`。
- [x] RED：`tests/science/geo.test.ts` 验证搜索强制 gse、精确 GSE 匹配、SOFT brief 设计、缺失/超量/坏响应/取消/限流；`tests/science/tools.test.ts` 验证实际 recordId、会话隔离、路径/符号链接、远端、写门；现有文献默认值测试改为 true 并观察失败。
- [x] GREEN：实现 `src/science/model.ts`, `request.ts`, `ncbi.ts`, `geo.ts`, `save.ts`, `tools.ts`。验证 JSON 信封和请求数量；`geo_get_series` 的 SOFT accession 必须与请求一致。
- [x] 装配：`src/runtime/native.ts` 新增 geoEnable/geoClient，工具组走插件门并声明 geo_save.directory；`src/electron/wiring.ts` 从设置读取标志并只允许回环测试替换；`src/tools/plugins.ts`/`src/store/settings.ts`/`src/ui/skills.tsx`/`src/ui/i18n/en.ts` 加独立默认开卡。
- [x] 策略：在 `src/policy/plan-mode.ts`, `execution-boundary.ts`, `src/runtime/analysis-route-evidence.ts` 只放行 geo_search/geo_get_series，保存仍拒绝。
- [x] 确定性链路：`scripts/fake-science-server.mjs`, `mock-science.mjs` 供 `dev-mock.mjs`, `mock-inference-server.mjs`, `e2e/fixtures.ts`, `e2e/geo-datasets.spec.ts` 共用；文献 E2E 改为验证默认开及关闭持久化。
- [x] 验证：类型检查、完整单测、构建、科研与原有插件 Electron 主路径、视觉回归；官方匿名只读探针；稳定启动器预览卡片和清单。
- [x] 文档：更新使用说明、历史和验证报告，记录实际命令及边界；提交后 main 快进合并，再从 main 开 SRA 分支。禁止 push。
