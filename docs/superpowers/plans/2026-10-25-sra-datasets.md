# SRA 科研数据插件实施计划

> 使用 superpowers:executing-plans 在隔离分支执行，不委派；设计已获用户批准。

**Goal:** 默认开启的 SRA 实验检索/编号核验/真实清单保存。
**Architecture:** 独立 SraClient，共用 NCBI 队列、ScienceReport 和会话工具/保存边界；DOMParser 负责内嵌 XML。
**Tech Stack:** TypeScript, @xmldom/xmldom 0.8.15, Electron, Vitest, Playwright。

- [x] RED：`tests/science/sra.test.ts` 验证 XML 字段、归属匹配、计数单位、Run 截断、错误/取消/共享限流；工具测试验证跨源缓存和写门。
- [x] GREEN：`src/science/sra.ts` 实现 ESearch→ESummary、XML 归一化；`model.ts` 增加来源和 Run 元数据类型，`tools.ts` 增加 SRA 三工具；`save.ts` 输出 Run 元数据。
- [x] 装配：`native.ts`/`wiring.ts` 加 sraEnable/sraClient、sra_save.directory 写门；插件册/设置/双语 UI 加独立卡；三处只读策略和名单测试补 sra_search/sra_get_accession。
- [x] Mock/Electron：共享 `fake-science-server.mjs` 按 db=sra 返回 ESummary XML；`mock-science.mjs` 选择 SRA；新增 `e2e/sra-datasets.spec.ts` 通过真实工具检索、详情与保存/预览，覆盖错误/方案/关闭。
- [x] 验证：相关单测、全量单测、类型、构建；SRA+GEO+文献+原有插件相关 Electron 和不变视觉基线；官方匿名 API、固定原生预览。默认启用数量断言随 6→7，不能改阈值/遮罩/图片。
- [x] 更新使用文档、历史、验收记录；提交后 main 快进合并并复验，再开 UniProt 分支；禁止推送。
