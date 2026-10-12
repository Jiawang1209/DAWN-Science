# 坞标签自适应验证记录

分支 `codex/dock-responsive-tabs`，基线 main `8b5b5e08`。用户先授权开新分支实现，随后要求测试通过后合并入本地 main；该授权包含必要的本地提交，不包含推送或替换安装版。

## 范围与判据

按真实头部宽度和标签尺寸分配可见入口，保留当前面板及固定顺序；更多和关闭按钮不重叠，整行垂直居中。全部可见时隐藏更多，菜单与标签互补且不重复。保留九种面板、内容与行为、尺寸、宽度上下界、持久化和协议。

## 已核对证据

- 原坞状态与渲染：2 文件、28 项通过。旧构建宽度从 280 变 720 后仍只有 3 个标签，新真实回归因此失败，证明覆盖原问题。
- 最终 `npm test -- tests/ui`：126 文件、1306 项通过（日志 `/tmp/dawn-dock-final-ui.log`）；jsdom 原有 canvas 未实现提示，真实 Electron 绘制检查独立验证。
- `npm run typecheck` 与 `npm run build` 通过（`/tmp/dawn-dock-final-types3.log`、`/tmp/dawn-dock-final-build2.log`）。
- 新宽度、计数、拖拽、英文深色及焦点路径，原坞导航、关闭重开、五项产物与长清单真实检查通过；假推理服务器只代替模型服务，运行真实构建的 Electron 应用与本地文件操作。
- 两条焦点回归先红后绿：部分展开卸载聚焦 menuitem；菜单打开时外部输入不被 resize 抢焦点。只读复审无阻碍交付项。
- 首轮 22 项中 18 通过，4 张受影响视觉基线报告差异。已逐张审阅 diff，仅右上标签栏改变；保留差异图于 `tmp/dock-responsive-tabs-verification/`，仅同步对应四张稳定 actual，未放宽阈值或增加 mask。

## 最终复验

`npx playwright test e2e/dock-responsive-tabs.spec.ts e2e/right-dock-navigation.spec.ts e2e/artifacts.spec.ts e2e/visual.spec.ts`：22 项全部通过，50.8 秒；包含 8 项真实流程与 14 张视觉基线。日志 `/tmp/dawn-dock-final-verified.log`。受影响四张基线复验通过，其余十张原样通过；主目录仍在 clean main `8b5b5e08`。

实际截图（完整窗口与头部分别保存）：`tmp/dock-responsive-tabs-verification/dock-medium*.png`、`dock-wide*.png`、`dock-narrow-current*.png`、`dock-english-dark*.png`。480px 展示六项，720px 九项全展开并隐藏更多，280px 保留当前对话和两个常用项；不同语言/计数下按实测重新分配。

## 边界

真实窗口仅验证 macOS 当前构建，跨平台未验证；后续合并前已补完整单测（含 node/kernel 组）。没有调用付费模型、真实 SSH 或替换安装版。用户后续授权本地提交并合并，分支工作树保留截图证据。

## 用户授权合并后的当轮检查

用户要求测试无问题后合并入 main。再次运行完整 `npm test`：365 文件全部通过，4262 项通过、10 项原有跳过，耗时 76.88 秒（`/tmp/dawn-dock-merge-unit.log`）。再次类型检查与构建通过（`/tmp/dawn-dock-merge-types.log`、`/tmp/dawn-dock-merge-build.log`）。本轮未修改产品代码、基线、容差或 mask。

再次运行 22 项真实 Electron/视觉检查全部通过，耗时 51.5 秒（`/tmp/dawn-dock-merge-electron.log`），包括 14 张基线。审查已发现的焦点问题均有先红后绿证据及复审结论，本轮没有新增产品修改。按用户授权本地提交并以 fast-forward 集成到 main；不推送、不替换安装版，保留工作树用于既有截图引用。
