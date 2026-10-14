# 输入框下方统计与消息操作行验证

当前分支 `codex/compact-conversation-header`，工作树 `/Users/liuyue/.codex/worktrees/compact-conversation-header/dawn-science`。继续前一轮紧凑标题改动，未提交、合并、推送或替换安装版。

## 行为

- 参考本地 DeepSeek Harness 的 `StatsPills.tsx` / `StatsPills.module.css`：会话累计信息置于输入卡外侧下方，12px 次要文字、居中，窄栏自然换行。
- 轮数、工具次数和耗时、输入/输出/缓存 token 与缓存命中率沿用既有 SessionUsage 数据聚合，主区/侧边各用自己的转录。没有 usage 时不显示统计；没有加入未上报的生成速率指标。
- 用户时间戳进入复制、编辑、撤回所在操作行，保留原 dateTime 和未知时间文案。待确认或本地回显消息仅有时间。短气泡保持独立宽度；窄栏收起撤回文字，保留可访问名称和操作。
- 主侧输入卡下方同步最大统计自然高度：空侧边与主区对齐，统计换行后仍对齐，关闭侧边或返回空会话释放占位。只共享高度，未共享用量。内容测量与外层 min-height 分离，避免 ResizeObserver 反馈。

## 验证证据

- 新布局 Electron 测试在旧布局先红：累计统计仍在输入框外上方、时间不在操作行；初版移位后绿。
- 既有 1280/1920 输入卡对齐测试随后发现主区有统计、侧边为空时底差28px；同步高度后两项均通过。
- 最终相关 Vitest：8 文件、186 项通过（4.18秒）；包括设计契约、会话视图/搜索/侧边/字号/主题/翻译/附栏行数。日志 `tmp/composer-meta-verification/unit-final.log`。本轮未重复前一轮全量4440项。
- 最终构建 Electron 回归：6 文件、34 项通过（1.5分钟）。覆盖统计/导出/轮次导航/未读、复制/编辑/草稿历史、文件与会话撤回、侧边/API/ACP、1280/1920卡片等高对齐、全局布局及亮暗主题。日志 `regression-final.log`。
- 针对空统计、统计换行、关闭侧栏后高度回落20px、返回新建空态后占位消失追加断言；定向重跑2项通过（5.2秒）。日志 `space-lifecycle.log`。这两项已计入上述34个不同用例。
- 类型检查、Electron/UI构建、git diff --check 均通过。构建保留既有bundle大小提示。原测试动态placeholder定位和写死0.0.25版本断言已改为输入卡textbox与读取package版本；未放宽布局断言或视觉容差。
- 只读复审两次：未发现阻塞项；建议的卸载回落/空统计归零已在Electron补验。
- 亮/暗/窄栏截图均实际查看：`tmp/composer-meta-verification/composer-stats-light.png`、`composer-stats-side-dark.png`、`user-meta-narrow.png`。

## 范围

用量与工具行为由隔离 mock 推理服务产生；证明数据归属、显示与交互正确，不代表真实供应商计费准确性。主仓库保持干净的main状态（ahead 1来自先前工作），应用版本仍0.0.27。本轮仅UI与验证/文档，不引入新的协议或依赖。
