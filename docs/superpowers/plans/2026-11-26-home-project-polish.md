# 首页项目与入口改进

用户授权在分支逐项修改并查看效果。分支：codex/home-project-polish。

保留现有品牌主视觉与左右两列。去掉重复顶栏，并将首页网格改为内容和底栏两行；三个操作同排、20px 图标、至少42px高度，窄屏允许自然换行。

收藏使用现有 updateProject 持久化。增加“已收藏 · 优先显示”与其他项目分组、已收藏文字与描边；不新增数据字段。

远程目录归属于会话，不创建虚假的本地项目。不受最近六条限制，从全部未归档非终端会话按 projectId + connectionId + cwd 分组，显示服务器和目录，点击打开该组最近的会话。它是已有远程工作区的恢复入口，不代表服务器当前在线，不自动建立SSH连接。

执行与验收：
- [x] 核对现有数据模型、收藏行为、首页布局。
- [x] 新增收藏分组与远程目录回归测试，确认实现前失败。
- [x] 调整重复品牌栏与操作按钮。
- [x] 明确收藏分组与选中状态。
- [x] 展示已有远程会话目录并复用原恢复路径。
- [x] 组件、设计契约、双语、导航竞态测试。
- [x] 类型检查与构建。
- [x] 独立配置Electron主路径、窄屏与截图检查。

保留正式App数据；不合并main、不推送、不替换安装软件。

验收结果：4个Vitest文件126项通过；typecheck与完整build通过；首页Electron七项通过。截图已查看浅色、深色及390px窄屏；主题截图禁用过渡动画以捕获稳定帧。远程为内置fake SSH，未验证真实服务器连接；未运行全量测试及全套视觉基线。已有eval/chunk-size构建警告仍存在。

截图：output/playwright/home-project-polish-20261126/home-remote-light.png 与 home-remote-dark.png。

## 同日反馈：统一按钮

新建对话、打开项目、新建项目全部使用 outline 描边按钮，保留一致尺寸与同排布局。收藏位置保持首页项目区顶部“已收藏 · 优先显示”，不移动项目目录，没有独立收藏页面。build:ui通过；Electron收藏/刷新持久化、入口布局与390px窄屏用例1项通过，截图已查看。

## 同日反馈：项目位置显示

本地卡片保留原本地路径。远程卡片改用项目名（正式归属项目名，临时会话取远程目录末段）作为主标题，从既有连接状态取得username/host/port，位置显示user@host:/directory，非22端口采用ssh://user@host:port/directory，IPv6补方括号。连接配置缺失时显式说明，不把自定义服务器标签假装成SSH地址。不同远程目录继续独立卡片。

测试先确认新两项失败后实现。4个Vitest文件128项通过，typecheck、build:ui通过；7项首页Electron测试通过并检查实际SSH地址与会话恢复。截图home-project-ssh-address.png已查看。服务器仍为隔离fake SSH，不代表真实服务器验收。

## 同日反馈：项目多时独立滚动

宽度大于700px且高度大于560px时，首页两列分别在剩余高度内滚动，顶部品牌与三个按钮保持原位；项目区使用现有细滚动条。窄屏或低高度窗口保留整页滚动，避免嵌套滚动导致底部不可达。

新增Electron用例先在原实现上失败（项目区overflow为visible），实现后通过。使用13个隔离项目验证滚轮生效、能访问最后一个项目、顶部与右侧不跟随左侧滚动、390px窄屏和500px高度均可访问底部。最终4个Vitest文件128项通过，typecheck、build:ui通过，首页Electron8项通过。已查看滚动前后截图，保存为home-many-projects-top.png、home-many-projects-scrolled.png。

## 同日反馈：会话多时滚动

右列沿用独立滚动区域，取消首页只显示六段会话的截断。仍按活动时间排序，归档和终端会话仍遵循原有过滤。

新增单测先确认14段只显示6段的失败，再移除截断。扩展Electron用例同时放置13个项目和14段会话，验证左右滚轮互不影响、能访问最后一段会话、顶部保持原位、390px窄屏与500px高度窗口仍能滚到底，并点击最后一段会话验证正确恢复。129项针对性测试、typecheck、build:ui以及8项首页Electron用例均通过，已查看滚动截图home-many-conversations-scrolled.png。演示数据与正式App隔离。

## 同日反馈：首页视觉与工作台统一

三个入口使用secondary与40px action尺寸，保留20px图标，打开项目采用描边文件夹。按钮颜色、边框与悬停直接同工作台conv-actions共用CSS规则；几何定义回归Button primitive，移除首页调用处的按钮尺寸覆盖。

保留双栏和品牌。两列标题增加主题色图标、总数及细分隔线；宽窗口滚动时标题固定，组标题使用轻分隔线；普通会话改用card-compact，最新会话继续突出。顶部与双栏间距从40减为32。保留已有收藏、SSH地址、独立滚动与窄屏整页滚动。

129项针对性测试、typecheck、build:ui通过；首页8项+项目创建4项Electron功能检查通过，另1项隔离演示截图检查通过。已检查浅色、深色、390px窄屏截图，未更新视觉基线。既有eval/chunk-size警告仍在。

演示截图home-refined-light.png、home-refined-dark.png、home-refined-narrow.png与复现夹具源home-refined-preview.spec.ts.txt保存在output/playwright/home-project-polish-20261126。演示远程目录仅在临时数据库中构造，截图不表示服务器目录真实存在；正式App配置和数据未改动。

## 用户确认后的最终收尾

用户确认新版设计后完成全量UI回归2383项、类型检查与完整构建。扩大Electron回归最终23项通过。初轮发现既有比例布局与旧侧栏像素测试契约不一致；仅修正测试，使其分别检查比例优先和旧记录兼容，保留所有布局断言。详情见docs/reviews/2026-11-26-home-project-polish-acceptance.md。保持当前分支交付，未合并main或替换正式App。
