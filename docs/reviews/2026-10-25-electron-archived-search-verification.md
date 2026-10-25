# 剩余 Electron · 归档临时会话搜索验证

基线5b0d4b4a，独立codex/electron-archived-search。真实产品缺陷：搜索归档临时会话时，取消归档只刷新项目摘要与任务，临时摘要未就绪便选中；后续项目列表更新时摘要两处暂缺，ConversationView被卸载/重挂，刚消费的命中高亮消失。

## 根因证据与最终修复

原Electron稳定失败。诊断先看到命中约4ms后被移除；第一版DOM观察方案及4条单测/全量虽通过，真实Electron仍失败，已撤回未提交。继续记录active/selected及MOUNT，确认整段因临时摘要缺失重挂，不能在旧子树补标记解决。所有诊断/短超时及第一版源码另存外部，不留在最终源码或E2E。

最终在原取消归档并打开流程中，选中前等待loadTempSessions。项目/任务/归档数刷新顺序保留；不新增DOM观察、计时器、协议或高亮期限，不改原session-search E2E。

新增App级异步gate回归先失败s1/s2：临时摘要未就绪时已切到s1。修后等待在s2，摘要完成后命中可见；模拟项目列表不含临时会话，恢复行DOM不更换、高亮保持。原搜索跳转用完撤销/跨会话隔离检查保持。

## 验证

- 相关3文件19项通过；类型与完整构建通过。
- 原归档失败项1/1（4.9秒）；完整搜索、归档、恢复、会话查找4文件18/18（59.1秒）。
- 最终全量Vitest499文件，5290通过、10跳过（116.05秒）。第一版5293的结果明确不作为修复通过证据。
- 自审仅App一处等待和对应回归，search-jump/views/E2E均与基线一致；git diff --check通过。主目录集成复验另记。

证据：/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-remaining-electron/archived-search/，包含原始/分层失败、已撤回尝试、最终完整日志/源码SHA256与diagnosis-notes；原run-24、首次方案run-25、最终run-26/27。

不将mock模型/SSH说成真实供应商验收，不推送、不替换安装版。
