import { atom } from "nanostores"

export type SessionRecovery = { pending: boolean; error?: string }
/** 主区、侧区与连接推送共用，按会话隔离；不持久化。 */
export const $sessionRecovery = atom<Readonly<Record<string, SessionRecovery>>>({})
const generations = new Map<string, number>()
export function beginSessionRecovery(id: string): (error?: string) => void {
  const generation = (generations.get(id) ?? 0) + 1
  generations.set(id, generation)
  $sessionRecovery.set({ ...$sessionRecovery.get(), [id]: { pending: true } })
  return (error) => {
    if (generations.get(id) !== generation) return
    $sessionRecovery.set({ ...$sessionRecovery.get(), [id]: { pending: false, ...(error ? { error } : {}) } })
  }
}
