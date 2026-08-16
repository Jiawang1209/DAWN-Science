/**
 * 配置加载：读 YAML → schema 校验 → provider 引用校验。
 *
 * **2026-08-08 返工 R2 的两处变化：**
 *
 * 1. **不再展开 `${ENV}`。** 原来配置里可以写 `apiKey: ${DEEPSEEK_API_KEY}`，
 *    加载时展开环境变量。现在配置文件里根本没有凭证字段——凭证由 app 的凭证库按
 *    **provider** 管，pi 另有 `getEnvApiKey()` 认 `OPENAI_API_KEY` 这类既有环境变量。
 *    **一整套 `${ENV}` 展开与「未解析即丢弃」的逻辑因此整体删除**，
 *    它服务的那个需求已经不存在了。
 *
 * 2. **引用完整性校验从「agent → endpoint」改为「agent → pi 的 provider」。**
 *    拼错一个 provider 名不该留到建会话时才崩，加载期就该报错并列出可选项。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { parse as parseYaml } from "yaml"
import { getBuiltinProviders } from "@earendil-works/pi-ai/providers/all"
import { ProviderRegistrySchema, type ProviderRegistry } from "./schema.js"

/**
 * pi 内置的全部 provider id。
 *
 * 缓存一次：`getBuiltinProviders()` 每次都会重建 provider 实例，
 * 而我们只要名字。R1 实测 pi 自身在一次会话里就会遍历它上百次。
 */
let cached: string[] | undefined
export function knownProviders(): string[] {
  if (!cached) cached = getBuiltinProviders().map((p) => String(p))
  return cached
}

/**
 * 校验 agent 引用的 provider 确实存在。
 *
 * zod 只能校验单个节点的形状，管不了「这个 provider 名字是否真的存在」。
 * **注意这里不检查凭证**——凭证的有无是运行时状态，不是配置错误
 * （桌面应用不该因为还没填 key 就起不来）。
 */
function assertProviders(reg: ProviderRegistry): void {
  /**
   * **认得的 = pi 内置的 + 你自己声明的**（2026-08-10）。
   *
   * 此前只认 pi 内置那 40 个。加了 `providers:` 这一段之后，
   * 一个自建端点（vLLM / Ollama / 任何 OpenAI 兼容网关）注定不在内置清单里——
   * 只认内置的话，**用户刚写完连接设置，应用就起不来了**，
   * 而错误信息会说「pi 不认识」，把人往「是不是拼错了」的方向带。
   */
  const known = new Set([...knownProviders(), ...Object.keys(reg.providers ?? {})])
  for (const [agentId, def] of Object.entries(reg.agents)) {
    if (def.kind !== "native") continue // pty agent 自带 command，不引用 provider
    if (!known.has(def.provider)) {
      throw new Error(
        `agent "${agentId}" 引用了不存在的 provider "${def.provider}"。` +
          `**自建的端点要先在 \`providers:\` 段里声明地址**（baseUrl / api / models）。` +
          `pi 内置的可选：${knownProviders().sort().join(", ")}`,
      )
    }
  }
}

export function loadRegistry(file: string): ProviderRegistry {
  const raw = parseYaml(readFileSync(file, "utf8")) as unknown
  const registry = ProviderRegistrySchema.parse(raw)
  assertProviders(registry)
  return registry
}

/**
 * 全新安装写出的那台终端**开的是哪个 shell**（2026-08-16）。
 *
 * 作者问：*「我是 Mac 所以直接有终端，那么如果是 windows 呢？」*
 * 去看了一眼——**上一版把 `bash` 写死在模板里**，而 Windows 上没有这个东西
 * （除非人自己装了 Git Bash 或 WSL）。那台终端会起不来，
 * 而症状是「点新开什么也没发生」：一个平台被整个漏掉了。
 *
 * `node-pty` 在 Windows 上走 ConPTY，本身是通的——缺的只是一个存在的命令。
 * 选 `powershell.exe` 而不是 `pwsh`：前者随系统装，后者要自己装。
 *
 * **写进模板一次，此后归用户**：配置文件生成之后我们绝不覆盖它
 * （见下面那段），所以这里选错了就是选错了，改回来也不会追溯。
 */
export function 默认终端(平台: NodeJS.Platform = process.platform): {
  command: string
  args: readonly string[]
} {
  // `-i` 是交互式：没有它，`.bashrc` 不加载，PATH 与别名都跟人手敲的不一样
  return 平台 === "win32" ? { command: "powershell.exe", args: [] } : { command: "bash", args: ["-i"] }
}

/**
 * 全新安装时写出的默认配置。
 *
 * **它是一份模板，不是一坨机器产物**——所以带注释。用户打开它时应当立刻
 * 明白能改什么；一个只有键值对的文件只会让人去翻文档。
 *
 * 选这几个 agent 的理由：
 *   - **不摆任何 native agent**（2026-08-10）：摆哪一家就是在替用户选，
 *     而「填了 key 就自动有 agent」之后它也不再必要
 *   - `claude` / `codex` 用各自 CLI 已有的登录，**不需要在这里配 key**，
 *     所以在没填任何 key 时也能直接用
 *   - `shell` 是一个**通用终端**——跑任意命令，也可以在里面手动起
 *     claude / codex 的 TUI
 *
 * ## 2026-08-09（①-C · C5）：claude / codex 从 `pty` 改成 `cli`
 *
 * 作者试用后的原话：*「应该是和 deepseek 这种样式，我从对话框里面输入内容」*。
 * 走 `pty` 时它们是一个终端；走 `cli` 时它们是对话——而且**它们干的活
 * 第一次落进账本**（走 PTY 时一个 claude 会话只有一条 `pty_session` Run，
 * 因为 ANSI 字节流里没有「工具调用」这个概念）。
 *
 * **终端没有被取代，是被摆正了**：它作为 `shell` 保留，定位是作者说的
 * *「类似 codex app 的感觉，里面有一个终端，也可以开启 codex cli 和 claude cli」*。
 *
 * **已存在的配置不改**（`loadRegistryOrDefault` 的既有纪律：用户的配置比
 * 我们的默认值重要）。所以升级前装过 DAWN 的人，他的 claude/codex 仍是终端形态——
 * **那不是坏的，是他配置里写的那样**。想换成对话形态，把 `kind: pty` 改成
 * `kind: cli` 即可。
 */
