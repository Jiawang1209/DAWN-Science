import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectSummary } from '../protocol/index.js'
import { validProjectFolderName } from '../protocol/index.js'
import type { WorkbenchClient } from './client.js'
import { Button, Field } from './primitives.js'
import { 科研目录 } from '../policy/science-layout.js'
import { 关闭图标, 文件夹图标, 文件夹描边图标, 新增文件夹图标, 勾图标, 下拉图标 } from './icons.js'
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
  const [showScienceLayout, setShowScienceLayout] = useState(false)
  const sciencePreviewId = useId()
  const scienceButton = useRef<HTMLButtonElement>(null)
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
    if (!project && !/^(\/|[A-Za-z]:[\\/])/.test(parent.trim())) { setProblem(t("请选择保存位置或粘贴绝对路径。")); return }
    busyRef.current = true; setBusy(true); setProblem(undefined)
    try {
      const saved = project
        ? await client.get<ProjectSummary>('updateProject', { projectId: project.projectId, name: trimmed, description: description.trim() })
        : await client.get<ProjectSummary>('createProject', { name: trimmed, parentDirectory: parent.trim(), description: description.trim(), scienceLayout })
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
        {project ? <div className="field"><span className="field-label">{t("项目目录")}</span><p className="project-target">{project.workspace}</p><p className="field-hint">{t("修改名称只改变显示名称，不会重命名文件夹。")}</p></div> : <Field id="project-parent" label={t("保存位置")}>
          <div className="project-folder-row">
          <input id="project-parent" className="control" value={parent} placeholder={t("选择文件夹，或粘贴绝对路径")} onChange={event => setParent(event.target.value)} /><Button variant="outline" size="sm" onClick={() => void choose()}><文件夹图标 />{t("选择文件夹")}</Button></div>
          {target ? <p className="project-target" aria-live="polite">{t("将创建")} <span>{target}</span></p> : null}
        </Field>}
        <Field id="project-description" label={t("项目说明（可选）")} hint={t("方便自己识别项目，不会发送给 AI。") }>
          <textarea id="project-description" className="control" rows={2} maxLength={4000} value={description} placeholder={t("记录这个项目要做什么")} onChange={event => setDescription(event.target.value)} /></Field>
        {!project ? <div>
          <Button ref={scienceButton} variant="outline" size="sm" className="project-science-trigger"
            aria-pressed={scienceLayout} aria-expanded={showScienceLayout} aria-controls={sciencePreviewId}
            onClick={() => {
              if (!scienceLayout) { setScienceLayout(true); setShowScienceLayout(true) }
              else setShowScienceLayout(value => !value)
            }}>
            {scienceLayout ? <勾图标 /> : <新增文件夹图标 />}
            {scienceLayout ? t("已选择科研目录") : t("初始化科研目录")}
            <下拉图标 className={showScienceLayout ? "project-science-chevron expanded" : "project-science-chevron"} />
          </Button>
          <section id={sciencePreviewId} className="project-science-preview" role="region" aria-label={t("科研目录预览")} hidden={!showScienceLayout}>
            <div className="project-science-preview-head"><span>{t("创建项目时一并建立以下目录")}</span>
              <Button variant="text" size="inline" onClick={() => { setScienceLayout(false); setShowScienceLayout(false); scienceButton.current?.focus() }}>{t("取消添加")}</Button>
            </div>
            <dl className="project-science-tree">{[
              { folder: 'data', detail: t("原始数据与处理后数据") },
              { folder: 'analysis', detail: t("R、Python 脚本与笔记本") },
              { folder: 'figures', detail: t("图形与可视化结果") },
              { folder: 'results', detail: t("结果表格、模型与报告") },
              { folder: 'literature', detail: t("参考文献与阅读资料") },
            ].map(({ folder, detail }) => {
              const paths = 科研目录.filter(path => path === folder || path.startsWith(folder + '/'))
              return <div className="project-science-tree-row" key={folder}>
                <dt data-path={paths.some(path => path === folder) ? folder : undefined}><文件夹描边图标 />{folder}/</dt>
                <dd>{paths.some(path => path.includes('/')) ? <div className="project-science-children">{paths.map((path, index) => <span key={path} data-path={path}>{index ? ' · ' : ''}{path.slice(folder.length + 1)}/</span>)}</div> : null}
                  <div className="project-science-detail">{detail}</div></dd>
              </div>
            })}</dl>
          </section>
          {!showScienceLayout ? <p className="field-hint project-science-hint">{scienceLayout ? t("创建项目时将一并生成科研目录。") : t("按需添加，也可以进入工作台后再初始化。")}</p> : null}
        </div> : null}
      </fieldset>
      </div>
      {problem ? <p className="field-error" role="alert">{problem}</p> : null}
      <div className="project-dialog-actions"><Button variant="outline" size="sm" disabled={busy || picking} onClick={onClose}>{t("取消")}</Button><Button variant="primary" size="sm" type="submit" disabled={busy || picking}>{busy ? t("正在保存…") : project ? t("保存设置") : t("创建项目")}</Button></div>
    </form>
  </dialog>, document.body)
}
