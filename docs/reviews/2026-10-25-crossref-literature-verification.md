# Crossref 论文索引验收

## 范围

从本地 main `4e1c116b` 开始，在独立分支 `codex/crossref-literature` 接入第二个无需密钥、审批、机构订阅或邮箱配置的论文索引。用户已委托任意选型，本次采用 Crossref 公共 REST API。沿用 DAWN 命名与插件入口，未引用外部参考项目源码或新增其标识。

新增第五张默认关闭的“科研文献 · Crossref”插件卡。`crossref_search` 按关键词/年份检索登记的 journal-article；`crossref_lookup_doi` 精确核对 DOI；`crossref_save` 只保存本会话实际查到的所选 UUID。两族可独立关闭，API 会话可用，远端只查询，本地保存复用既有写权限、方案/讨论门及产物观察。原有 OpenAlex 工具名、开关和端点保持。

网络请求固定官方 HTTPS，无认证头/密钥/邮箱，禁跳转、自动分页、自动重试和 PDF 下载。进程内所有 Crossref 客户端共享串行队列，至少间隔 1 秒发起请求，等待可取消；每次网络请求超时 20 秒、预算 2 MiB、最多 25 条。真实返回的部分日期、作者/期刊缺失、摘要缺失均保留，JATS 摘要只转换成有界纯文本，不解析外部实体。

两个来源共用有界读取、类型与安全保存实现，但各自缓存，不能互借记录。JSON 和 Markdown 根据实际来源生成，不再写死 OpenAlex；已有 OpenAlex 清单文字保持。新条目保存仍使用唯一目录、拒绝路径逃逸/符号链接并保留来源、时间与条件。索引元数据不是全文阅读或科学结论验证。

## 分支验证

证据根目录：`/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-crossref-literature/`。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 原有基线 | 5 文件、96 项通过 | `baseline.log` |
| 相关测试 | 9 文件、135 项通过 | `related-2.log` |
| 完整 Vitest | 510 文件、5402 项通过，10 原有跳过 | `full-tests.log`，`npm test -- --maxWorkers=4` |
| 类型和构建 | 通过 | `typecheck-4.log`、`build.log`、固定预览 launcher 的 build.log |
| 真实 Electron | 44/44 通过 | `electron-final.log` |
| 原有视觉基线 | 14/14 通过；图片、阈值与 mask 均未改 | 包含在上述 Electron 运行中 |
| 匿名生产客户端 | 检索返回 2 条；已知 DOI 1 条；未查到 DOI 0 条 | `live-client.json`、`live-client.log`，保留请求 URL、实际请求头和状态 |
| 真实保存与原生预览 | 实际生产工具保存 1 条；打开对应 Markdown、展开阅读与默认关闭/启停均完成目视检查 | `real-saved-references/`、`preview-plugin*.png`、`preview-live-references.png` |

新增客户端和工具先确认失败，见 `client-red.log`、`tools-red.log`。停止与 404 同时发生时曾被解释成未查到，`cancel-red.log` 复现后在共享读取模块增加响应后的取消检查；新旧客户端回归通过。默认两个客户端共享节流、队列等待取消不放行其他正在执行的请求有实际行为断言。

Electron 覆盖新插件默认关闭、启用持久化、新会话装配、关键词/年份/类型过滤、DOI、只保存第一条、两份真实文件和 Markdown 产物预览、关闭后无请求、限流/零结果无保存、方案期只查询；同组包含原有 OpenAlex、Office、浏览器、记忆、方案、讨论和产物回归。首次新用例把原 OpenAlex 夹具的摘要断言沿用到了 Crossref，实际预览已经正确显示 Crossref 的摘要；检查错误现场后修正测试预期，后续完整 44 条通过，无产品断言放宽。

自动 Electron 使用 dev:mock 共用的固定推理场景与本地 Crossref 夹具，工具、权限、IPC、文件和渲染是真实执行。真实网络另行验证，不将固定数据冒充在线检索，也不据此声称任意真实模型都会正确规划。

真实匿名检索第一条为 “Climate warming threatens soil microbial diversity”；来源没有作者和摘要，文件明确写“未提供”，未自行补齐。已知 DOI `10.1038/s41564-022-01147-3` 返回 “Reduction of microbial diversity in grassland soil is driven by long-term climate warming”。实际请求头只有 Accept 和 DAWN User-Agent，无密钥或账户信息。

固定原生预览保留既有隔离 profile，包括使用者原有的 OpenAlex 启用状态；本次只切换 Crossref 进行检查并恢复关闭。窗口 1280×808，整体 scrollWidth 为 1280，插件控制与展开阅读无横向溢出。测试仅在隔离 plan-demo 工作区追加唯一目录，未覆盖既有成果。

## 审阅与限制

完成固定域名、限流/取消、缓存隔离、真实来源、日期精度、JATS 转换、路径和权限检查。新增文件与 diff 添加行未命中参考项目名称/路径；没有新增依赖或协议操作。全文、摘要和作者的完整度取决于原始登记数据，不能承诺所有论文均收录。保存若磁盘失败可能留下部分目录，工具会返回失败。

接口依据：[Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)、[公开访问与限流](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/)、[过滤器](https://www.crossref.org/documentation/retrieve-metadata/rest-api/rest-api-filters/)。使用入口见 [科研文献使用说明](../科研文献-怎么用.md)。

## 本地集成

待分支提交、合入本地 main 和主目录复验后补记；不推送。
