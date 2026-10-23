# DAWN 命令行 Agent

Normal 是你正在使用的 Shell。运行 `dawn` 进入 Agent，输入 `/exit` 回到同一个 Shell。系统终端和 DAWN 的原生终端都能使用相同入口；不会在桌面里增加第二套聊天框。

## 复用桌面模型

DAWN 内置终端上方可直接点 **DAWN 模式 / Normal 模式**。DAWN 模式在原终端启动 `dawn`，默认跟随所属对话当前选择的本地 API 模型；Normal 结束这段 CLI Agent 并返回原 Shell。手动输入 `dawn` 和 `/exit` 也会同步按钮。请在空闲 Shell 提示符切换；Python/R、忙碌程序或尚未提交的输入会阻止启动。

CLI 通过私有本机连接使用桌面的运行时、模型服务地址和凭证库，无需重新填写 key。密钥留在桌面进程中；CLI 获得的连接令牌只用于本次本机连接。每段 CLI 使用自己的桌面会话，退出不会中止原主对话。桌面托管工具使用桌面的运行环境，工作区采用 CLI 启动目录；原 Shell 的目录、导出变量和进程在返回时保留。

源码 `bin/dawn` 也能发现运行中的开发版桌面连接；桌面需先打开一份内置终端。显式 `DAWN_CLI_DESCRIPTOR` 可指定连接，显式 `DAWN_CLI_HOME` 且未指定连接时使用下方独立模式，避免测试误连真实模型。

## 源码版独立启动

在仓库中先运行 `npm ci` 和 `npm run build:cli`，然后 `./bin/dawn --help`。Node.js 需要 22 或更高版本，原生依赖使用与运行环境匹配的版本。

CLI 配置默认为 `~/.dawn/cli/providers.yaml`；首次运行会创建模板。也可以显式指定 `DAWN_CONFIG=/绝对路径/providers.yaml`。配置格式与桌面版相同，只包含 Agent、服务地址、模型和能力，不包含密钥。

CLI 从所用服务的标准 API key 环境变量读取凭证，例如 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`。自定义服务可以使用 `DAWN_API_KEY`。未连接桌面时才需要这套独立凭证；不要把密钥写进配置文件、命令参数或开发记录。

从任何项目目录运行仓库 `bin/dawn` 的绝对路径，就以该目录为工作区。如果希望当前 Shell 能直接使用 `dawn`，可以仅在本次 Shell 会话把仓库的 bin 目录加入 PATH；开发预览采用这种方式，不修改系统 PATH 或 Shell 启动文件。

```sh
export PATH="/你的源码绝对路径/bin:$PATH"
cd /你的项目
dawn
```

`dawn --agent <名称>` 选择配置中的本地 API Agent。`npm run dawn` 仍是仓库开发入口；旧 agents / run / sessions / demo 辅助命令保留，旧 sessions 查看的是其原有 DAWN_DB 数据库，不等同于新 CLI 的独立运行记录。

## 使用

直接输入问题，Agent 按需读写文件、执行工具。输入 `/status` 查看模型、目录和记录位置，`/help` 查看帮助，`/exit` 或空闲 Ctrl-C 退出。执行期间 Ctrl-C 只中止当前回合，之后可以继续提问。

桌面连接沿用 DAWN 当前权限模式，独立模式默认“问一句”。遇到权限确认时，输入选项编号或 y / n。问题按原有问答协议逐题呈现，可选择编号或输入自己的答案。管道输入会按行串行处理，EOF 等待当前任务收尾；无法交互确认的权限和问题会拒绝/取消并以失败退出码出声，不会自动批准。

## 目录、环境和记录

独立模式继承启动时的 cwd 和导出的环境变量。它是原 Shell 启动的子进程；其工具内的 cd / export 不会改写父 Shell，原 Shell 的局部变量和已有 Python/R 解释器内存也不会凭空传入 Agent。

独立模式每次 CLI 在 `~/.dawn/cli/sessions/<独立标识>/` 保存数据库和会话材料；`DAWN_CLI_HOME` 可指定其他根目录。不同 CLI 各自拥有数据库，桌面版的活动会话不受其启动对账影响。本版重新运行 dawn 创建新会话，不提供自动恢复上一进程内变量的承诺。

本次桌面连接预览复用已有加密凭证，并使用真实模型验证文件读写；自动回归仍使用隔离的固定模型，不调用真实服务。
