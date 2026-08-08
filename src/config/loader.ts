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
import { readFileSync } from "node:fs"
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
