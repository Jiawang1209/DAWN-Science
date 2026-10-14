# 会话查找快捷键与导航对齐验证

继续工作树 `/Users/liuyue/.codex/worktrees/compact-conversation-header/dawn-science`，分支 `codex/compact-conversation-header`。未提交、合并、推送或替换安装版。

## 交付行为

- Ctrl+F/Command+F复用当前会话查找。焦点在侧边会话时只查侧边，否则默认主区；重复调用选中现有关键词，Escape回原焦点，保留两边草稿。
- IME、Alt/Shift组合、弹窗、菜单、终端及非会话坞面板避让。嵌套在会话内的弹窗也在归属判断前排除。
- 顶栏只保留全局搜索放大镜；当前会话查找进入会话更多菜单，显示平台快捷键。侧边保留文字按钮。菜单支持键盘打开、Escape、Tab以及外部点击关闭；菜单卸载后查找关闭回到触发按钮。
- 导航块宽度随实际侧栏宽度，右边界对齐，内部品牌/折叠/搜索/快捷键顺序和8px间距保留；窄块品牌仅显示图标、保留DAWN Science可访问名称，折叠后仍能展开。当前会话标题保持16px/24px/500。

## 实际验证

- 旧实现3项快捷键单测失败，2项Electron失败：无快捷键查找、默认导航边界相差71.26px。新实现通过。
- 复审发现嵌套弹层排除顺序问题，新增定向测试先失败1项再修复；复审确认闭合。菜单Tab关闭时先回触发按钮，避免移除焦点节点。
- 最终相关Vitest：4文件111项通过，2.35秒。`tmp/search-navigation-verification/unit-final.log`。
- 最终类型检查与Electron/UI构建通过。`typecheck-final.log`、`build-final.log`；保留既有bundle大小提示。
- 最终构建Electron：6文件23项通过，59.5秒。`electron-final.log`。覆盖Ctrl/Meta两种修饰键、重复选词、Escape焦点及草稿保留、主/侧隔离、全局浮层避让、默认/拖宽/收合边界、亮暗/900px长标题、工具与预算外历史查找、全局搜索范围/重载/跨项目、输入框统计和操作行。
- 拖宽和展开后的几何检查等待既有侧栏动画结束，边界容差仍1px；未修改视觉基线。
- `git diff --check`通过。截图实际查看：`aligned-default.png`、`search-navigation.png`及亮暗标题截图，位于同一tmp目录。

## 已核实的既有失败

全局搜索“归档了的也搜得到”用例能取消归档并打开正确会话，但`.turns [data-search-hit=true]`未保留目标高亮。当前分支初次回归和定向重验均失败；对干净main重新构建后跑同一用例，出现相同断言失败，日志`main-build.log`、`main-archive-baseline.log`。因此本轮记录为既有问题，未改变归档/全局跳转逻辑；不计入23项通过，也未将整套搜索回归宣称为全部通过。

主仓库保持干净的main状态（ahead 1为之前已有提交）。本轮没有协议、依赖或版本变化，版本0.0.27。测试使用隔离mock推理服务，未影响安装版或真实会话数据。
