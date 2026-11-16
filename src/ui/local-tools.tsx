import { useEffect, useRef, useState } from "react"
import { LOCAL_TOOLS, type LocalToolCandidate, type LocalToolId, type LocalToolPaths, type LocalToolState } from "../protocol/index.js"
import type { WorkbenchClient } from "./client.js"
import { Button } from "./primitives.js"
import { t, tf, msgid } from "./i18n/index.js"

const descriptions: Record<LocalToolId, string> = {
  uv: msgid("Python 依赖与环境"),
  pixi: msgid("项目依赖与多语言环境"),
  conda: msgid("Conda 环境与包管理"),
  mamba: msgid("Conda 环境与包管理"),
  node: msgid("本地命令的 JavaScript 运行时"),
  npm: msgid("JavaScript 包与脚本"),
  git: msgid("本地命令中的版本管理"),
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

/** Detection never selects for the user. Each row owns its draft across refreshes. */
export function LocalToolsPanel({ client, active = true }: { client: WorkbenchClient; active?: boolean }) {
  const [paths, setPaths] = useState<LocalToolPaths>({})
  const [tools, setTools] = useState<LocalToolState["tools"]>([])
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  const generation = useRef(0)
  const mounted = useRef(false)
  const loaded = useRef(false)

  const refresh = async () => {
    const turn = ++generation.current
    setBusy(true)
    setError(undefined)
    try {
      if (!loaded.current) {
        const stored = await client.get<{ paths: LocalToolPaths }>("getLocalTools", {})
        if (!mounted.current || turn !== generation.current) return
        setPaths(stored.paths)
        setReady(true)
        loaded.current = true
      }
      const found = await client.get<LocalToolState>("probeLocalTools", {})
      if (mounted.current && turn === generation.current) setTools(found.tools)
    } catch (error) {
      if (mounted.current && turn === generation.current) setError(message(error))
    } finally {
      if (mounted.current && turn === generation.current) setBusy(false)
    }
  }

  useEffect(() => {
    mounted.current = true
    if (active) void refresh()
    return () => { mounted.current = false; ++generation.current }
  }, [client, active])

  const save = async (tool: LocalToolId, path: string) => {
    const stored = await client.get<{ paths: LocalToolPaths }>("setLocalTool", { tool, path })
    if (!mounted.current) return
    // Different rows can return snapshots from different instants; merge only this tool.
    setPaths(current => {
      const next = { ...current }
      const selected = stored.paths[tool]
      if (selected) next[tool] = selected
      else delete next[tool]
      return next
    })
  }

  return <section className="local-tools" aria-label={t("本地工具")}>
    <header className="local-tools-head">
      <div>
        <h3>{t("本地工具")}</h3>
        <p>{t("自动检测已有工具，选择或填写路径后保存。缺少工具不影响对话。")}</p>
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
        {busy ? t("正在检测…") : t("重新检测工具")}
      </Button>
    </header>
    <p className="hint">{t("保存的工具用于 AI 本地命令和新开的本地终端；已打开的终端请重新打开。")}</p>
    <p className="hint">{t("Node.js 用于本地命令，不替换 DAWN 内置运行时；Git 设置不改变应用内置的 Git 操作。")}</p>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {(["environment", "development"] as const).map(group => <section className="local-tools-group" key={group}>
      <h4>{group === "environment" ? t("环境管理工具") : t("开发工具")}</h4>
      {LOCAL_TOOLS.filter(tool => tool.group === group).map(tool => <ToolRow
        key={tool.id}
        id={tool.id}
        label={tool.label}
        current={paths[tool.id]}
        candidates={tools.find(found => found.id === tool.id)?.candidates}
        disabled={!ready}
        onSave={save}
      />)}
    </section>)}
  </section>
}

function ToolRow({ id, label, current, candidates, disabled, onSave }: {
  id: LocalToolId
  label: string
  current: string | undefined
  candidates: LocalToolCandidate[] | undefined
  disabled: boolean
  onSave: (tool: LocalToolId, path: string) => Promise<void>
}) {
  const [draftOverride, setDraft] = useState<string>()
  const draft = draftOverride ?? current ?? ""
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const latest = useRef(draft)
  latest.current = draft
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const change = (value: string) => {
    latest.current = value
    setDraft(value)
    setError(undefined)
  }
  const dirty = draft.trim() !== (current ?? "")
  const selected = candidates?.find(candidate => candidate.path === (current ?? ""))
  let status: string
  if (dirty) status = t("尚未保存")
  else if (current) status = selected?.problem ? t("路径需检查") : t("已配置")
  else if (candidates === undefined) status = t("待检测")
  else status = candidates.length ? t("已检测，待选择") : t("未找到，可稍后配置")

  const submit = async () => {
    const value = draft.trim()
    setSaving(true)
    setError(undefined)
    try {
      await onSave(id, value)
      if (alive.current && latest.current.trim() === value) setDraft(undefined)
    } catch (error) {
      if (alive.current) setError(message(error))
    } finally {
      if (alive.current) setSaving(false)
    }
  }
  const pick = async () => {
    try {
      const chosen = await window.dawn?.pickFiles?.("any", draft || current)
      if (alive.current && chosen?.[0]) change(chosen[0])
    } catch (error) {
      if (alive.current) setError(message(error))
    }
  }

  return <div className="local-tool-row" role="group" aria-label={label}>
    <div className="local-tool-title">
      <div><strong>{label}</strong><span className="local-tool-description">{t(descriptions[id])}</span></div>
      <span className={`local-tool-state${dirty ? " is-draft" : ""}`}>{status}</span>
    </div>
    {candidates && candidates.length > 0 ? (
      <select className="control" aria-label={tf("{0} 候选路径", label)} value={candidates.some(candidate => candidate.path === draft) ? draft : ""} onChange={event => { if (event.target.value) change(event.target.value) }}>
        <option value="">{t("选择检测到的路径")}</option>
        {candidates.map(candidate => <option key={candidate.path} value={candidate.path}>
          {candidate.path}{candidate.version ? ` · ${candidate.version}` : ""}{candidate.problem ? ` · ${t("不可用")}` : ""}
        </option>)}
      </select>
    ) : null}
    <form className="local-tool-path" onSubmit={event => {
      event.preventDefault()
      if (dirty && !saving && !disabled) void submit()
    }}>
      <input className="control" aria-label={tf("{0} 工具路径", label)} value={draft} onChange={event => change(event.target.value)} placeholder={t("输入工具的完整路径")} spellCheck={false} />
      {window.dawn?.pickFiles ? <Button variant="outline" size="sm" type="button" onClick={() => void pick()}>{t("选择文件")}</Button> : null}
      <Button variant="primary" size="sm" type="submit" disabled={!dirty || saving || disabled}>{saving ? t("正在保存…") : t("保存")}</Button>
    </form>
    {selected?.version ? <p className="local-tool-version">{selected.version}</p> : null}
    {selected?.problem ? <p className="field-error">{selected.problem}</p> : null}
    {error ? <p className="field-error" role="alert">{error}</p> : null}
  </div>
}
