/**
 * 配置加载：读 YAML → 展开 `${ENV}` → schema 校验 → 跨段引用完整性校验。
 *
 * **2026-08-08 行为变更**：`${ENV}` 未解析时**不再抛错**。
 *
 * 理由是作者在首次启动桌面版时指出的：**桌面应用不该因为一个要手写的配置文件
 * 缺了变量就起不来**。凭证应当在 app 里设置，而不是启动前写进文件——
 * 那是 CLI 的思路漏进了产品里。
 *
 * **但原来那条纪律必须保住**：绝不能让 `"${DEEPSEEK_API_KEY}"` 这样的字面量
 * 被当成真 key 发到网络上（那会让错误延后到 401 才暴露，且信息量为零）。
 * 所以未解析的字段是**被丢弃**，不是被保留。
 *
 * 于是失败的时机从「加载配置时」推迟到「建会话时」——那才是真正需要凭证的时刻，
 * 报错也才有可操作性（"该 endpoint 未配置凭证，请在设置里填写"）。
 */
import { readFileSync } from "node:fs"
import { parse as parseYaml } from "yaml"
import { ProviderRegistrySchema, type ProviderRegistry } from "./schema.js"

const ENV_REF = /\$\{([A-Z0-9_]+)\}/g

export interface UnresolvedRef {
  /** 配置里的位置，如 providers.endpoints.deepseek.apiKey */
  path: string
  variable: string
}

export interface LoadedRegistry {
  registry: ProviderRegistry
  /** 未能解析的 `${ENV}` 引用。调用方决定怎么呈现——app 标为未配置，CLI 可提示 */
  unresolved: UnresolvedRef[]
}

/** 丢弃标记：整个字符串恰好是一个无法解析的引用时，该字段被删掉 */
const DROP = Symbol("unresolved")

function expandEnv(
  value: unknown,
  env: Record<string, string | undefined>,
  path: string,
  unresolved: UnresolvedRef[],
): unknown {
  if (typeof value === "string") {
    let missing = false
    const expanded = value.replace(ENV_REF, (_m, name: string) => {
      const found = env[name]
      if (found === undefined || found === "") {
        missing = true
        unresolved.push({ path, variable: name })
        return ""
      }
      return found
    })
    // 只要有一处没解析出来，整个字段作废——半截替换的字符串
    // （如 "sk-" 或 ""）比缺字段更危险，它看起来像个真值
    return missing ? DROP : expanded
  }
  if (Array.isArray(value)) {
    return value
      .map((v, i) => expandEnv(v, env, `${path}[${i}]`, unresolved))
      .filter((v) => v !== DROP)
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([k, v]) => [k, expandEnv(v, env, `${path}.${k}`, unresolved)] as const)
        .filter(([, v]) => v !== DROP),
    )
  }
  return value
}

/**
 * 校验跨段引用完整性：agent → endpoint → model。
 * zod 只能校验单个节点的形状，管不了「这个 endpoint 名字是否真的存在」。
 * 这类错误若不在加载期拦住，会变成运行期起 agent 时才崩。
 *
 * **注意这里不检查凭证**——凭证的有无是运行时状态，不是配置错误。
 */
function assertReferences(reg: ProviderRegistry): void {
  for (const [agentId, def] of Object.entries(reg.agents)) {
    if (def.kind !== "native") continue // pty agent 自带 command，不引用 endpoint
    const ep = reg.endpoints[def.endpoint]
    if (!ep) {
      throw new Error(`agent "${agentId}" 引用了不存在的 endpoint "${def.endpoint}"`)
    }
    if (!ep.models.includes(def.model)) {
      throw new Error(
        `agent "${agentId}" 的 model "${def.model}" 未在 endpoint "${def.endpoint}" 的 models 中声明` +
          `（该 endpoint 已声明：${ep.models.join(", ")}）`,
      )
    }
  }
}

export function loadRegistryDetailed(
  file: string,
  env: Record<string, string | undefined> = process.env,
): LoadedRegistry {
  const raw = parseYaml(readFileSync(file, "utf8")) as unknown
  const unresolved: UnresolvedRef[] = []
  const expanded = expandEnv(raw, env, "providers", unresolved)
  const registry = ProviderRegistrySchema.parse(expanded)
  assertReferences(registry)
  return { registry, unresolved }
}

/** 只要注册表本身。未解析的凭证不再是错误——见文件头。 */
export function loadRegistry(
  file: string,
  env: Record<string, string | undefined> = process.env,
): ProviderRegistry {
  return loadRegistryDetailed(file, env).registry
}
