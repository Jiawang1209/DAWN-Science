# 终端启动 UTF-8 兜底修复与验证

日期：2026-10-26（Asia/Shanghai）。基线：main `c7dc9c3b`。分支：`codex/terminal-utf8-fallback`。

## 原因与实现

Finder/launchd 启动的应用可能没有 LANG、LC_CTYPE、LC_ALL。原 PTY 仅继承环境，zsh 因而使用默认 C locale。中文路径被转义为 `\\M-`，中文输入被拆为字节；右侧状态提示符中的 `↵` 也会计算错宽度，使终端实际光标停在 `$` 之前，触发进入 DAWN 模式的空闲提示符检查。

真实 zsh 对照：相同 `user@host ~/Desktop/test$ ` 左提示符和 `130 ↵` 右提示符，C 环境的光标列为 24，光标前内容缺少 `$ `；en_US.UTF-8 下光标列为 26，包含完整 `$ `。

新增 `src/runtime/pty-environment.ts`，在合并父进程、CLI 隔离环境及会话环境后调用。当 LANG、LC_CTYPE、LC_ALL 全部未设置或为空时，macOS 补 LANG=en_US.UTF-8，其他 Unix 补 LANG=C.UTF-8。显式 locale（包括有意设置的 C/POSIX）按原有优先级保留；Windows 保持原行为。不修改父进程环境、用户 shell 配置、系统设置或终端控制守卫。

## 自动验证

- 将修复前的原 PTY 实现临时恢复，4 个真实 zsh 回归用例均失败；恢复修复后均通过。
- 重点单元、PTY 集成、终端控制及 CLI 回归：9 文件、63 项通过。
- `npm run typecheck`、`npm run build`：通过。
- 新增 `e2e/terminal-utf8.spec.ts`：真实 Electron 1 项通过（6.2 秒）。覆盖空 locale、中文目录、中文输入与退格、文件真实写入、Unicode 右提示符、Ctrl-C、进入 DAWN 及返回 Normal；使用测试模型，无真实模型请求。
- 没有运行完整项目测试集。Linux/Windows 的纯环境策略有单元覆盖，本轮真实 PTY/Electron 验证在 macOS。

构建仍有项目既有 direct-eval 与大分块警告。Electron 用例日志包含页面加载 -3 及 Bot 恢复送达诊断；用例的中文与模式切换断言、应用退出均通过，没有据此改动其他模块。

## 隔离预览及视觉检查

使用 `/Users/liuyue/Library/Application Support/DAWN Science Dev Preview/launch-preview.sh`，显式传入本分支 worktree，并移除父进程的三个 locale 变量。保留原隔离资料；原安装版未替换。独立后台 QA 窗口沿用真实构建、用户的 zsh 配置和 xterm 渲染。关闭后台测试窗口并移除了临时调试探针；终端清理操作误影响了原有终端，不能声称保留了原终端进程，详见下方退出事件记录。主预览进程继续运行。

| 检查项 | 功能及视觉证据 |
| --- | --- |
| 中文工作目录和未提交输入、中文退格 | `artifacts/terminal-utf8/01-chinese-path-input.png` |
| 命令执行后的中文输出 | `artifacts/terminal-utf8/02-chinese-output.png` |
| 从中文目录进入 DAWN，路径仍正常 | `artifacts/terminal-utf8/03-dawn-mode-chinese-directory.png` |
| `who you are?` 的正常 Shell 通配符错误、Ctrl-C 后 `130 ↵` 空提示符 | `artifacts/terminal-utf8/04-idle-right-prompt.png` |
| 相同状态可以再次进入 DAWN，无空闲提示符误拦截 | `artifacts/terminal-utf8/05-reenter-after-ctrl-c.png` |
| 900×668 内容区的中文换行和输出 | `artifacts/terminal-utf8/06-narrow-chinese-output.png` |

检查了 1280×808 和 900×668 内容区，文档宽高分别等于视口宽高。截图未见乱码、控制字节转义、中文缺字或横向溢出。输入验证通过终端键盘/文本自动化完成，未切换或重配系统输入法。

详细日志在 `artifacts/terminal-utf8/checks/`。以上为分支验收记录；现已本地合并 main，集成复核见末节。未推送、未发布。


## 预览终端误关闭事件与恢复

用户反馈自动退出后只读核对确认：代码没有按总会话时长或空闲时间自动退出 DAWN 模式的定时器。CLI 每 120 秒续租；15 秒为初次连接超时，并非会话有效期。

2026-10-26 08:49:42.683 和 08:49:42.724（Asia/Shanghai），原终端 `d8d63f77-ad21-4512-9174-14004296e74b` 与测试终端 `03c8695a-f90d-4a15-ba15-fee84e0f8091` 被标为 exited，与本轮清理操作一致。这是验证操作对用户运行态的误干扰，不是编码修复引入的会话到期机制。此前对“保留原终端”的报告不准确，已在上方更正。后续终端清理仅针对独立自动化夹具中的确切身份，不再通过用户共享预览中的显示编号执行。

原对话 `70323eba-7a6d-4511-9d14-ccba4d61e02a` 未删除，快照仍有 15 个条目。已创建新终端 `378dd5b9-14b6-4f8c-ab3b-d63a65beabbe`，通过 setTerminalAgentMode 的 resumeSessionId 按原身份接续；接口核验返回 mode=dawn、原 sessionId 及 deepseek/deepseek-flash。恢复未发送任何新的模型提问。此操作恢复对话历史，已结束的旧 Shell 进程本身无法复活。


## 合并前复核

用户已授权合并入本地 main。独立只读审查未发现阻断问题；环境覆盖顺序、显式 locale 保留、Windows 不变和测试覆盖均符合本轮范围。

重新执行：9 文件 / 63 项重点测试通过，typecheck 与完整 build 通过，新增真实 Electron 回归 1 项通过（6.6 秒）。本轮全部运行使用独立自动化夹具，未操作正在使用的预览终端。日志保存在 `artifacts/terminal-utf8/checks/premerge-*.txt`。


## 本地 main 集成复核

在确认主 checkout 干净且位于 main 后，以 `git merge --ff-only codex/terminal-utf8-fallback` 将 main 从 `c7dc9c3b` 快进到修复提交 `c3f3deb4`。

随后在 `/Users/liuyue/Desktop/Github_repos/dawn-science` 实际主 checkout 执行：8 文件 / 50 项重点测试通过，typecheck 与完整 build 通过，中文路径、输入编辑、文件写入和 DAWN/Normal 切换的真实 Electron 回归 1 项通过（6.7 秒）。合并前额外运行的 13 项 CLI 测试也已通过，未将重复运行累计为不同测试数。日志保存于 `artifacts/terminal-utf8/checks/main-*.txt`。

本轮未重启、关闭或清理用户正在使用的预览终端。保留分支 worktree 及现有预览进程；未推送、未修改安装版或系统配置。
