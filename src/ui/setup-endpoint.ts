/** 首次设置的地址解析；只识别目录与 URL，不从密钥内容猜测服务商。 */
import type { ResponseOf } from "../protocol/index.js"
export type EndpointDefaults = NonNullable<ResponseOf<"listKnownProviders">["endpointDefaults"]>
export type SetupConnection = { baseUrl?: string; api?: string; models?: string[] }

export function parseSetupEndpoint(raw: string, defaults: EndpointDefaults, apiOverride?: string) {
  const url = new URL(raw.trim())
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("API URL")
  let api: string | undefined
  let path = url.pathname.replace(/\/+$/, "")
  if (path.endsWith("/chat/completions")) {
    api = "openai-completions"
    path = path.slice(0, -"/chat/completions".length)
  } else if (path.endsWith("/responses")) {
    api = "openai-responses"
    path = path.slice(0, -"/responses".length)
  } else if (path.endsWith("/messages")) {
    api = "anthropic-messages"
    path = path.slice(0, -"/messages".length)
  }
  api = apiOverride || api
  let baseUrl = `${url.origin}${path}`
  const matches = Object.entries(defaults).flatMap(([id, value]) => {
    if (!value.baseUrl) return []
    try {
      const known = new URL(value.baseUrl)
      const knownPath = known.pathname.replace(/\/+$/, "")
      return known.origin === url.origin && (path === knownPath || path.startsWith(`${knownPath}/`))
        && (!api || !value.api || api === value.api) ? [{ id, value, length: knownPath.length }] : []
    } catch {
      return []
    }
  }).sort((a, b) => b.length - a.length || a.id.localeCompare(b.id))
  const match = matches[0]
  // 相同服务地址可能提供多种协议，只有唯一匹配才自动选服务商。
  const unique = match && !matches.some(m => m !== match && m.length === match.length)
  const resolvedApi = api ?? (unique ? match.value.api : undefined) ?? "openai-completions"
  if (resolvedApi === "anthropic-messages") {
    path = path.replace(/\/v1$/, "")
    baseUrl = `${url.origin}${path}`
  }
  let hash = 2166136261
  for (const c of baseUrl) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619)
  return {
    baseUrl,
    providerId: unique ? match.id : `custom-${(hash >>> 0).toString(36)}`,
    api: resolvedApi,
    recognized: Boolean(unique),
  }
}
