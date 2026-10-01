import { memo, type ReactNode } from "react"

/**
 * Transcript updates arrive for every streamed chunk. Keep the editable composer surface
 * behind a memo boundary keyed only by state that can change what the input displays or does.
 * ConversationView rebuilds the React children on each transcript update, so the comparator
 * intentionally compares the narrow state fingerprint instead of the children object.
 */
export type ComposerInputFingerprint = readonly unknown[]

export function 同输入卡状态(a: ComposerInputFingerprint, b: ComposerInputFingerprint): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((value, index) => {
    const other = b[index]
    if (Array.isArray(value) && Array.isArray(other)) {
      return value.length === other.length && value.every((item, i) => item === other[i])
    }
    return value === other
  })
}

export const ComposerInputSurface = memo(
  function ComposerInputSurface({ fingerprint, children }: { fingerprint: ComposerInputFingerprint; children: ReactNode }) {
    return <>{children}</>
  },
  (a, b) => 同输入卡状态(a.fingerprint, b.fingerprint),
)
ComposerInputSurface.displayName = "ComposerInputSurface"
