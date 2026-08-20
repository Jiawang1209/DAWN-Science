/**
 * 这个 agent 的手到不到得了服务器——**远端会话只能用这些**（T3，2026-08-21）。
 *
 * - native：四个工具经 `RemoteExecutor`，到得了。
 * - acp：看 `remoteCapable`。
 * - cli / kernel / pty：运行时不认 `spec.remote`（`grep -c remote` 为 0），
 *   起在远端任务里也是本机干活——所以是假。
 *
 * 判据只住这一处：后端拒、界面滤，都调它。
 *
 * **住在 protocol 里**：界面与后端都要用同一个判据，而界面只许经 `src/protocol`
 * 取东西（`ui-boundary.test.ts`）。T3 第一版把它放在 `config/schema.ts`，
 * App.tsx 直接伸手去拿——那条边界测试当场红了，T3 却没看见。
 */
export function 能上服务器(def: { kind: string; remoteCapable?: boolean | undefined }): boolean {
  if (def.kind === "native") return true
  if (def.kind === "acp") return def.remoteCapable === true
  return false
}
