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
  const known = new Set(knownProviders())
  for (const [agentId, def] of Object.entries(reg.agents)) {
    if (def.kind !== "native") continue // pty agent 自带 command，不引用 provider
    if (!known.has(def.provider)) {
      throw new Error(
        `agent "${agentId}" 引用了 pi 不认识的 provider "${def.provider}"。` +
          `可选：${knownProviders().sort().join(", ")}`,
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
 * 全新安装时写出的默认配置。
 *
 * **它是一份模板，不是一坨机器产物**——所以带注释。用户打开它时应当立刻
 * 明白能改什么；一个只有键值对的文件只会让人去翻文档。
 *
 * 选这三个 agent 的理由：
 *   - `ds-chat` 便宜、够用，是"先跑起来"的默认
 *   - `claude` / `codex` 走 PTY 托管本地 CLI，**不需要在这里配 key**
 *     （它们用各自 CLI 已有的登录），所以在没填任何 key 时也能直接用
 */
export const DEFAULT_CONFIG_YAML = `# DAWN Science —— agent 配置
#
# 这份文件是第一次启动时自动生成的，可以随意修改；DAWN 不会覆盖它。
# 改完重启应用生效。
#
# 两种 agent：
#   kind: native  —— 由 DAWN 内置的 agent 直接调模型 API，需要在「设置」里填 key
#   kind: pty     —— 托管一个本地命令行 agent（claude / codex），
#                    用它自己的登录，**不需要在 DAWN 里配 key**

agents:
  # 内置 agent。用前先到「设置」里填 deepseek 的 API key
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]

  # 托管本地的 claude CLI。装了 claude 且已登录就能直接用
  claude:
    kind: pty
    command: claude
    args: []
    capabilities: [chat, exec]

  # 托管本地的 codex CLI
  codex:
    kind: pty
    command: codex
    args: []
    capabilities: [chat, exec]
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
