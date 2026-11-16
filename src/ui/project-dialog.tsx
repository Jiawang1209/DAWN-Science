import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectSummary } from '../protocol/index.js'
import { validProjectFolderName } from '../protocol/index.js'
import type { WorkbenchClient } from './client.js'
import { Button, Field } from './primitives.js'
import { 关闭图标, 文件夹图标 } from './icons.js'
import { t } from './i18n/index.js'

export interface ProjectDialogProps {
  client: Pick<WorkbenchClient, 'get' | 'pickDirectory'>
  project?: ProjectSummary | undefined
  defaultParent?: string | undefined
  onSaved: (project: ProjectSummary) => void
  onClose: () => void
}

export function ProjectDialog({ client, project, defaultParent, onSaved, onClose }: ProjectDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const busyRef = useRef(false), live = useRef(true)
  const [name, setName] = useState(project?.name ?? '')
  const [parent, setParent] = useState(defaultParent ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [scienceLayout, setScienceLayout] = useState(false)
  const [agentContext, setAgentContext] = useState('')
  const [busy, setBusy] = useState(false), [picking, setPicking] = useState(false)
  const [problem, setProblem] = useState<string>()
  useEffect(() => {
    live.current = true
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const node = dialog.current
    node?.showModal()
    node?.querySelector<HTMLInputElement>('input')?.focus()
    return () => { live.current = false; node?.close(); if (opener?.isConnected) opener.focus() }
  }, [])
  const choose = async () => {
    if (busyRef.current || picking) return
    setPicking(true); setProblem(undefined)
    try { const path = await client.pickDirectory(parent || defaultParent); if (live.current && path) setParent(path) }
    catch (error) { if (live.current) setProblem(error instanceof Error ? error.message : String(error)) }
    finally { if (live.current) setPicking(false) }
  }
  const save = async () => {
    if (busyRef.current || picking) return
    const trimmed = name.trim()
    if (!trimmed || (!project && !validProjectFolderName(trimmed))) { setProblem(t("项目名称必须是有效的单个文件夹名称")); return }
    if (!project && !/^(\/|[A-Za-z]:[\\/])/.test(parent.trim())) { setProblem(t("请选择父目录或粘贴绝对路径。")); return }
    busyRef.current = true; setBusy(true); setProblem(undefined)
    try {
      const saved = project
        ? await client.get<ProjectSummary>('updateProject', { projectId: project.projectId, name: trimmed, description: description.trim() })
        : await client.get<ProjectSummary>('createProject', { name: trimmed, parentDirectory: parent.trim(), description: description.trim(), scienceLayout, agentContext: agentContext.trim() })
      if (live.current) onSaved(saved)
    } catch (error) { if (live.current) setProblem(error instanceof Error ? error.message : String(error)) }
    finally { busyRef.current = false; if (live.current) setBusy(false) }
  }
  const target = project?.workspace ?? (parent.trim() && name.trim() ? `${parent.trim().replace(/[\\/]$/, '')}${parent.includes('\\') ? '\\' : '/'}${name.trim()}` : '')
  return createPortal(<dialog ref={dialog} className="project-dialog" aria-labelledby="project-dialog-title" onCancel={event => { event.preventDefault(); if (!busyRef.current && !picking) onClose() }}>
    <header><h2 id="project-dialog-title">{project ? t("项目设置") : t("新建项目")}</h2><Button variant="ghost" size="icon" aria-label={t("关闭弹窗")} disabled={busy || picking} onClick={onClose}><关闭图标 /></Button></header>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <div className="project-dialog-scroll">
      <fieldset disabled={busy || picking}>
        <Field id="project-name" label={t("项目名称")}>
          <input id="project-name" className="control" value={name} maxLength={120} autoComplete="off" placeholder={t("例如：植物基因组分析")} onChange={event => setName(event.target.value)} /></Field>
        {project ? <div className="field"><span className="field-label">{t("项目目录")}</span><p className="project-target">{project.workspace}</p><p className="field-hint">{t("修改名称只改变显示名称，不会重命名文件夹。")}</p></div> : <Field id="project-parent" label={t("父目录")} hint={t("在所选目录中新建同名项目文件夹。已有文件夹请使用“打开项目”。")}>
          <div className="project-folder-row">
          <input id="project-parent" className="control" value={parent} placeholder={t("选择文件夹，或粘贴绝对路径")} onChange={event => setParent(event.target.value)} /><Button variant="outline" size="sm" onClick={() => void choose()}><文件夹图标 />{t("浏览目录")}</Button></div>
          {target ? <p className="project-target" aria-live="polite">{target}</p> : null}
        </Field>}
        <Field id="project-description" label={t("项目说明（可选）")} hint={t("方便自己识别项目，不会发送给 AI。") }>
          <textarea id="project-description" className="control" rows={2} maxLength={4000} value={description} placeholder={t("记录这个项目要做什么")} onChange={event => setDescription(event.target.value)} /></Field>
        {!project ? <details className="project-options"><summary>{t("科研目录与 AI 约定")} <span className="hint">{t("可选")}</span></summary><div className="project-options-content">
          <label className="project-layout-switch">
          <input type="checkbox" className="project-layout-toggle" role="checkbox" checked={scienceLayout} onChange={event => setScienceLayout(event.target.checked)} /><span>{t("建立标准科研目录")}</span></label>
          {scienceLayout ? <p className="project-layout-paths">data/raw/ · data/processed/<br />analysis/scripts/ · analysis/notebooks/<br />figures/ · results/ · literature/</p> : null}
          <Field id="project-context" label={t("Agent 上下文（可选）")} hint={t("保存到项目的 AGENTS.md，新会话按运行时的项目指令机制读取。") }>
          <textarea id="project-context" className="control" rows={3} maxLength={32000} value={agentContext} placeholder={t("例如：使用 R 分析，图形保存到 figures/，保留原始数据。")} onChange={event => setAgentContext(event.target.value)} /></Field>
        </div></details> : <p className="field-hint">{t("AI 项目约定可在工作区的 AGENTS.md 中查看和修改。")}</p>}
      </fieldset>
      </div>
      {problem ? <p className="field-error" role="alert">{problem}</p> : null}
      <div className="project-dialog-actions"><Button variant="outline" size="sm" disabled={busy || picking} onClick={onClose}>{t("取消")}</Button><Button variant="primary" size="sm" type="submit" disabled={busy || picking}>{busy ? t("正在保存…") : project ? t("保存设置") : t("创建项目")}</Button></div>
    </form>
  </dialog>, document.body)
}
