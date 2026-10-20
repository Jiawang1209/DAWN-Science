/** File transport deadlines; never reuse these to time-limit remote analysis commands. */
import { pipeline } from "node:stream/promises"
import type { Readable, Writable } from "node:stream"
export function deadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时`)), ms)
    work.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}
export function missingFile(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code
  return code === 2 || code === "ENOENT"
}
export async function transferStream(source: Readable, target: Writable, options: { signal?: AbortSignal; idleMs: number; progress: (bytes: number) => void }): Promise<number> {
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  let bytes = 0
  let timer: ReturnType<typeof setTimeout>
  const reset = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(new Error("传输长时间没有进展，已超时")), options.idleMs) }
  const progress = (chunk: Buffer) => { bytes += chunk.length; reset(); options.progress(bytes) }
  source.on("data", progress)
  options.signal?.addEventListener("abort", abort, { once: true })
  if (options.signal?.aborted) abort()
  reset()
  try { await pipeline(source, target, { signal: controller.signal }); return bytes }
  catch (error) { throw controller.signal.aborted ? controller.signal.reason ?? error : error }
  finally { clearTimeout(timer!); source.off("data", progress); options.signal?.removeEventListener("abort", abort) }
}
