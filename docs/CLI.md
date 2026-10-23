# DAWN 命令行 Agent

Normal 是你正在使用的 Shell。运行 `dawn` 进入 Agent，输入 `/exit` 回到同一个 Shell。系统终端和 DAWN 的原生终端都能使用相同入口；不会在桌面里增加第二套聊天框。

## 源码版启动

在仓库中先运行 `npm ci` 和 `npm run build:cli`，然后 `./bin/dawn --help`。Node.js 需要 22 或更高版本，原生依赖使用与运行环境匹配的版本。

CLI 配置默认为 `~/.dawn/cli/providers.yaml`；首次运行会创建模板。也可以显式指定 `DAWN_CONFIG=/绝对路径/providers.yaml`。配置格式与桌面版相同，只包含 Agent、服务地址、模型和能力，不包含密钥。

CLI 从所用服务的标准 API key 环境变量读取凭证，例如 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`。自定义服务可以使用 `DAWN_API_KEY`。它不会读取或解密桌面版凭证库；不要把密钥写进配置文件、命令参数或开发记录。

从任何项目目录运行仓库 `bin/dawn` 的绝对路径，就以该目录为工作区。如果希望当前 Shell 能直接使用 `dawn`，可以仅在本次 Shell 会话把仓库的 bin 目录加入 PATH；开发预览采用这种方式，不修改系统 PATH 或 Shell 启动文件。

```sh
export PATH="/你的源码绝对路径/bin:$PATH"
cd /你的项目
dawn
```

`dawn --agent <名称>` 选择配置中的本地 API Agent。`npm run dawn` 仍是仓库开发入口；旧 agents / run / sessions / demo 辅助命令保留，旧 sessions 查看的是其原有 DAWN_DB 数据库，不等同于新 CLI 的独立运行记录。

## 使用

直接输入问题，Agent 按需读写文件、执行工具。输入 `/status` 查看模型、目录和记录位置，`/help` 查看帮助，`/exit` 或空闲 Ctrl-C 退出。执行期间 Ctrl-C 只中止当前回合，之后可以继续提问。

权限确认沿用 DAWN 的“问一句”策略，输入选项编号或 y / n。问题按原有问答协议逐题呈现，可选择编号或输入自己的答案。管道输入会按行串行处理，EOF 等待当前任务收尾；无法交互确认的权限和问题会拒绝/取消并以失败退出码出声，不会自动批准。

## 目录、环境和记录

Agent 继承启动时的 cwd 和导出的环境变量。它是原 Shell 启动的子进程；其工具内的 cd / export 不会改写父 Shell，原 Shell 的局部变量和已有 Python/R 解释器内存也不会凭空传入 Agent。

每次 CLI 在 `~/.dawn/cli/sessions/<独立标识>/` 保存数据库和会话材料；`DAWN_CLI_HOME` 可指定其他根目录。不同 CLI 各自拥有数据库，桌面版的活动会话不受其启动对账影响。本版重新运行 dawn 创建新会话，不提供自动恢复上一进程内变量的承诺。

开发预览使用固定模型和假凭证验证交互，命令、工具、进程和文件操作是真实执行；该预览不代表任意真实模型任务效果已验证。
