# 项目与服务器会话页签进入顶栏验证

分支`codex/compact-conversation-header`，工作树`/Users/liuyue/.codex/worktrees/compact-conversation-header/dawn-science`。未提交、合并、推送或替换安装版。

## 结果

- 同项目/服务器的一段或多段会话都在全局顶栏横排，选中页签承担当前标题。主内容区没有旧页签行，顶栏没有重复单标题。临时散会话保持原顶栏单标题。
- App持有稳定SessionTabs，位于keyed ConversationView外。会话动作/远端信息使用相邻稳定portal插槽。切换只更换对话内容与动作，不丢页签DOM或键盘焦点。
- 页签16px/24px/500，等宽，溢出横向滚动；ResizeObserver在宽度变化后将当前页签保留在视野中，卸载时断开观察。当前会话摘要、运行/未读圆点、关闭归档、新建、排序和放坞回调沿用既有状态。

## 实际验证

- 旧布局2项Electron先失败：tablist在内容区，不在topbar。初版移位后17项回归通过。
- 复审发现页签置于keyed ConversationView内部，键盘切换导致焦点落body；新增Enter切换后的聚焦断言先失败，再改为App稳定顶栏承载。复审用React DOM确认节点身份与焦点保持，无新阻塞项。
- 最终Vitest5文件135项通过（5.01秒），`tmp/topbar-tabs-verification/unit-final.log`。回显时间行的旧断言更新为有时间、无复制/修改等按钮，符合上一轮已授权行为；未改变产品回显逻辑。
- 类型检查及Electron/UI构建通过，`typecheck-final.log`、`build-final.log`。仅保留既有bundle大小提示。
- 最终Electron7文件18项通过（44.9秒），`electron-final.log`：单会话、两段并列、关闭相邻/最后一段、7段窄窗收纳、键盘切换焦点、排序与重载、运行/未读圆点、主侧隔离、查找快捷键、输入卡统计/动作行、顶栏边界和亮暗主题。
- 服务器用例新增一段/多段均在topbar、main无旧页签的检查；3个独立标题切换，在900px窗口+宽侧栏下，标题/动作/导出/远端信息均保持窗口内，标题宽度仍大于60px。固定假SSH不代表真实SSH运行验收。
- 截图实际查看：`one-session.png`、`two-sessions-light.png`、`two-sessions-narrow-dark.png`、`many-sessions.png`、`server-sessions-narrow.png`，保存在同一tmp目录。未修改视觉基线或放宽几何容差。
- `git diff --check`通过。主仓库保持干净main（ahead 1为之前已有提交），本轮无协议/依赖/版本变更，版本仍0.0.27。前轮已确认的全局归档跳转高亮基线问题未纳入本轮通过项，也未修改其逻辑。
