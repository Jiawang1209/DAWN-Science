# 完整单行品牌、侧栏加宽与菜单导出验证

继续`codex/compact-conversation-header`工作树`/Users/liuyue/.codex/worktrees/compact-conversation-header/dawn-science`；未提交、合并、推送或替换安装版。

## 最终行为

- 按用户明确要求，DAWN Science始终完整单行，不隐藏、不折行、不缩小；品牌仍32px图标与20px文字。默认/最小展开侧栏统一336px，上限420px，给品牌、三个32px按钮与8px间距留够空间；顶栏导航右边界与侧栏对齐，收起后完整品牌与按钮继续同排。
- 旧存储宽度由原clamp清洗到336px新下限；右坞无实际侧栏宽度时复用同一下限，避免遗留200px兜底。
- 顶栏下载图标收入⋯菜单的“导出对话”。保留查找项及快捷键，增加上下/Home/End菜单导航、跳过禁用项；选择导出后关闭菜单并回到trigger。沿用原导出中状态、成功/失败提示及落盘位置；空会话不提供导出，侧边原文字入口保留。

## 实际验证

- 名称恢复/菜单导出2项Electron与2项菜单单测先红后绿。用户进一步明确必须单行后，新nowrap/同排/边界断言再次先红，再通过加宽侧栏修复。
- 最终相关Vitest7文件171项通过，4.71秒；菜单、侧边会话、设计契约、搜索、App交互、侧栏持久化、坞宽边界。日志`tmp/brand-export-verification/unit-single-line-final.log`。
- 最终类型检查和Electron/UI构建通过，`typecheck-single-line.log`、`build-single-line.log`；保留既有bundle大小提示。
- 最终Electron8文件22项通过，56.9秒；默认/最小/最大侧栏、收起、900px、宽度和折叠重开记忆、鼠标/键盘拖动、品牌按钮顺序与边界、项目/服务器多会话、当前查找、菜单键盘导出及实际文件保存。日志`electron-single-line-final.log`。
- 普通会话导出到隔离下载目录、项目会话导出到项目docs；均读取实际Markdown文件核对原文与轮数。菜单导出后焦点回到⋯，相关136项之前批次也已通过，最终以171项计。
- 原sidebar-size中两项期待旧内嵌搜索框/搜索展开侧栏的断言已在原main基线确认失败（参见紧凑顶栏验证报告），本轮未改变相关行为，最终明确排除且不计入22项。未降低布局阈值、未修改视觉基线。
- 只读复审无阻塞项，并同步了侧栏默认值、CSS令牌及坞兜底下限；旧248px存储实际验证会变为336px。
- 实际查看最终`brand-default.png`、`brand-minimum.png`与`export-menu.png`，均在同一tmp目录；名称单行、导航对齐、顶栏无独立下载、菜单两项清楚。
- `git diff --check`通过；主仓库仍为干净main（ahead 1来自之前提交）。无协议、依赖或版本变化，版本0.0.27。测试使用隔离mock/假SSH，不影响真实会话与安装版。