export const DEFAULT_CONFIG_YAML = `# DAWN Science —— agent 配置
#
# 这份文件是第一次启动时自动生成的，可以随意修改；DAWN 不会覆盖它。
# 改完重启应用生效。
#
# 三种 agent：
#   kind: native  —— 由 DAWN 内置的 agent 直接调模型 API，需要在「设置」里填 key
#   kind: cli     —— 托管一个本地命令行 agent（claude / codex）并**以对话形态呈现**，
#                    用它自己的登录，不需要在 DAWN 里配 key。
#                    它的工具调用会落在账本上（项目概览里看得到）
#   kind: pty     —— 一个**终端**：跑任意命令，也可以在里面手动起 claude / codex 的 TUI
#   kind: kernel  —— 一个 **Jupyter 内核**（Python / R）：不思考，只执行你给的代码，
#                    输出是结构化的（图、表、报错各是一种东西，不是一段文本）
#
# 内核**刻意没有预置**：kernelspec 的名字随机器而变，
# 预置一个必然在别人机器上起不来。先到「设置 → 内核」看本机有哪些名字
# （那一页连解释器路径一起列出来，免得三个 conda 环境分不清哪个是哪个），
# 再照下面这样写：
#
#   py:
#     kind: kernel
#     command: python3        # ← kernelspec 的**名字**，不是解释器路径
#     capabilities: [exec]
#
#   r:
#     kind: kernel
#     command: ir
#     capabilities: [exec]

agents:
  # 这里**故意没有内置 agent**（2026-08-10）。
  #
  # 从前这儿摆着一个 ds-chat（deepseek）。作者的话：*「我们如果之前没有配置
  # 任何 API key 的时候，其实不一定要默认就设置 deepseek，因为给人一种我们
  # 只能配置 deepseek 的错觉感。」* 他是对的——**默认摆哪一家，就是在替用户选**。
  #
  # 现在不用摆了：**到「设置 → 凭证」里给任意一个 provider 填 key，
  # 它就会自动出现在对话的选择器里**（pi 认识 40 个）。
  # 想钉死某个模型、或者用自建端点，再手写到这里也行。

  # 托管本地的 claude CLI，以对话形态呈现。装了 claude 且已登录就能直接用
  #
  # models = 模型选择器里能选哪些。
  # claude 没有可供查询的模型清单，所以在这里写；别名取自 claude --help 的说明
  # （fable / opus / sonnet），也可以写完整名如 claude-fable-5。
  #
  # **刻意不写 model。** 写了它就等于给 CLI 传 --model，
  # 会盖掉你自己 ~/.claude/settings.json 里的选择。不写时选择器照常显示，
  # 当前那格标「CLI 默认」——那是实情。真想钉死某个模型时才写 model。
  claude:
    kind: cli
    command: claude
    # 想更快？加上 --bare：实测首字节 1647ms → 319ms、整轮 6.3s → 0.9s（7 倍）。
    # 代价是它会跳过 hooks、LSP、插件同步、auto-memory，以及 CLAUDE.md 自动发现——
    # 在项目里干活时丢掉 CLAUDE.md 是实质的行为变化，所以默认不加。
    #   args: ["--bare"]
    args: []
    models: [opus, sonnet, fable]
    capabilities: [chat, exec]

  # 托管本地的 codex CLI，以对话形态呈现。
  #
  # **不写 models**：codex 的清单 DAWN 会自己去
  # ~/.codex/models_cache.json 里读（只取 visibility 为 list 的，按它的 priority 排）。
  # 想覆盖就自己写一行 models: [...]，配置声明优先于自动发现。
  codex:
    kind: cli
    command: codex
    args: []
    capabilities: [chat, exec]

  # 一个通用终端。想用 claude / codex 的 TUI，在这里手动起即可
  shell:
    kind: pty
    command: ${默认终端().command}
    args: ${JSON.stringify(默认终端().args)}
    capabilities: [exec]
`

/**
 * 加载配置；**文件不存在就先写一份默认的**。
 *
 * 全新安装必然撞上缺文件这条路：`loadRegistry` 里的 `readFileSync` 会抛
 * ENOENT，而默认路径此前还是 `process.cwd()`——打包后的桌面应用，
 * cwd 是个任意目录。**结果是「装好了，打不开」，且没有任何可执行的提示。**
 *
 * 已存在的文件**绝不覆盖**：用户的配置比我们的默认值重要，
 * 哪怕它当前是坏的——坏的配置应当报错让人去修，而不是被悄悄替换掉。
 */
export function loadRegistryOrDefault(file: string): ProviderRegistry {
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, DEFAULT_CONFIG_YAML, "utf8")
  }
  return loadRegistry(file)
}
