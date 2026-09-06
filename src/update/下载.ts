/**
 * 把包下下来（规格 U3 的前半）。
 *
 * 三条纪律：
 *   1. **字节数要与 Release 说的一致**——对不上就拒收并说清差多少。
 *      一个截断的包解开是「文件损坏」，那句话会把人送去怀疑自己的磁盘。
 *   2. **半截的东西不留在盘上**：留着的话，下次启动看到它会以为已经下好了。
 *   3. **不做断点续传**（明说不做）：223 MB 一年下不了几次，
 *      续传要处理的 range/校验/过期比它省下的多。断了就重来，但要说得清楚是断了。
 */
import { createWriteStream } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { join } from "node:path"
import type { 更新资源 } from "../protocol/entities.js"

export interface 下载进度 {
  已下: number
  共: number
}

export interface 下载参数 {
  资源: 更新资源
  /** 落在哪个目录（`userData/update/`） */
  目录: string
  进度: (p: 下载进度) => void
  signal: AbortSignal
  fetch?: typeof fetch
}

export async function 下载到({ 资源, 目录, 进度, signal, fetch: 取 = fetch }: 下载参数): Promise<string> {
  await mkdir(目录, { recursive: true })
  const 落点 = join(目录, 资源.name)
  // 上一次留下的（成功的或半截的）一律先清掉：这一次要下的东西自己说了算
  await rm(落点, { force: true })

  const r = await 取(资源.url, { signal, headers: { "user-agent": "DAWN-Science" } })
  if (!r.ok) throw new Error(`下载失败：服务器回了 ${r.status}`)
  if (!r.body) throw new Error("下载失败：服务器没给内容")

  let 已下 = 0
  const 计数 = new TransformStream<Uint8Array, Uint8Array>({
    transform(块, 控) {
      已下 += 块.byteLength
      进度({ 已下, 共: 资源.size })
      控.enqueue(块)
    },
  })

  try {
    await pipeline(Readable.fromWeb(r.body.pipeThrough(计数) as never), createWriteStream(落点), { signal })
  } catch (e) {
    await rm(落点, { force: true })
    const 名 = e instanceof Error ? e.name : ""
    if (名 === "AbortError" || signal.aborted) throw new Error("下载已取消")
    throw new Error(`下载中断：${e instanceof Error ? e.message : String(e)}（读到 ${已下} / 共 ${资源.size} 字节）`)
  }

  if (已下 !== 资源.size) {
    await rm(落点, { force: true })
    throw new Error(`下下来的大小对不上：拿到 ${已下} 字节，Release 说的是 ${资源.size} 字节`)
  }
  return 落点
}
