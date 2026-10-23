# DAWN CLI 与单一原生终端工作区验证

## 最终交互

用户确认 Normal 是原 Shell；输入 dawn 进入 DAWN Agent，/exit 返回原 Shell。此前上下重复的终端聊天界面已删除，终端打开后占满主内容区，原对话隐藏并保留草稿。CLI 不启动桌面窗口，复用原 Workbench / NativeRuntime、工具与权限；同一个 bin/dawn 入口在真实 Shell 和隔离 Electron 内置终端验证。

## 自动验证

- `npm run typecheck`：通过，最终日志 `artifacts/dawn-cli/checks/typecheck.log`。
- `npm run build`：通过，包含 Electron、独立 CLI 与 UI；最后工具栏排布调整后 `npm run build:ui` 再通过。现有 chunk 大小提示与浏览器工具的 direct-eval 提示仍会出现，不作为运行成功的证据。
- 最终 `npm test`：467 文件，4974 通过，10 跳过，96.61 秒。日志 `artifacts/dawn-cli/checks/unit.log`。jsdom 的既有 canvas getContext 提示仍出现。
- CLI 专项：2 文件 / 12 项通过，28.60 秒，包含带空格目录、真实工具文件、串行管道 / EOF、真实 Shell PID/cwd/env/stty 一致、交互权限与问题、Ctrl-C、权限未决退出、无凭证、独立并发 CLI、受控模型错误、SIGTERM 以及输出控制字符处理。
- 实际构建 Electron：终端、生命周期、工具选择、方案模式共 27 项通过（1.9 分钟）。最后仅工具栏排布调整后终端与生命周期 13 项再通过（37.6 秒）。两个数字有重叠，不累计为 40 项独立用例。
- 最后 UI 契约 / 双语 2 文件 109 项通过（1.62 秒），没有放宽设计或翻译断言。

## 实际可见预览

同一独立 Electron 窗口，初始 1280×840，并核对 900×700 暗色窗口。Agent 在真实 PTY 中由输入 dawn 启动，执行 pwd / ls，并通过真实 write 工具生成 results/terminal-demo.txt；/exit 后原 Shell PID 30333 继续接收命令，目录一致。随后重新进入 Agent，最终保持 DAWN 提示符可输入。

证据：`artifacts/dawn-cli/preview-evidence.json`；亮色工具输出 `04-agent-final-light.png`；900×700 暗色 `05-agent-dark-900.png`；原 Shell 接回 `06-returned-normal-dark.png`；最终可输入的 Agent `07-final-agent-light.png`。截图通过原生 BrowserWindow 捕获并按实际 CSS 内容尺寸保存；没有以静态网页替代实际应用。最终 0 个可见桌面聊天输入框，1 个原生终端。

预览 profile：`/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/Tdawn-cli-preview-YZ42IF`。模型服务为本机固定场景，使用假凭证；进程、工具、文件与控制交接是真实执行。该验证不代表任意真实模型任务质量或已安装版功能已升级。

## 交付边界

CLI 使用标准 API key 环境变量或 DAWN_API_KEY，不读取桌面加密凭证；独立运行记录避免多进程启动对账互相干扰。重新启动 CLI 创建新会话，父 Shell 的局部变量 / 已有解释器内存不会自动传进子进程。开发预览只为自身子进程配置命令路径，未全局安装或修改 Shell 启动配置。配置方法见 `docs/CLI.md`。

工作继续保留在 codex/terminal-assistance，main 为 38959c57 且干净。没有合并、推送、替换安装版，也没有改动生产密钥或配置。新增代码、日志、文档的命名检查与 diff 检查通过。
