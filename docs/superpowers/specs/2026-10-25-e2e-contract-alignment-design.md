# 本轮 E2E 契约漂移修正

用户授权继续逐项修复 F6。基线 main 37c1f247，前一项布局已独立验收。本切片只校准本轮审查涉及的旧操作入口/宽度断言，不修改产品来迎合测试。

当前批准契约见 DESIGN.md 第 112/116/120 行：默认/最小展开侧栏 292px，上限 420px，数值在 state/sidebar.ts 统一定义。本轮涉及文件中仍硬编码 200px 的最小侧栏断言改用 SIDEBAR_MIN；继续检查菜单/固定入口几何，不放宽越界或换行判据。

非 Markdown 文本预览不显示删除按钮，文件树菜单是入口；本地删除仍须确认可恢复废纸篓、文件实际消失、预览清空和 Run 记账；远端须确认永久删除与不可恢复、树与记账一致。

session-recovery 使用当前“服务器”“保存并连接”“新建远端任务”入口；第二实例拒绝、原会话存活/续发，以及认证失败原因、原 ID 恢复和草稿保留等目标断言保持。

搜索的现行 SearchPanel 独立于导航：名字筛选、无结果提示、Escape 关闭与焦点归还均保留；导航原名单和收起状态不因打开搜索改变。sidebar-size 两处旧搜索断言据此修正。

范围为 remote-connections、session-recovery、sidebar-size 及同时保留最小宽度旧值的 server-navigation/server-status-alignment/ui-refresh-preview。其他未执行的历史 E2E 仍按实证单独评估，不宣称全仓所有 E2E 已通过。完成全量 Vitest 和本轮全部相关 Electron，再本地合并。
