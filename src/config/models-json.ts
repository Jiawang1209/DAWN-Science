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
import type { ProviderConnection } from "./schema.js"

/** `models.json` 里一个 provider 的形状（只用我们会写的那几个字段） */
interface ModelsJsonProvider {
  baseUrl?: string
  api?: string
  headers?: Record<string, string>
  models?: { id: string; name: string; api?: string }[]
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
            models: conn.models.map((id) => ({
              id,
              name: id,
              ...(conn.api === undefined ? {} : { api: conn.api }),
              /**
               * **声明收图**（2026-08-13，作者报的那个「粘了图没反应」）。
               *
               * pi-ai 拼请求时看 `model.input.includes("image")`——
               * **不声明，图就在它那儿被丢掉，请求照发、回复照回**。
               * 而我们这一侧生成的条目**一个 `input` 都没写**，
               * 于是作者自己加的 `kimi-k3` 一张图也送不出去。
               *
               * ## 为什么是「声明支持」而不是「声明不支持」
               *
               * 作者的原话：*「是否识别图片，那是 LLM 的事情，
               * 而不是我们工具的事情。」* 他是对的——我们凭一个模型 id
               * 猜不出对面能不能看图。
               *
               * 那么两种猜法里挑**错了也说得出话**的那一种：
               * - 声明支持而对面不支持 → **端点会返回一个错误**，看得见、查得到；
               * - 声明不支持而对面支持 → **图被静默丢掉**，人只会觉得模型很笨。
               *
               * 前者是可以被纠正的失败，后者不是。
               */
              input: ["text", "image"],
            })),
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
