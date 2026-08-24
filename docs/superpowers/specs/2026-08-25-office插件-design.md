# Office 插件：插件承载体 v1（2026-08-25）

学自 `dsh-office`（解读：`ccb_hive_code_learn/dsh-office-解读.md`，上游移植自天枢，Apache-2.0）。

## 三问的答案（插件屏原来如实写着「都还没定」）

| 问 | 答 |
|---|---|
| 装什么 | **仓库里审过的内置工具包**。不做任意 JS 加载——插件的边界就是「随应用发布、代码进仓库、过一样的测试」。 |
| 怎么加载 | pi 的 `customTools` 装配点（`toolsFor` 第四组，与内核 / 视觉 / MCP 并列），**建会话时装上**——开关改动下一段生效，卡上写明。 |
| 边界在哪 | office 工具管**交付物**（生成 / 读取 / 质检文档）；数据计算仍走内核（既有定案不动）。 |

## 依赖决策（规格 §4）

- **坐在天枢移植版（dsh-office lib）之上**：工具逻辑整目录 vendor 进 `src/tools/office/`（文件头保留 Apache-2.0 来源），参数 DSL 原样保留、由 `转JSONSchema` 翻译——**不逐个改写成 typebox**，改写 14 份 schema 才是漂移源。
- 文档库用它选好的：exceljs / pdfkit / pdf-lib / pdf-parse@1.1.1（锁 1.x 函数 API，导内层实现绕 ESM debug 分支）/ pptxgenjs / jszip / docx / mammoth。**全部 external**（esbuild bundle 会撞 `createRequire`，与 pi 同一颗雷，实测炸过主进程）。
- 放弃了：cordis 注册壳与 schemastery（我们的工具面是 pi 的）；`dsh plugin` CLI（DAWN 插件内置，开关在设置）。
- 我们的不变式挂在两处：①每个工具只返回**一段文本**（上游 textOutput 契约照搬）；②顶层路径参数**解析进工作区**（`路径参数` 名单照 schema 抄，不猜）。

## 形状

- 设置 → 插件：一张卡「Office 文档」——总开关 + 四族（电子表格 5 / PDF 4 / 演示文稿 3 / Word 文档 2），族行 = 勾选框 + 类型图标 + 名 + 计数，其下如实列工具名（**列出来的就是模型此刻真的有的**）。乐观翻转，失败重取纠正。
- 设置键 `plugin.office.off` / `plugin.office.<族>`（没记过 = 开着；只记偏离）。
- 协议 +2：`listPlugins` / `setPluginFlag`（109→111）。
- 自带技能 `office-docs`（上游 SKILL.md 改造）：大文件分页读、交付前 recalc+audit、能 Markdown 交付就不用二进制。

## 判据

- `tests/tools/office.test.ts`：每族一发**经装配层**的往返（含相对路径落工作区、isError 出声）+ 族开关 + DSL→Schema。
- `e2e/office-plugin.spec.ts`：插件卡四族齐全、关一族持久、「下一段生效」写在头上；**假模型点名调 `xlsx_write`，工作区长出真 xlsx**（工具装配全链路物证）。
