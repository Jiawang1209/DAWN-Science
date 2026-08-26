/**
 * 把配置里的 provider 连接设置变成 pi 认的 `models.json`（2026-08-10）。
 *
 * ## 它回答的问题
 *
 * 作者：*「这 8 个不自带的，你看着处理，需要添加 baseUrl / apiKey / api / headers
 * 那就添加。」*
 *
 * pi 自带 40 个 provider 的地址，**但有 8 个不自带**——它们的地址跟账号、
 * 区域、项目走，pi 没法替你填。pi 读取这些的入口只有一个：
 * `ModelRuntime.create({ modelsPath })` 指向的那份 `models.json`。
 *
 * **这条路早就在被用着**：e2e 的假推理服务器正是这么接进去的
 * （`mockModelsJson`）。生产环境从来没传过这个路径，所以用户没法覆盖——
 * 这个文件补的就是那一段。
 *
 * ## 三条纪律
 *
 * 1. **密钥不进这个文件。** `models.json` 支持 `apiKey` 字段，但我们**不写**——
 *    它落在磁盘上就是明文。密钥仍然只在 OS 的加密存储里，由 pi 的凭证接口取。
 * 2. **每次启动重新生成。** `modelsPath` 同时是 pi 缓存远端目录的地方，
 *    它可能被覆盖。**以 `providers.yaml` 为唯一事实来源**，每次启动重写一遍——
 *    否则用户的覆盖会某天悄悄消失，而没有任何迹象。
 * 3. **合并，不替换。** 给了基底文件（测试用）就merge 在它上面；
 *    我们只声明用户覆盖过的那几个 provider，其余 39 个仍由 pi 的内置目录提供。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { Model } from "@earendil-works/pi-ai"
import { getBuiltinModel, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all"
import type { ProviderConnection } from "./schema.js"

/** `models.json` 里一个 provider 的形状（只用我们会写的那几个字段） */
interface ModelsJsonProvider {
  baseUrl?: string
  api?: string
  headers?: Record<string, string>
  models?: ModelsJsonModel[]
}

/** `models.json` 里一个模型的形状（pi 的 `ModelDefinitionSchema` 认的那几个字段） */
export interface ModelsJsonModel {
  id: string
  name: string
  api?: string
  input?: ("text" | "image")[]
  reasoning?: boolean
  thinkingLevelMap?: Model<string>["thinkingLevelMap"]
  cost?: Model<string>["cost"]
  contextWindow?: number
  maxTokens?: number
  compat?: Model<string>["compat"]
}

/**
 * 把 yaml 里列出的一个模型 id 变成 `models.json` 的一条。
 *
 * **2026-08-26 作者撞的 400**——这里曾把所有列出的模型硬写成收图
 * （`input: ["text","image"]`），deepseek-v4-flash 于是把 `read` 到的 png
 * 发了出去，DeepSeek 答「This model does not support image」。他从没要过图。
 *
 * 当时的理由是「声明支持错了会出声，声明不支持错了会静默丢图」。
 * 但那只对**粘图进对话**成立；agent 自己 `read` 一张图时，
 * 声明错了的代价是**整轮对话被 400 打断**，而正确答案 pi 本来就知道。
 *
 * 所以现在分三档：
 * 1. pi 的注册表（`@earendil-works/pi-ai/providers/all` 的 `getBuiltinModel`）
 *    认识这个 provider 下的这个 id → **继承它的声明**（input / reasoning /
 *    cost / contextWindow / maxTokens / compat / thinkingLevelMap）。
 *    必须整条抄：pi 读 `models.json` 里列出的模型时**不会回填内置条目**，
 *    只写 id 的话 reasoning、上下文窗口全会退成默认值。
 * 2. 不认识（自建端点上的模型）→ 缺省只收文字。**缺失不等于支持。**
 * 3. yaml 写了 `vision: true` → 那个 provider 列出的模型都收图。
 *    用户明说的才算，注册表认不认识都一样。
 *
 * yaml 写了的字段（目前只有 `api`）优先于注册表。
 */
