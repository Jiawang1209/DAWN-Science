/**
 * 坞里那段对话（2026-09-24，侧边对话）。**渲染进程自有**：挂的是哪段按「地方」记住
 * （项目 = `p:<projectId>`，远端 = `r:<connectionId>`），key 里写明作用域。
 * 它的转录是第二个槽——后端权威，这里是缓存，与主槽同一条纪律。
 */
import { atom } from "nanostores"
import { 创建转录槽 } from "./transcript-slot.js"

export const 侧槽 = 创建转录槽()
export const $侧边会话id = atom<string | undefined>(undefined)
/** 坞里那段的运行时读不读得到主对话（`setSideSession` 回的）。缺省 = 还不知道 */
export const $侧边能读主 = atom<boolean | undefined>(undefined)

/** 作用域是「项目」一级：同一个项目（或同一台服务器）挂的那段，换回来还在 */
export const SIDE_SESSION_KEY = "dawn.project.side-session"

export function 侧边地方键(s: { projectId?: string | undefined; remote?: { connectionId: string } | undefined }): string | undefined {
  if (s.remote) return `r:${s.remote.connectionId}`
  return s.projectId ? `p:${s.projectId}` : undefined
}

function 读表(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SIDE_SESSION_KEY) ?? "{}")
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}
function 写表(t: Record<string, string>): void {
  try {
    localStorage.setItem(SIDE_SESSION_KEY, JSON.stringify(t))
  } catch {
    /* 记不住只是下次要重新挂，不影响这一次 */
  }
}

/** 换了地方（或刚启动）：按表挂上那一段；表里没有就空着。**同一段不重挂**——重挂会把侧槽清空 */
export function 载入侧边(地方: string | undefined): void {
  const id = 地方 ? 读表()[地方] : undefined
  if (id === $侧边会话id.get()) return
  侧槽.reset()
  $侧边能读主.set(undefined)
  $侧边会话id.set(id)
}
export function 挂进坞(地方: string, sessionId: string): void {
  写表({ ...读表(), [地方]: sessionId })
  载入侧边(地方)
}
export function 从坞拿下(地方: string): void {
  const t = 读表()
  delete t[地方]
  写表(t)
  侧槽.reset()
  $侧边能读主.set(undefined)
  $侧边会话id.set(undefined)
}
