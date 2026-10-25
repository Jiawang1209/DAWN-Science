# NCBI SRA 插件验收（2026-10-25）

分支 codex/sra-datasets，基线为已通过 GEO 验收的 main 5de49adb。先前 GEO 在 main 复验：138 项相关测试、类型/构建和 4/4 Electron 通过。

- TDD 先观察缺少 SraClient 模块、未知 sra 插件和 NativeRuntime 缺少工具的失败，再实现并重跑通过。
- 相关 8 文件、115 项通过；`npm test -- --maxWorkers=4` 完整 514 文件、5444 passed、10 原有 skipped。
- `npm run typecheck`、`npm run build` 通过；构建原有大 bundle 提示保留。
- Electron：sra-datasets、geo-datasets、literature、crossref-literature、office-plugin、settings-counts、visual，34/34 通过。SRA 默认开启即查询，Run 详情保存/预览、429、零结果、方案不写、关闭后新会话与重启持久化均通过。
- 14 张原有视觉图通过；只更新启用数量断言 6→7，未改图片、阈值或遮罩。
- 生产客户端匿名查询 SRR390728，实验 SRX079566、RNA-Seq、PAIRED，Run 包含 SRR292241 和 SRR390728。只读元数据，未下载测序文件。
- 固定启动器启动真实分支预览，独立 SRA 卡默认开，GEO 和旧卡正常；保留原有隔离配置、模型和会话。
- 人工按设计检查 XML 信封/错误/声明拒绝、编号精确归属、运行截断与精度、跨来源缓存、写门及只读策略；无待处理问题。未委派子 agent。

证据目录 `/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-research-plugins/`：sra-full-tests.log、sra-related.log、sra-electron.log、sra-build.log、sra-live.json、sra-preview.png、sra-flow.png。

边界：搜索单位是 Experiment，Run 不能当作样本量；研究/样本最多 20 个实验、每实验最多显示 40 个 Run并保留指定 Run。公共元数据查询不授予受控数据权限，不下载 FASTQ/SRA、不安装 Toolkit、不做质控/统计。默认开保留旧显式关闭选择。仅本地合并，不推送、发布或替换安装版。
