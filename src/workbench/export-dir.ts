/**
 * 导出落到哪（2026-08-27，fix-notebook，作者定的）：
 *
 * - 项目会话 → 项目根目录下的 `docs/`（没有就建——调用方 mkdir）
 * - 普通会话（临时项目）→ 设置里的下载路径
 * - 远端会话 → 同普通会话：远端的 `workspace` 是本机 scratch，导出的是本机的转录；
 *   `docs/` 不往服务器写（作者硬约束：服务器上不放任何文件）
 * - 显式给了 `dir` → `dir`
 *
 * `exportSession` 与 `exportNotebook` 共用这一条——两处各写一份就会各自漂。
 */
import { join } from "node:path"

export function 导出目录(a: {
  workspace: string
  temporary: boolean
  remote: boolean
  downloadDir: string
  dir?: string | undefined
}): string {
  if (a.dir) return a.dir
  if (a.temporary || a.remote) return a.downloadDir
  return join(a.workspace, "docs")
}
