# 侧栏间距与导航一致性验证

- 分支：`codex/sidebar-spacing`，独立工作树基于 `96b9fdb3`。用户已实看最终版本并批准本地提交及main快进集成；不推送、不替换安装版。
- 最终版本：三个导航按钮28×32px、间距4px、品牌到首按钮8px，完整名称18px单行、图标32px。默认/最小侧栏292px、最大420px；有效的已有宽度继续保留，末按钮到侧栏右缘约4.84px。
- 服务器添加入口在多选左侧，各组多选保持同一右缘；分组与底部字体14px，计数12px，原计数列右移4px，归档共用左缘。英文名称列适当加宽，避免与计数重叠。
- 新建任务复用圆加号图标，操作入口与行为不变。

## 初版320px与20px品牌的验证记录

- 宽度和顺序相关断言3项先失败（原逻辑336px、添加在多选后）；修改后4文件113项Vitest通过。
- 英文几何断言先复现名称/计数重叠（最小间距 -5.71px），扩展名称列后中文与英文都至少8px。
- 类型检查和完整构建通过；构建保留既有direct-eval及大chunk提醒。
- 最终构建定向Electron回归10项通过（22.5秒），涵盖品牌与导出菜单、拖动/键盘/上下限/重开/折叠，以及新增排版用例。
- Electron测量实际DOM：320/420px、重载恢复、900px、亮暗、中英文，三个按钮间距4px、品牌间距8px、五处计数左缘及三处多选右缘误差不超过1px；中文/英文标签无碰撞。保留真实截图，未更新视觉基线或放宽容差。
- 旧搜索用例“搜索筛掉不匹配的，且搜不到时说出来”“收着的时候点搜索，侧栏会自己打开”在本分支与未修改的main同样失败：分别为会话行数2而非1、折叠侧栏仍为0px。未将其计入通过项，也未更改搜索逻辑。main复核日志：主工作区 `tmp/main-spacing-inspection/baseline-search.log`。
- 只读复审未发现阻塞实现问题。旧 `sidebar-columns.spec.ts` 的归档右缘契约及旧远端选择器已过时，本轮不宣称全量侧栏e2e通过。

日志与截图在工作树忽略目录 `tmp/sidebar-spacing-verification/`、`test-results/`；实际预览在 `tmp/sidebar-spacing-preview/`，使用隔离userData，来源为此前已退出的隔离预览资料，不使用安装版资料或调用真实模型。

## 初版实际预览

已启动可见窗口 `DAWN Science · codex/sidebar-spacing · 开发预览`（PID 45666），URL指向本工作树dist。最终实测侧栏320px，导航右缘320px，按钮之间4px，四组与底部字号均14px；五处计数左缘114–115px。截图及几何记录见 `tmp/sidebar-spacing-preview/preview.png`、`ready.json`。首次启动的隔离目录冲突已修正，项目目录与scratch分开；只终止本轮启动失败的预览进程。primary checkout仍为干净main，原main预览保留。

## 304px补充（用户实看后的批准调整）

- 默认/最小侧栏从320收至304px；顶栏三个按钮统一28×32px，图标不缩小，品牌名称仍20px、图标32px，按钮间4px、品牌到首按钮8px。
- 保留原有效宽度偏好、上限420px及前轮分组/计数/多选布局。
- 修改前宽度单测2项失败（旧320），实际Electron按钮占位断言失败（旧32px）；修改后4文件113项单测通过，11项定向Electron全部通过（23.7秒），类型检查、完整构建和diff检查通过。
- Electron覆盖304/420px、恢复宽度、900px、中英文、亮暗，完整品牌与三按钮同排，五处计数及三处多选继续对齐。此前main也失败的两项旧搜索断言仍不计入本轮通过项。
- 日志：`tmp/sidebar-spacing-verification/304-{red-unit,red-electron,unit,typecheck,build,electron}.log`；亮暗及英文截图在 `test-results/sidebar-spacing-304px紧凑导航、分组字体与计数列、服务器多选顺序/`。
- 实际预览单独放在 `tmp/sidebar-spacing-preview-304/`，继续隔离userData、默认工作区与scratch；未合并、推送或替换安装版。

