import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { LOCAL_TOOLS, type InterpreterCandidate, type LocalToolId, type LocalToolPaths, type LocalToolState } from "../protocol/index.js"
import type { WorkbenchClient } from "./client.js"
import { InterpreterPicker } from "./interpreter-picker.js"
import { Button, Row } from "./primitives.js"
import { 下拉图标, 关闭图标 } from "./icons.js"
import { t, tf } from "./i18n/index.js"

type EnvironmentId = "r" | "python" | LocalToolId
const rows: readonly { id: EnvironmentId; label: string }[] = [{ id: "r", label: "R" }, { id: "python", label: "Python" }, ...LOCAL_TOOLS]
const textOf = (error: unknown) => error instanceof Error ? error.message : String(error)

/** The overview stays compact; only the chosen environment opens an editor. */
export function LocalEnvironmentOverview({ client, interpreters, candidates, probing, probeError, onProbe, onSetInterpreter, interpreterErrors, onSavingChange }: {
  client?: WorkbenchClient | undefined
  interpreters: { r?: string | undefined; python?: string | undefined }
  candidates: { r: readonly InterpreterCandidate[]; python: readonly InterpreterCandidate[] } | undefined
  probing: boolean
  probeError?: string | undefined
  interpreterErrors?: Partial<Record<"R" | "python", string>> | undefined
  onProbe: () => void | Promise<void>
  onSetInterpreter: (language: "R" | "python", path: string) => Promise<boolean>
  onSavingChange?: ((saving: boolean) => void) | undefined
}) {
  const [paths, setPaths] = useState<LocalToolPaths>({})
  const [tools, setTools] = useState<LocalToolState["tools"]>([])
  const [ready, setReady] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [probeProblem, setProbeProblem] = useState<string>()
  const [selected, setSelected] = useState<EnvironmentId>()
  const [manual, setManual] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string>()
  const mounted = useRef(false)
  const generation = useRef(0)
  const loaded = useRef(false)
  const popup = useRef<HTMLDivElement>(null)
  const origin = useRef<HTMLButtonElement | null>(null)
  const buttons = useRef(new Map<EnvironmentId, HTMLButtonElement>())
  const saveLock = useRef(false)
  const editGeneration = useRef(0)
  const restoreFocus = useRef(false)

  const refreshTools = async () => {
    if (!client) return
    const turn = ++generation.current
    setDetecting(true); setProbeProblem(undefined)
    try {
      if (!loaded.current) {
        const stored = await client.get<{ paths: LocalToolPaths }>("getLocalTools", {})
        if (!mounted.current || turn !== generation.current) return
        setPaths(stored.paths); setReady(true); loaded.current = true
      }
      const found = await client.get<LocalToolState>("probeLocalTools", {})
      if (mounted.current && turn === generation.current) setTools(found.tools)
    } catch (error) {
      if (mounted.current && turn === generation.current) setProbeProblem(textOf(error))
    } finally {
      if (mounted.current && turn === generation.current) setDetecting(false)
    }
  }
  useEffect(() => {
    mounted.current = true; loaded.current = false
    void refreshTools()
    return () => { mounted.current = false; ++generation.current; ++editGeneration.current }
  }, [client])

  const currentPath = (id: EnvironmentId) => id === "r" || id === "python" ? interpreters[id] : paths[id]
  const foundFor = (id: EnvironmentId) => id === "r" || id === "python" ? candidates?.[id] : tools.find(tool => tool.id === id)?.candidates
  const close = () => { if (saveLock.current) return; ++editGeneration.current; restoreFocus.current = true; setSelected(undefined) }
  const open = (id: EnvironmentId) => {
    if (saveLock.current) return
    ++editGeneration.current
    origin.current = buttons.current.get(id) ?? null
    setSelected(id); setDraft(currentPath(id) ?? ""); setManual(false); setProblem(undefined)
  }

  useLayoutEffect(() => {
    const element = popup.current, anchor = origin.current
    if (!selected || !element || !anchor) return
    const native = typeof element.showPopover === "function"
    if (native) { element.setAttribute("popover", "manual"); element.showPopover() }
    const position = () => {
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(460, Math.max(200, window.innerWidth - 24))
      element.style.width = `${width}px`
      const below = window.innerHeight - rect.bottom - 18, above = rect.top - 18
      const upward = below < 240 && above > below
      element.style.maxHeight = `${Math.max(100, Math.min(480, upward ? above : below))}px`
      const height = element.getBoundingClientRect().height
      element.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`
      element.style.top = `${Math.max(12, upward ? rect.top - height - 6 : Math.min(rect.bottom + 6, window.innerHeight - height - 12))}px`
    }
    position()
    element.querySelector<HTMLElement>('input:checked, input[type="radio"], .environment-candidate, .environment-popover-actions button')?.focus({ preventScroll: true })
    const dismiss = (event: PointerEvent) => {
      if (!element.contains(event.target as Node) && !anchor.contains(event.target as Node)) close()
    }
    const toggled = (event: Event) => { if ((event as ToggleEvent).newState === "closed" && !saveLock.current) close() }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault(); event.stopPropagation(); close()
    }
    document.addEventListener("pointerdown", dismiss)
    document.addEventListener("keydown", escape, true)
    element.addEventListener("toggle", toggled)
    window.addEventListener("resize", position)
    window.addEventListener("scroll", position, true)
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(position) : undefined
    observer?.observe(element)
    return () => {
      document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape, true); element.removeEventListener("toggle", toggled)
      window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true)
      observer?.disconnect()
      if (native && element.matches(":popover-open")) element.hidePopover()
    }
  }, [selected])
  useLayoutEffect(() => {
    if (!selected && !saving && restoreFocus.current) {
      restoreFocus.current = false
      origin.current?.focus({ preventScroll: true })
    }
  }, [selected, saving])

  const save = async (value: string) => {
    if (!selected || saveLock.current) return
    const id = selected, path = value.trim()
    saveLock.current = true; setSaving(true); setProblem(undefined); onSavingChange?.(true)
    try {
      if (id === "r" || id === "python") {
        if (!await onSetInterpreter(id === "r" ? "R" : "python", path)) return
      } else {
        if (!client || !ready) return
        const stored = await client.get<{ paths: LocalToolPaths }>("setLocalTool", { tool: id, path })
        if (mounted.current) setPaths(current => {
          const next = { ...current }; if (stored.paths[id]) next[id] = stored.paths[id]; else delete next[id]
          return next
        })
      }
      if (mounted.current) { restoreFocus.current = true; setSelected(undefined) }
    } catch (error) { if (mounted.current) setProblem(textOf(error)) }
    finally { saveLock.current = false; if (mounted.current) { setSaving(false); onSavingChange?.(false) } }
  }
  const browse = async () => {
    if (!selected || saving) return
    const id = selected, turn = editGeneration.current
    try {
      const files = await window.dawn?.pickFiles?.("any", draft || currentPath(id))
      if (mounted.current && turn === editGeneration.current && files?.[0]) { setDraft(files[0]); await save(files[0]) }
    } catch (error) { if (mounted.current && turn === editGeneration.current) setProblem(textOf(error)) }
  }
  const label = rows.find(row => row.id === selected)?.label ?? ""
  const interpreterError = selected === "r" ? interpreterErrors?.R : selected === "python" ? interpreterErrors?.python : undefined

  return <section className="environment-overview" aria-label={t("本地环境")}>
    <p className="hint">{t("点击路径可更换。未配置也能继续，之后可在设置中补充。")}</p>
    <table className="environment-paths" aria-label={t("本地环境路径")}><tbody>
      {rows.map(row => {
        const current = currentPath(row.id), found = foundFor(row.id)
        const detected = found?.find(candidate => !candidate.problem)?.path
        const pending = row.id === "r" || row.id === "python" ? probing : detecting
        return <tr key={row.id}><th scope="row">{row.label}</th><td>
          <Row className="environment-path-choice" type="button" ref={node => { if (node) buttons.current.set(row.id, node); else buttons.current.delete(row.id) }}
            disabled={saving || (row.id !== "r" && row.id !== "python" && !ready)} aria-label={tf("更换 {0} 路径", row.label)} aria-expanded={selected === row.id} aria-haspopup="dialog" onClick={() => open(row.id)}>
            <span className={current ? "" : "environment-detected"} title={current ?? detected}>{current ?? detected ?? (pending ? t("正在检测…") : t("未检测到，可稍后配置"))}</span>
            {!current && detected ? <small>{t("待选择")}</small> : null}<下拉图标 />
          </Row>
        </td></tr>
      })}
    </tbody></table>
    <div className="environment-overview-actions">
      <Button variant="outline" size="sm" disabled={probing || detecting || saving} onClick={() => { void onProbe(); void refreshTools() }}>{t("重新检测")}</Button>
      <Button variant="outline" size="sm" disabled={saving} onClick={() => open("r")}>{t("调整路径")}</Button>
    </div>
    {probeError || probeProblem ? <p className="field-error" role="alert">{probeError ?? probeProblem}</p> : null}
    {selected ? <div ref={popup} className="environment-popover" role="dialog" aria-label={tf("选择 {0} 环境", label)} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close() }
    }}>
      <header><h3>{tf("选择 {0} 环境", label)}</h3><Button variant="ghost" size="sm" aria-label={t("关闭路径选择")} disabled={saving} onClick={close}><关闭图标 /></Button></header>
      <div className="environment-popover-choices" inert={saving}>
        {selected === "r" || selected === "python" ? <InterpreterPicker key={selected} language={selected === "r" ? "R" : "python"} candidates={candidates?.[selected]} probing={probing} current={currentPath(selected)} onPick={value => void save(value)} /> : <>
          {foundFor(selected)?.length ? foundFor(selected)!.map(candidate => <Row className={`environment-candidate${candidate.path === currentPath(selected) ? " is-current" : ""}`} key={candidate.path} onClick={() => void save(candidate.path)}>
            <span>{candidate.version ?? label}{candidate.path === currentPath(selected) ? <small>{t("当前选择")}</small> : null}</span><code>{candidate.path}</code>
            {candidate.problem ? <span className="field-error">{candidate.problem}</span> : null}
          </Row>) : <p className="hint">{t("未检测到环境，可以浏览本机文件或粘贴路径。")}</p>}
        </>}
      </div>
      <div className="environment-popover-actions">
        {window.dawn?.pickFiles ? <Button variant="outline" size="sm" disabled={saving} onClick={() => void browse()}>{t("浏览本机文件…")}</Button> : null}
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => setManual(true)}>{t("粘贴路径…")}</Button>
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => void save("")}>{t("暂不配置")}</Button>
      </div>
      {manual ? <form className="environment-manual" onSubmit={event => { event.preventDefault(); void save(draft) }}>
        <label>{t("可执行文件的完整路径")}
          <input className="control" value={draft} onChange={event => { setDraft(event.target.value); setProblem(undefined) }} disabled={saving} spellCheck={false}/></label>
        <Button variant="primary" size="sm" type="submit" disabled={saving}>{t("用这个")}</Button>
      </form> : null}
      {saving ? <p className="hint" role="status">{t("正在保存…")}</p> : null}
      {interpreterError || problem ? <p className="field-error" role="alert">{interpreterError ? tf("{0} 解释器未配置成功：{1}", label, interpreterError) : problem}</p> : null}
    </div> : null}
  </section>
}
