import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WorkbenchClient } from './client.js'
import type { ContextUsage } from './panels.js'
import { ContextMeter, 读仪表 } from './context-meter.js'

export function TerminalContextMeter({ element, revision, sessionId, client }: {
  element: HTMLElement; revision: number; sessionId: string; client: Pick<WorkbenchClient, 'get'>
}) {
  const [snapshot, setSnapshot] = useState<{ sessionId: string; usage?: ContextUsage; error?: string }>()
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++sequence.current
    try {
      const usage = await client.get<ContextUsage>('getContextUsage', { sessionId })
      if (request === sequence.current) setSnapshot({ sessionId, usage })
    } catch (e) { if (request === sequence.current) setSnapshot({ sessionId, error: e instanceof Error ? e.message : String(e) }) }
  }, [client, sessionId])
  useEffect(() => { void refresh(); return () => { sequence.current++ } }, [refresh, revision])
  const current = snapshot?.sessionId === sessionId ? snapshot : undefined
  return createPortal(<ContextMeter 读数={读仪表('native', current?.usage, current?.error)!} onOpen={() => { void refresh() }} />, element)
}
