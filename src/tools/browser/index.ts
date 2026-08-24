/**
 * 浏览器插件的装配层（2026-08-25，学自 dsh-reef；规格 specs/2026-08-25-浏览器插件-design.md）。
 * 复用 office 插件的定义 DSL 与 pi 包壳；开关四族：browse / read / act / artifact。
 */
import { 包成pi工具 } from "../office/index.js"
import { browser工具定义 } from "./tools.js"

export interface Browser开关 {
  off: boolean
  browse: boolean
  read: boolean
  act: boolean
  artifact: boolean
}

export function browserTools(workspace: string, 开: Browser开关): unknown[] {
  if (开.off) return []
  const 出: unknown[] = []
  for (const f of browser工具定义(workspace)) {
    if (!开[f.族 as keyof Omit<Browser开关, "off">]) continue
    for (const d of f.工具) 出.push(包成pi工具(d, workspace))
  }
  return 出
}
