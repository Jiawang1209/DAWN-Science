/**
 * 文件系统探针（2026-08-26 · 产物首用回归）。
 *
 * `git-facts.ts` 只在 git 仓库里说得出话。可临时会话住在 `~/DAWN/scratch/<ts>/`，
 * 用户自己的分析目录也常常不是仓库——作者第一次真用「产物」就撞上满屏「本轮产出未知」。
 *
 * 没有 git 时的替代事实来源：**执行前后各扫一遍工作区**，按 inode / mtime / size 对比。
 * 这仍是观察，不是转述 agent 的自述（不变式 5）。
 *
 * 三条纪律：
 *   - **超过上限返回 `undefined`**（= 不知道）。截断后装作知道，会把没扫到的那半说成「确认没改」。
 *   - **不跟随符号链接**：链接指向哪儿不归这个工作区管，跟进去可能扫到整块盘。
 *   - **跳过的目录是白名单式的死角**（`.git` / `.dawn` / 依赖目录 / 虚拟环境）：产物永远不在那些地方，
 *     而它们动辄上万个文件，会把上限吃光。
 */
import { lstatSync, readdirSync } from "node:fs"
import { join } from "node:path"

export interface FsEntry {
  ino: number
  mtimeMs: number
  size: number
}

/** key = 相对工作区的 posix 路径，只记文件 */
export type FsSnapshot = Map<string, FsEntry>

/** 跳过的目录名（不递归进去）。产物永远不在这些地方 */
export const FS_SKIP_DIRS: ReadonlySet<string> = new Set([
  ".git",
  ".dawn",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".ipynb_checkpoints",
  ".Rproj.user",
])

export const FS_SNAPSHOT_CAP = 20_000

function 该跳过(name: string): boolean {
  // `.venv-py311` 这类带后缀的虚拟环境也跳
  return FS_SKIP_DIRS.has(name) || name.startsWith(".venv")
}

/**
 * 扫一遍工作区。**超过上限返回 `undefined`**（= 不知道），不许截断后装作知道。不跟随符号链接。
 */
export function fsSnapshot(workspace: string, cap = FS_SNAPSHOT_CAP): FsSnapshot | undefined {
  const out: FsSnapshot = new Map()
  // 显式栈而不是递归：深目录不炸调用栈
  const 待扫: string[] = [""]
  while (待扫.length > 0) {
    const rel = 待扫.pop()!
    const abs = rel ? join(workspace, rel) : workspace
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      // 读不了的目录（权限、中途被删）跳过：它里面的东西这次看不见，但别让整次扫描失败
      continue
    }
    for (const e of entries) {
      // `Dirent.isSymbolicLink()` 对链接为真，`isFile`/`isDirectory` 为假——整体跳过
      if (e.isSymbolicLink()) continue
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (!该跳过(e.name)) 待扫.push(childRel)
        continue
      }
      if (!e.isFile()) continue
      let st
      try {
        st = lstatSync(join(workspace, childRel))
      } catch {
        continue
      }
      if (!st.isFile()) continue
      out.set(childRel, { ino: st.ino, mtimeMs: st.mtimeMs, size: st.size })
      if (out.size > cap) return undefined
    }
  }
  return out
}

/** 前后对比：created = 后有前无；written = created ∪ (ino / mtime / size 任一变了的) */
export function fsDiff(before: FsSnapshot, after: FsSnapshot): { created: string[]; written: string[] } {
  const created: string[] = []
  const written: string[] = []
  for (const [path, now] of after) {
    const was = before.get(path)
    if (!was) {
      created.push(path)
      written.push(path)
      continue
    }
    if (was.ino !== now.ino || was.mtimeMs !== now.mtimeMs || was.size !== now.size) written.push(path)
  }
  created.sort()
  written.sort()
  return { created, written }
}
