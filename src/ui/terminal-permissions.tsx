import { useEffect, useRef, useState } from 'react'
import type { WorkbenchClient } from './client.js'
import { PermissionPill, type 权限档 } from './permission-pill.js'
import { SessionPermissionSchema, type SessionPermission } from '../protocol/permissions.js'
import { t } from './i18n/index.js'

/** Mounted by terminal+Agent identity; no permission state belongs to the Shell tab. */
export function TerminalPermissionControl({ client, sessionId }: { client: Pick<WorkbenchClient, 'get'>; sessionId: string }) {
  const [value, setValue] = useState<SessionPermission>()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const active = useRef(false), revision = useRef(0)
  const writing = useRef(false)
  useEffect(() => {
    active.current = true
    let reading = false
    const read = async () => {
      if (reading || writing.current) return
      reading = true
      const version = revision.current
      try {
        const next = SessionPermissionSchema.parse(await client.get('getSessionPermission', { sessionId }))
        if (active.current && version === revision.current) { setValue(next); setError(old => old.startsWith(t("读取权限失败")) ? '' : old) }
      } catch (e) { if (active.current && version === revision.current) { setValue(undefined); setError(t("读取权限失败") + '：' + (e instanceof Error ? e.message : String(e))) } }
      finally { reading = false }
    }
    void read()
    const timer = setInterval(() => { void read() }, 500)
    return () => { active.current = false; revision.current++; clearInterval(timer) }
  }, [client, sessionId])
  const pick = async (tier: 权限档, asDefault: boolean) => {
    if (writing.current) return
    writing.current = true
    revision.current++; setBusy(true); setError('')
    try {
      await client.get('setSessionConfigOption', { sessionId, configId: 'dawn.permission', value: tier })
      if (asDefault) await client.get('setPermissionMode', { mode: tier })
      const next = SessionPermissionSchema.parse(await client.get('getSessionPermission', { sessionId }))
      if (active.current) setValue(next)
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { writing.current = false; revision.current++; if (active.current) setBusy(false) }
  }
  return <div className="terminal-permissions">
    {value ? <PermissionPill 当前={value.effective} 跟随默认={value.current === 'inherit'} disabled={busy} onPick={(tier, asDefault) => void pick(tier, asDefault)} /> : <span className="hint">{t("权限读取中")}</span>}
    {error ? <span className="terminal-switch-error" role="alert">{error}</span> : null}
  </div>
}
