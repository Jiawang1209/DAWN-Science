/**
 * `fetchLocalImage`（7.34，2026-09-15）：主进程从**本机地址**取一张图。
 *
 * 用处是对话里 MLAI 案例卡片的封面：界面 CSP 是 `img-src 'self' data:`，不许直接加载
 * `http://127.0.0.1:8765/…`。**不放宽 CSP**——那会让任何一段 markdown 都能从本机服务拉图——改由这里取、回 base64。
 *
 * 四道守卫，任一条不过都**抛出并说清是哪条**（卡片据此在封面位置写「没取到」，不画断图）：
 * 只认本机 http(s)、只收 `image/*`、上限 2MB、默认 5 秒超时。
 */
import { 本机主机吗, 解析地址 } from "../policy/local-url.js"
import { fault } from "./server.js"

const 上限字节 = 2 * 1024 * 1024

export async function 取本机图片(
  url: string,
  opts: { 超时毫秒?: number } = {},
): Promise<{ mediaType: string; base64: string }> {
  const u = 解析地址(url)
  if (!u || (u.protocol !== "http:" && u.protocol !== "https:") || !本机主机吗(u.hostname)) {
    throw fault("invalid_request", "只取本机地址上的图：{0}", url)
  }
  const 停 = new AbortController()
  const 计时 = setTimeout(() => 停.abort(), opts.超时毫秒 ?? 5000)
  try {
    let res: Response
    try {
      res = await fetch(u, { signal: 停.signal, redirect: "error" })
    } catch (e) {
      if (停.signal.aborted) throw fault("not_found", "取图超时：{0}", url)
      throw fault("not_found", "取不到这张图：{0}——{1}", url, e instanceof Error ? e.message : String(e))
    }
    if (!res.ok) throw fault("not_found", "取不到这张图：{0}——HTTP {1}", url, res.status)
    const 类型 = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase()
    if (!类型.startsWith("image/")) throw fault("invalid_request", "那个地址回的不是图片（{0}）：{1}", 类型 || "没有类型", url)
    const 声称 = Number(res.headers.get("content-length") ?? "0")
    if (声称 > 上限字节) throw fault("size_limit_exceeded", "图片超过 2MB：{0}", url)
    let 字节: Buffer
    try {
      字节 = Buffer.from(await res.arrayBuffer())
    } catch {
      if (停.signal.aborted) throw fault("not_found", "取图超时：{0}", url)
      throw fault("not_found", "取不到这张图：{0}——{1}", url, "读响应体失败")
    }
    if (字节.length > 上限字节) throw fault("size_limit_exceeded", "图片超过 2MB：{0}", url)
    return { mediaType: 类型, base64: 字节.toString("base64") }
  } finally {
    clearTimeout(计时)
  }
}
