import { useCallback, useEffect, useRef, useState } from "react"
import type { ResponseOf } from "../../protocol/index.js"

export type BrowserDirectory = ResponseOf<"browseDirectory">
type Position = { identity: string; directory?: BrowserDirectory; history: string[]; index: number; busy: boolean; error?: string | undefined }
const empty = (identity: string): Position => ({ identity, history: [], index: -1, busy: false })

/** Validate before committing a location. Late responses never replace a newer navigation or owner. */
export function useDirectoryNavigation({ identity, enabled, initialPath, homePath = "", readDirectory, onDirectory }: {
  identity: string
  enabled: boolean
  initialPath: string
  homePath?: string
  readDirectory: (path: string) => Promise<BrowserDirectory>
  onDirectory?: ((path: string) => void) | undefined
}) {
  const [position, setPosition] = useState<Position>(() => empty(identity))
  const current = useRef(position), sequence = useRef(0), owner = useRef(identity)
  const callbacks = useRef({ readDirectory, onDirectory, initialPath, homePath })
  callbacks.current = { readDirectory, onDirectory, initialPath, homePath }
  if (owner.current !== identity) { owner.current = identity; sequence.current++; current.current = empty(identity) }
  const accept = useCallback((next: Position) => { current.current = next; setPosition(next) }, [])

  const move = useCallback(async (path: string, index?: number): Promise<boolean> => {
    const ticket = ++sequence.current
    const previous = current.current
    accept({ ...previous, busy: true, error: undefined })
    try {
      const directory = await callbacks.current.readDirectory(path)
      if (ticket !== sequence.current || owner.current !== identity) return false
      const sameDirectory = previous.directory?.path === directory.path
      const history = index === undefined
        ? sameDirectory ? previous.history : [...previous.history.slice(0, previous.index + 1), directory.path]
        : previous.history
      accept({ identity, directory, history, index: index ?? (sameDirectory ? previous.index : history.length - 1), busy: false })
      callbacks.current.onDirectory?.(directory.path)
      return true
    } catch (error) {
      if (ticket !== sequence.current || owner.current !== identity) return false
      accept({ ...previous, busy: false, error: `${path || callbacks.current.initialPath}: ${error instanceof Error ? error.message : String(error)}` })
      return false
    }
  }, [identity, accept])

  useEffect(() => {
    if (!enabled || current.current.directory) return
    const target = callbacks.current.initialPath, ticket = sequence.current + 1
    void move(target).then(ok => {
      if (!ok && sequence.current === ticket && owner.current === identity && target !== callbacks.current.homePath) void move(callbacks.current.homePath)
    })
  }, [identity, enabled, move])
  useEffect(() => () => { sequence.current++ }, [])

  const scoped = position.identity === identity ? position : empty(identity)
  return {
    ...scoped,
    navigate: (path: string) => move(path),
    canBack: scoped.index > 0,
    canForward: scoped.index >= 0 && scoped.index < scoped.history.length - 1,
    back: () => { const p = current.current; return p.index > 0 ? move(p.history[p.index - 1]!, p.index - 1) : Promise.resolve(false) },
    forward: () => { const p = current.current; return p.index < p.history.length - 1 ? move(p.history[p.index + 1]!, p.index + 1) : Promise.resolve(false) },
  }
}

export type DirectoryNavigation = ReturnType<typeof useDirectoryNavigation>
