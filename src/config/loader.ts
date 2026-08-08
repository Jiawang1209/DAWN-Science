/**
 * 配置加载：读 YAML → 展开 ${ENV} → schema 校验 → 跨段引用完整性校验（Task 1.2）。
 *
 * 四步顺序不可调换：
 *   展开必须在校验之前（否则 apiKey 校验的是占位符字面量），
 *   引用校验必须在 schema 校验之后（否则拿不到可信的结构）。
 */
import { readFileSync } from "node:fs"
import { parse as parseYaml } from "yaml"
import { ProviderRegistrySchema, type ProviderRegistry } from "./schema.js"

const ENV_REF = /\$\{([A-Z0-9_]+)\}/g

function expandEnv(value: unknown, env: Record<string, string | undefined>, path: string): unknown {
  if (typeof value === "string") {
    return value.replace(ENV_REF, (_m, name: string) => {
      const found = env[name]
      // 规格 7.5「无静默回退」：缺失即响亮失败。留着占位符会让请求带着字面量
      // "${DEEPSEEK_API_KEY}" 发出去，错误延后到 401 才暴露，且信息量为零。
      // 报错带上 path，让用户知道是配置里的哪一处。
      if (found === undefined || found === "") {
        throw new Error(`配置 ${path} 引用了环境变量 \${${name}}，但它未设置或为空`)
      }
      return found
    })
  }
  if (Array.isArray(value)) return value.map((v, i) => expandEnv(v, env, `${path}[${i}]`))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, expandEnv(v, env, `${path}.${k}`)]),
    )
  }
  return value
}

/**
 * 校验跨段引用完整性：agent → endpoint → model。
 * zod 只能校验单个节点的形状，管不了「这个 endpoint 名字是否真的存在」。
 * 这类错误若不在加载期拦住，会变成运行期起 agent 时才崩。
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

export function loadRegistry(
  file: string,
  env: Record<string, string | undefined> = process.env,
): ProviderRegistry {
  const raw = parseYaml(readFileSync(file, "utf8")) as unknown
  const expanded = expandEnv(raw, env, "providers")
  const reg = ProviderRegistrySchema.parse(expanded)
  assertReferences(reg)
  return reg
}
