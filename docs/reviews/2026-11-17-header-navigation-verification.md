# 顶栏导航与功能提示验证

日期：2026-11-17。分支：`codex/header-navigation`，从 `main@629bf4bc` 建立独立 worktree。

## 结果与边界

返回首页纯箭头位于 Logo 左侧，三颗导航图标统一32×32px并居中；按钮与Logo视觉间距1px。完整品牌保留18px字体，品牌图标与文字间距8px，最窄宽度下尾字不裁切。展开侧栏默认/最小300px、最大420px；旧窄偏好夹到新下限，更宽合法偏好保留。顶栏与侧栏边界重合，折叠时仅隐藏分界线并保持控件位置，768px以下按既有窄窗行为隐藏侧栏。

顶栏事件委托使用原生DOM事件，覆盖React portal注入的控件；提示挂在body，不增加布局包装。已覆盖返回、Logo新建任务、折叠、快捷键、页签/关闭/新建、面板及关联脚本入口。按钮可及名称和原动作保持；首页仍读作“首页”，提示为“返回首页”。鼠标250ms后、键盘即时显示；离开、失焦、Escape、点击、滚动、窗口缩放、进入首页/引导及卸载清理。aria-describedby保留已有描述。

## 验证证据

- `npm test -- --project ui`：244文件、2356测试通过。包含新Topbar生命周期、取消定时器、portal事件和原首页/草稿/会话测试。
- `npm run typecheck`：通过。
- `npm run build`：通过。已有direct-eval和大chunk提醒保留，未改打包配置。
- Electron组合回归：`header-navigation`、`app-home`、`topbar-session-tabs`、`sidebar-size`、`sidebar-collapse`、`sidebar-spacing`、`workspace-ui-polish`、`conversation-find-shortcut`，30通过、1条既有明确跳过（展开动画不压缩的历史取舍）。
- 末次品牌内距细调后，增加完整标签不裁切断言，复测居中/边界/草稿/中英文/键盘、折叠位置、300–420px/窄窗/分组布局：5通过。
- `npm run security:check`：通过，输出脱敏，不含用户凭证。
- 原生Electron截图探针：箭头中心偏差dx=0、dy=0，按钮与Logo间距1px，导航与侧栏右边界差0；另验证完整品牌文字未裁切、折叠恢复、提示清理与草稿保留。

本地日志：`/tmp/dawn-header-all-ui.log`、`/tmp/dawn-header-regression-final.log`、`/tmp/dawn-header-layout-final.log`、`/tmp/dawn-header-types.log`、`/tmp/dawn-header-build.log`、`/tmp/dawn-header-secrets.log`。

## 发现与修正

1. 原React委托无法收到从其他组件portal进来的按钮事件。先用独立portal回归复现，再改为仅作用于顶栏DOM的原生委托；六条提示组件测试及实际控件通过。
2. 早期折叠导航改成内容宽，开关会跳动3px。保留导航几何，仅令分界线透明，既有“开关原位”回归通过。
3. 截图/DOM交叉复核发现完整品牌末尾越出按钮约3px。收紧品牌内部图文间距4px，添加完整文字边界断言后通过。
4. 新Electron用例最初对点击后未移开鼠标再次hover、正文工具按钮位置以及夹具强制中文的假设不正确；分别按实际事件重新进入、按真实顶栏范围取控件、用既有init-script方式测试英文。初次失败材料保存在`/tmp/dawn-header-first-e2e-failure`及`/tmp/dawn-header-regression-initial`，没有放宽断言或更新视觉基线。

## 视觉与运行隔离

截图由功能分支真实dist构建的Electron窗口生成，无临时DOM/CSS布局覆盖：

`/Users/liuyue/.codex/visualizations/2026/11/15/01a1dd44-1bf3-7981-9109-f81e832a348e/dawn-header-implemented-20261117/`

包含`header.png`、`back-tooltip.png`、`keyboard-tooltip.png`、`workbench.png`、`collapsed.png`。探针脚本保存在`/tmp/dawn-header-implemented-preview.mjs`。

只使用隔离profile、配置、数据库、workspace、CLI、skills/memories/agents/scratch/downloads，以及mock keychain/假凭证/假模型。正式App配置和数据未修改。此处确认的是macOS本地Electron/UI路径，未声称真实模型、远端服务或Windows/Linux运行验收；此次没有改模型/Agent/后端协议。保留功能分支，未合并、推送、发布或替换正式App。