function 模型条目(provider: string, id: string, conn: ProviderConnection): ModelsJsonModel {
  // 注册表的签名是按字面量收窄的；我们手里是 yaml 里的字符串，放宽一次
  const 内置: Model<string> | undefined = (getBuiltinProviders() as string[]).includes(provider)
    ? (getBuiltinModel(provider as never, id as never) as Model<string> | undefined)
    : undefined
  const 继承: Partial<ModelsJsonModel> = 内置
    ? {
        ...(内置.api === undefined ? {} : { api: 内置.api }),
        ...(内置.reasoning === undefined ? {} : { reasoning: 内置.reasoning }),
        ...(内置.thinkingLevelMap === undefined ? {} : { thinkingLevelMap: 内置.thinkingLevelMap }),
        ...(内置.cost === undefined ? {} : { cost: 内置.cost }),
        ...(内置.contextWindow === undefined ? {} : { contextWindow: 内置.contextWindow }),
        ...(内置.maxTokens === undefined ? {} : { maxTokens: 内置.maxTokens }),
        ...(内置.compat === undefined ? {} : { compat: 内置.compat }),
      }
    : {}
  const input: ("text" | "image")[] = conn.vision
    ? ["text", "image"]
    : [...(内置?.input ?? ["text"])]
  return {
    id,
    name: id,
    ...继承,
    ...(conn.api === undefined ? {} : { api: conn.api }),
    input,
  }
}

export interface ModelsJson {
  providers?: Record<string, ModelsJsonProvider & Record<string, unknown>>
  [k: string]: unknown
}

/**
 * 生成 `models.json` 的内容。
 *
 * @param connections 用户在 `providers.yaml` 里写的连接设置
 * @param base 基底（测试用的假服务器目录）。**覆盖优先于基底**——
 *   用户明确写下的东西不该被一个默认文件盖掉
 */
export function buildModelsJson(
  connections: Record<string, ProviderConnection> | undefined,
  base?: ModelsJson,
): ModelsJson {
  const out: ModelsJson = { ...(base ?? {}) }
  const providers: Record<string, ModelsJsonProvider & Record<string, unknown>> = {
    ...(base?.providers ?? {}),
  }

  for (const [id, conn] of Object.entries(connections ?? {})) {
    providers[id] = {
      // 基底里同名的先留着（比如假服务器写的 models 列表），再覆盖用户给的字段
      ...(providers[id] ?? {}),
      ...(conn.baseUrl === undefined ? {} : { baseUrl: conn.baseUrl }),
      ...(conn.api === undefined ? {} : { api: conn.api }),
      ...(conn.headers === undefined ? {} : { headers: conn.headers }),
      /**
       * 自建端点必须自己报模型——**pi 没法凭空知道你的 vLLM 上跑着什么**。
       * 那 8 个内置 provider 不写这一项，用 pi 已有的清单。
       */
      ...(conn.models === undefined
        ? {}
        : {
            models: conn.models.map((mid) => 模型条目(id, mid, conn)),
          }),
    }
    /**
     * **绝不写 `apiKey`。** 就算基底里有（假服务器会写一个假的），
     * 用户覆盖过的 provider 一律走凭证存储——
     * 一个真密钥落到这个文件里就是明文躺在磁盘上。
     */
    if (connections?.[id] && "apiKey" in providers[id]!) delete providers[id]!["apiKey"]
  }

  if (Object.keys(providers).length > 0) out.providers = providers
  return out
}

/**
 * 写出 `models.json`，返回它的路径；**没有任何覆盖时返回 undefined**。
 *
 * 返回 undefined 而不是写一个空文件：给 pi 一个空的 `modelsPath`
 * 与不给是两回事——前者会让它把这个文件当成目录缓存的家。
 */
export function writeModelsJson(
  file: string,
  connections: Record<string, ProviderConnection> | undefined,
  basePath?: string,
): string | undefined {
  let base: ModelsJson | undefined
  if (basePath && existsSync(basePath)) {
    try {
      base = JSON.parse(readFileSync(basePath, "utf8")) as ModelsJson
    } catch {
      // 基底读不了就当没有。**它是测试用的旁路**，不该拖垮启动
    }
  }
  const 有覆盖 = Object.keys(connections ?? {}).length > 0
  if (!有覆盖 && !base) return undefined

  const json = buildModelsJson(connections, base)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(json, null, 2), "utf8")
  return file
}
