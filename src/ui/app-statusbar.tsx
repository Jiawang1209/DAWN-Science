import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { InterpreterCandidate, KernelState } from '../protocol/index.js'
import { Button } from './primitives.js'
import { 插件图标, 技能图标, 设置图标, 对话图标 } from './icons.js'
import { ServiceMark } from './service-mark.js'
import { SessionMenu } from './session-menu-items.js'
import { t, tf } from './i18n/index.js'

type ProbeResult = { python: readonly InterpreterCandidate[]; r: readonly InterpreterCandidate[] }
type Extension = 'plugins' | 'skills' | 'mcp' | 'subagents'
export interface AppStatusBarProps {
  model?: { name: string; provider?: string | undefined; providerId?: string | undefined; kind?: string | undefined } | undefined
  environment: {
    scopeId: string
    label: string
    paths: { python?: string | undefined; r?: string | undefined } | undefined
    error?: string | undefined
    kernels?: readonly KernelState[] | undefined
    probe: () => Promise<ProbeResult>
    configure: () => void
  }
  counts: Record<Extension, number | undefined>
  scopeLabel: string
  version?: string | undefined
  onOpenSettings: (id: string) => void
  alerts?: ReactNode
}

/** Non-modal details stay inside the viewport and return focus on Escape. */
function StatusDetails({ label, anchor, onClose, children }: {
  label: string; anchor: RefObject<HTMLButtonElement | null>; onClose: () => void; children: ReactNode
}) {
  const popup = useRef<HTMLDivElement>(null)
  const close = useRef(onClose); close.current = onClose
  useLayoutEffect(() => {
    const place = () => {
      if (!popup.current || !anchor.current) return
      const rect = anchor.current.getBoundingClientRect()
      popup.current.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - popup.current.offsetWidth - 12))}px`
      popup.current.style.bottom = `${Math.max(12, window.innerHeight - rect.top + 8)}px`
      popup.current.style.maxHeight = `${Math.max(40, rect.top - 20)}px`
    }
    place(); window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor])
  useEffect(() => {
    popup.current?.focus()
    const outside = (e: MouseEvent) => {
      if (!popup.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) close.current()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); anchor.current?.focus() }
    }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key) }
  }, [anchor])
  return createPortal(<div ref={popup} role="dialog" aria-label={label} tabIndex={-1} className="app-status-details"
    onBlur={e => { if (e.relatedTarget instanceof Node && !popup.current?.contains(e.relatedTarget) && !anchor.current?.contains(e.relatedTarget)) onClose() }}>
    <strong>{label}</strong>{children}
  </div>, document.body)
}

export function AppStatusBar({ model, environment, counts, scopeLabel, version, onOpenSettings, alerts }: AppStatusBarProps) {
  const [detail, setDetail] = useState<'model' | 'R' | 'python'>()
  const [extensionsOpen, setExtensionsOpen] = useState(false)
  const modelButton = useRef<HTMLButtonElement>(null)
  const rButton = useRef<HTMLButtonElement>(null)
  const pythonButton = useRef<HTMLButtonElement>(null)
  const extensionsButton = useRef<HTMLButtonElement>(null)
  const scope = JSON.stringify([environment.scopeId, environment.paths?.r, environment.paths?.python])
  const currentScope = useRef(scope); currentScope.current = scope
  const [probe, setProbe] = useState<{ scope: string; busy?: boolean; result?: ProbeResult; error?: string }>()
  const currentProbe = probe?.scope === scope ? probe : undefined
  const probeRequest = useRef(0)
  useEffect(() => { setDetail(undefined); setProbe(undefined); probeRequest.current++ }, [scope])
  const detect = async () => {
    if (currentProbe?.busy) return
    const requestedScope = scope, request = ++probeRequest.current
    setProbe({ scope, busy: true })
    try {
      const result = await environment.probe()
      if (currentScope.current === requestedScope && probeRequest.current === request) setProbe({ scope, result })
    } catch (error) {
      if (currentScope.current === requestedScope && probeRequest.current === request) setProbe({ scope, error: error instanceof Error ? error.message : String(error) })
    }
  }
  const state = (language: 'R' | 'python') => {
    const path = language === 'R' ? environment.paths?.r : environment.paths?.python
    const candidate = (language === 'R' ? currentProbe?.result?.r : currentProbe?.result?.python)?.find(c => c.path === path)
    const kernel = environment.kernels?.find(k => k.language === language)
    const problem = environment.error ?? currentProbe?.error ?? candidate?.problem
      ?? (candidate?.kernelPackage === 'missing' ? tf("缺少内核包：{0}", language === 'R' ? 'IRkernel' : 'ipykernel') : undefined)
    const result = (text: string, tone = 'muted') => ({ text, tone, path, candidate, kernel, problem })
    if (environment.error) return result(t("异常"), 'danger')
    if (kernel?.state === 'detached') return result(t("连接中断"), 'danger')
    if (kernel?.state === 'busy') return result(t("运行中"), 'accent')
    if (kernel?.state === 'starting') return result(t("启动中"), 'accent')
    if (kernel?.state === 'idle') return result(t("已就绪"), 'accent')
    if (problem) return result(t("异常"), 'danger')
    if (environment.paths === undefined) return result(t("读取中"))
    if (!path) return result(t("未配置"))
    if (currentProbe?.busy) return result(t("检测中"), 'accent')
    if (candidate?.kernelPackage === 'present') return result(t("已就绪"), 'accent')
    if (currentProbe?.result) return { ...result(t("异常"), 'danger'), problem: t("没有获得此路径的有效检测结果") }
    return result(t("已配置待检测"))
  }
  const definitions = [
    { id: 'plugins' as const, label: t("插件"), icon: <插件图标 /> },
    { id: 'skills' as const, label: t("Skills"), icon: <技能图标 /> },
    { id: 'mcp' as const, label: 'MCP', icon: <设置图标 /> },
    { id: 'subagents' as const, label: t("子 Agent"), icon: <对话图标 /> },
  ]
  const openSettings = (id: string) => { setDetail(undefined); setExtensionsOpen(false); onOpenSettings(id) }
  const extensionLabel = (item: typeof definitions[number]) => `${item.label} ${counts[item.id] ?? '—'}`
  const toggleDetail = (id: typeof detail) => { setExtensionsOpen(false); setDetail(detail === id ? undefined : id) }
  const interpreter = detail === 'R' || detail === 'python' ? state(detail) : undefined
  const detected = detail === 'R' ? currentProbe?.result?.r : detail === 'python' ? currentProbe?.result?.python : undefined
  const modelName = model?.name ?? t("未配置模型")
  return <footer className="statusbar app-statusbar" aria-label={t("应用状态")}>
    {alerts ? <div className="app-status-alerts">{alerts}</div> : null}
    <div className="app-status-main">
      <div className="app-status-environment">
        <Button ref={modelButton} variant="ghost" size="status" className="app-status-model" aria-label={tf("当前模型：{0}", modelName)}
          aria-description={modelName} aria-haspopup="dialog" aria-expanded={detail === 'model'} onClick={() => toggleDetail('model')}>
          <ServiceMark provider={model?.providerId} label={model?.provider ?? model?.name} /><span>{modelName}</span>
        </Button>
        {(['R', 'python'] as const).map(language => {
          const s = state(language), name = language === 'R' ? 'R' : 'Python'
          return <Button key={language} ref={language === 'R' ? rButton : pythonButton} variant="ghost" size="status"
            className="app-status-interpreter" data-tone={s.tone} aria-label={tf("{0}：{1}", name, s.text)}
            aria-description={`${environment.label} · ${name} · ${s.text}`} aria-haspopup="dialog" aria-expanded={detail === language}
            onClick={() => toggleDetail(language)}><span className="app-status-dot" aria-hidden="true" /><span>{name}</span><span className="app-status-state">{s.text}</span></Button>
        })}
      </div>
      <div className="app-status-extensions">
        <div className="app-status-counts">{definitions.map(item => <Button key={item.id} variant="ghost" size="status"
          aria-label={extensionLabel(item)} aria-description={tf("当前启用数量 · {0}", item.id === 'plugins' ? t("全局") : scopeLabel)}
          onClick={() => openSettings(item.id)}>{item.icon}<span>{item.label}</span><span className="app-status-number">{counts[item.id] ?? '—'}</span></Button>)}</div>
        <Button ref={extensionsButton} variant="ghost" size="status" className="app-status-compact" aria-label={t("扩展数量")}
          aria-haspopup="menu" aria-expanded={extensionsOpen} onClick={() => { setDetail(undefined); setExtensionsOpen(!extensionsOpen) }}>
          <插件图标 /><span>{t("扩展")}</span>
        </Button>
        <Button variant="ghost" size="status" className="app-status-version" aria-label={tf("版本 {0}", version ? `v${version.replace(/^v/, '')}` : '—')}
          onClick={() => openSettings('about')}>{version ? `v${version.replace(/^v/, '')}` : '—'}</Button>
      </div>
    </div>
    {detail ? <StatusDetails key={detail} label={detail === 'model' ? t("当前模型") : tf("{0} 解释器状态", detail === 'R' ? 'R' : 'Python')}
      anchor={detail === 'model' ? modelButton : detail === 'R' ? rButton : pythonButton} onClose={() => setDetail(undefined)}>
      {detail === 'model' ? <>
        <p className="app-status-model-name">{modelName}</p>
        {model?.provider ? <p>{model.provider}{model.kind ? ` · ${model.kind}` : ''}</p> : null}
        {!model?.provider && model?.kind ? <p>{model.kind}</p> : null}
        <Button variant="ghost" size="sm" onClick={() => openSettings('models')}>{t("模型与服务设置")}</Button>
      </> : interpreter ? <>
        <p>{environment.label} · {interpreter.text}</p>
        {interpreter.path ? <code>{interpreter.path}</code> : null}
        {interpreter.candidate?.version ? <p>{tf("解释器版本：{0}", interpreter.candidate.version)}</p> : null}
        {detected && !interpreter.path ? <p>{tf("检测到 {0} 个候选，其中 {1} 个可用；请在配置中选择。", detected.length, detected.filter(c => c.kernelPackage === 'present' && !c.problem).length)}</p> : null}
        {interpreter.kernel && interpreter.kernel.state !== 'exited' ? <p className="hint">{t("内核状态来自当前会话；配置路径需单独检测。")}</p> : null}
        {interpreter.problem ? <p className="caveat" role="alert">{interpreter.problem}</p> : null}
        <div className="app-status-detail-actions">
          <Button variant="secondary" size="sm" disabled={!!currentProbe?.busy || environment.paths === undefined || !!environment.error} onClick={() => void detect()}>{currentProbe?.busy ? t("正在检测…") : t("检测解释器")}</Button>
          <Button variant="ghost" size="sm" onClick={() => { setDetail(undefined); environment.configure() }}>{t("配置解释器")}</Button>
        </div>
      </> : null}
    </StatusDetails> : null}
    {extensionsOpen ? <SessionMenu label={t("扩展数量")} position={{ left: extensionsButton.current?.getBoundingClientRect().left ?? 12, top: (extensionsButton.current?.getBoundingClientRect().top ?? window.innerHeight) - 200 }}
      onClose={() => setExtensionsOpen(false)} restoreFocus={() => extensionsButton.current?.focus()}>
      {definitions.map(item => <Button key={item.id} variant="ghost" size="menu-row" role="menuitem" onClick={() => openSettings(item.id)}>{item.icon}<span>{extensionLabel(item)}</span></Button>)}
    </SessionMenu> : null}
  </footer>
}
