# GEO 插件验收（2026-10-25）

分支 codex/geo-datasets，基线 main d229a9f7。GEO → SRA → UniProt 按独立分支顺序执行。本报告只确认 GEO 与科研插件缺省开启变更。

- 原有文献基线 6 文件 / 68 项通过。
- TDD：新增客户端/工具尚不存在时失败；文献默认值断言出现 false≠true，工具装配断言缺少 geo_search；实现后对应通过。
- `npm test -- --maxWorkers=4`：513 文件、5424 passed、10 原有 skipped。初次全量暴露旧五项插件名单和缺少动态翻译入口，已修正并完整重跑。
- `npm run typecheck`、`npm run build`：通过。构建原有 bundle 大小提示保留。
- `npx playwright test e2e/geo-datasets.spec.ts e2e/literature.spec.ts e2e/crossref-literature.spec.ts e2e/office-plugin.spec.ts e2e/settings-counts.spec.ts e2e/visual.spec.ts`：30/30。含默认开、GSE 详情保存/预览、关闭后重启持久化、429、零结果、方案只查，及文献/Office 回归。
- 14 张原有视觉基线全部通过。初次设置等待仍钉死启用数 3，实际为 6；只修该状态断言。未改截图、阈值或遮罩。
- 官方生产客户端匿名访问：GSE29235 检索返回 1 项，详情实验设计为 “Two condition design comparison of Wild-type strain including a dye swap”，样本总数 3；共 5 次元数据请求。记录来源和时间，未下载数据文件。
- 稳定启动器启动真实分支 Electron，GEO 卡默认开、三工具可见，无布局溢出；原有会话/工作区/模型配置保留，没有手工改变旧插件开关。
- 合并前人工按设计检查数据源/编号匹配、会话缓存、缺失/截断、取消/预算、远端仅查、保存写门和符号链接拒绝；无待处理问题。不使用子 agent。

证据目录：`/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-research-plugins/`，geo-full-tests.log、geo-electron.log、geo-build.log、geo-live.json、geo-preview.png、geo-flow.png。

首版范围：API 会话可用；逐样本特征、原始数据下载、质量验证和统计分析未实现。本地合并不等于远端推送或安装版更新。
