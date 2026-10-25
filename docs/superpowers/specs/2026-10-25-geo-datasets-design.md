# GEO 科研数据插件

用户已确认三个独立插件，按 GEO → NCBI SRA → UniProt 逐项分支开发、验证、合并本地 main，不推送。2026-10-25 最新要求：科研插件默认开启，已有显式关闭设置保留；OpenAlex、Crossref 同步改为缺省开启。

## GEO 首版

- `geo_search`：关键词/Entrez 查询，强制 Series 类型，1–20 条单页元数据，不下载数据表。
- `geo_get_series`：GSE 编号精确查询，补充 SOFT brief 中的研究摘要、实验设计、实验类型、平台；样本清单最多 40 条，明确截断和缺失。
- `geo_save`：仅接受本会话实际查到的 recordId，保存至工作区 `outputs/datasets` 下新建目录，输出 `records.json`、`数据清单.md`。不得覆盖文件或通过符号链接写出工作区。
- 信息为数据库记录，不推断分组、不承诺分析可行性，不下载原始数据。记录来源、请求 URL、查询条件、时间及缺失/截断警告。

## 边界

复用现有内置插件开关、API NativeRuntime、权限门、产物观察和 Markdown 预览。只读查询可用于先出方案/讨论/路线核验；保存经过原 write 门，远端会话仅查询。ACP 不新增桥接。

新增 `src/science`：独立类型/有界请求、NCBI 共享串行队列（每秒最多两次起始）、GEO 客户端、会话缓存工具、清单保存。使用 Node fetch，不添加依赖。请求限时 20 秒、单响应 2 MiB，取消立即生效，429/403/网络错误明确报告，不自动重试、跟随重定向或翻页。共享队列供后续 SRA 使用。

UI 增加「科研数据 · GEO」插件卡，默认开启，可单独关闭读/保存功能；OpenAlex/Crossref 文案和默认值同步变更。新会话应用开关，已有显式关闭不覆盖。

## 验证

先写并观察失败的客户端、默认值、会话缓存与写权限测试，再实现。确定性 GEO HTTP 服务与模型步骤由 dev:mock/Electron 共用；验证缺省直接查询、GSE 详情、保存真实记录、预览、关闭持久化、零结果、429、方案期不写盘。保留现有视觉基线。真实匿名接口只读探针和稳定隔离 Electron 预览独立留证。

官方依据：https://www.ncbi.nlm.nih.gov/geo/info/geo_paccess.html 与 https://www.ncbi.nlm.nih.gov/books/NBK25497/ 。独立实现，不复制参考项目代码/素材/品牌。
