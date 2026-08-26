/**
 * 工作区路径守卫（2026-08-26，审查 D）。
 *
 * 三处（探针的声明路径、产物登记并进、`listArtifacts` 的越界判定）各写过一遍
 * 「换算成相对工作区、越界就丢」，判据还不完全一样——合成一份。
 */
import { isAbsolute, relative, resolve, sep } from "node:path"

/**
 * `p`（相对或绝对）换算成相对 `workspace` 的路径；**越界或仍是绝对路径时返回 `undefined`**。
 *
 * 越界只认恰好 `..` 与 `..` 开头的一段（`../x`），**不认 `..foo` 这种名字**——
 * 那是个合法文件名，此前用 `startsWith("..")` 会把它当成越界丢掉。
 */
export function 工作区内相对路径(workspace: string, p: string): string | undefined {
  const rel = relative(workspace, resolve(workspace, p))
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined
  return rel
}
