# UniProt 蛋白信息实施计划

> 使用 superpowers:executing-plans 在独立分支依次执行，不委派；用户已批准设计及开工。

**Goal:** 默认开启的蛋白/序列/功能查询和实际 FASTA 清单交付。
**Architecture:** 独立 UniProtClient 和队列，复用科研请求/会话缓存/写门，仅按实际来源区分 proteins 与 datasets 保存目录。
**Tech Stack:** TypeScript, Node fetch, TypeBox, Electron, Vitest, Playwright。

- [ ] RED：`tests/science/uniprot.test.ts` 先验证搜索头总量、编号精确匹配、审阅状态、FUNCTION/证据、缺失/非法/超长序列；工具测试验证 FASTA 精确字节、目录/来源隔离和写门。
- [ ] GREEN：新增 `src/science/uniprot.ts`，`model.ts` 增 UniProt 来源；`tools.ts` 加独立三工具；`save.ts` 用实际源决定目录和文件，保留 GEO/SRA 原格式与路径限制。
- [ ] 装配：NativeRuntime 和 Electron 的 uniprotEnable/uniprotClient、uniprot_save.directory 写门；插件册/设置/双语卡；只读策略和名单测试。测试替换仅接受回环HTTP，UniProt 请求必须来自官方 REST origin。
- [ ] Mock/Electron：假科研 HTTP 服务增加 /uniprotkb/search + X-Total-Results，mock 按 UniProt 标记调查询/编号/保存；`e2e/uniprot-proteins.spec.ts` 验证3文件、FASTA及预览/默认开/关停/错误/方案。
- [ ] 验证：类型、构建、全量单测；UniProt/GEO/SRA/文献/原插件 Electron + 14 张原有视觉图；只更新启用数7→8，不改图/阈值/遮罩。真实匿名 P04637 查询和固定原生预览。
- [ ] 更新使用说明、历史和验收报告；提交后 main 快进合并并复验。最终清洁状态、在用预览匹配代码；不推送或替换安装版。