304px实际预览已成功开启：PID 50101，标题 `DAWN Science · codex/sidebar-spacing · 304px · 开发预览`。ready.json实测侧栏与导航右缘304px，三按钮均28×32px、间距4px，品牌20px、图标32px；capturePage截图已实看。上轮320px预览已正常退出，main仍干净且原main预览保留。

## 18px补充（仅调整品牌字号）

- 用户批准仅将DAWN Science字号从20px改成18px。本轮生产代码只修改 `--dawn-fs-title-brand` 值，使用处仅为顶栏品牌文字。
- 侧栏304px、按钮28×32px、图标32px、按钮间4px及品牌到首按钮8px均保持；侧栏分组、计数与多选布局保持。
- 更新已有Electron字号断言先复现旧20px值。相关4文件113项单测、类型检查、构建通过；未更新视觉基线或容差。
- 本轮日志为 `tmp/sidebar-spacing-verification/18px-{red-electron,unit,typecheck,build,electron}.log`。
- 继续使用 `tmp/sidebar-spacing-preview-304/` 隔离预览；20px版本的几何和截图另保留为 `ready-20px.json`、`preview-20px.png` 便于比较。

18px最终构建11项Electron回归全部通过（23.4秒）。实际可见预览PID 52111，标题 `DAWN Science · codex/sidebar-spacing · 304px · 18px · 开发预览`；实测字号18px、侧栏304px、按钮28×32px，品牌文字由137.26px收至125.16px，释放约12.09px横向空间。预览截图已实看。main仍干净，未合并或推送。

## 292px补充（侧栏跟随18px品牌导航对齐）

- 用户批准进一步收窄侧栏，使其与logo、品牌及三个按钮的总宽度对齐。按现有真实按钮右缘287.16px，将默认及最小侧栏从304px调整为292px；末按钮到侧栏右缘约4.84px，恢复20px品牌/304px侧栏时约4.74px的边缘留白。
- 品牌18px、图标32px、按钮28×32px、按钮间4px及品牌到首按钮8px保持；上限420px和有效宽度偏好继续保留。
- 更新已有宽度与Electron断言，先复现304px旧值；修改后113项相关单测、类型检查及构建通过。新增实际末按钮到侧栏边界的留白断言，防止仅改变导航占位而内容未对齐。
- 预览仅将已有隔离资料的保存宽度重置为292px，不修改正式资料；当前launcher及几何/截图保存到 `tmp/sidebar-spacing-preview-292/`。
- 本轮日志：`tmp/sidebar-spacing-verification/292-{red-unit,red-electron,unit,typecheck,build,electron}.log`。

292px最终构建11项定向Electron回归全部通过（23.1秒），覆盖292/420px、窄窗、重载、亮暗、中英文、分组与归档计数、多选、品牌及导航按钮。两项此前在main同样失败的旧搜索断言仍单列，不计入通过数。

292px实际预览已打开（PID54587），标题 `DAWN Science · codex/sidebar-spacing · 292px · 18px · 开发预览`。ready.json实测侧栏及导航右边界均292px，末按钮右缘287.16px，边缘留白4.84px；品牌18px、按钮28×32px。capturePage截图已实看，正式main仍干净，未合并或推送。

## 用户验收与合并前最终检查

用户实看292px侧栏、18px品牌版本后表示“很好……就这个版本吧，合并入main”，授权本地提交与main快进集成，不推送或替换安装版。

- 第一轮全量检查发现右坞测试仍预期旧336px侧栏的524px上界，实际568px；此项是本次宽度变更带来的测试失配，已修正为共享 `SIDEBAR_MIN` 空间预算，不归入旧main失败。定向27项通过，最终只读复审确认问题关闭，无其他阻塞。
- 修正后重新跑全量Vitest：400文件、4523项通过、10项按原设置跳过，87.43秒。日志 `tmp/sidebar-spacing-verification/premerge-unit-final.log`。
- 最终构建11项定向Electron回归通过，30.5秒；日志 `premerge-electron.log`。两项已在未改main确认同样失败的旧搜索断言不计入通过项。
- 类型检查、完整构建及diff检查通过。日志 `premerge-typecheck.log`、`premerge-build.log`；已有direct-eval、大chunk提醒与jsdom canvas提示未作为功能失败。
- 本地main集成采用fast-forward；保留工作树及忽略目录里的验收证据。未推送、未更换安装版、未改版本或数据库。main集成复验日志保存在主工作区 `tmp/sidebar-spacing-integration/`。
