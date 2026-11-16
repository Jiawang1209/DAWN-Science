import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import type { ProjectSummary, SessionSummary } from '../protocol/index.js'
import type { WorkbenchClient } from './client.js'
import { Button } from './primitives.js'
import { 文件夹图标, 加号图标, 返回图标 } from './icons.js'
import { 短路径, 多久之前 } from './format.js'
import { $lang, t, tf } from './i18n/index.js'

export interface AppHomeProps {
  client: Pick<WorkbenchClient, 'get'>
  projects: readonly ProjectSummary[]
  onProjectsLoaded?: ((projects: readonly ProjectSummary[]) => void) | undefined
  ready: boolean
  onOpenProject: (project: ProjectSummary) => void
  onOpenSession: (session: SessionSummary) => Promise<void>
  onChooseProject: () => Promise<void>
  onNewChat: () => void
}

/** Backend summaries are not written into the active project's session store. */
export function AppHome({ client, projects: knownProjects, onProjectsLoaded, ready, onOpenProject, onOpenSession, onChooseProject, onNewChat }: AppHomeProps) {
  useStore($lang)
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [projectProblem, setProjectProblem] = useState<string>()
  const [recent, setRecent] = useState<readonly SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState<string>()
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [actionProblem, setActionProblem] = useState<string>()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    let cancelled = false
    if (!ready) { setLoading(true); return }
    setLoading(true); setProblem(undefined); setProjectProblem(undefined)
    void (async () => {
      let projects: readonly ProjectSummary[]
      try {
        projects = await client.get<ProjectSummary[]>('listProjects', {})
        if (cancelled) return
        setProjects(projects); setProjectsLoaded(true)
        onProjectsLoaded?.(projects)
      } catch (error) {
        if (!cancelled) { setProjectProblem(error instanceof Error ? error.message : String(error)); setProjectsLoaded(false); setLoading(false) }
        return
      }
      const rows: SessionSummary[] = []
      const errors: string[] = []
      let index = 0
      await Promise.all(Array.from({ length: Math.min(4, projects.length) }, async () => {
        while (!cancelled && index < projects.length) {
          const project = projects[index++]!
          try { rows.push(...await client.get<SessionSummary[]>('listSessions', { projectId: project.projectId })) }
          catch (error) { errors.push(error instanceof Error ? error.message : String(error)) }
        }
      }))
      if (cancelled) return
      setRecent([...new Map(rows.map(row => [row.sessionId, row])).values()]
        .filter(row => row.kind !== 'pty' && !row.archivedAt)
        .sort((a, b) => (b.lastActiveAt ?? b.createdAt).localeCompare(a.lastActiveAt ?? a.createdAt) || a.sessionId.localeCompare(b.sessionId))
        .slice(0, 6))
      setProblem(errors.length ? errors[0] : undefined)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [client, knownProjects, onProjectsLoaded, ready, retry])
  const act = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setActionProblem(undefined)
    try { await action() }
    catch (error) { setActionProblem(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  const formal = projects.filter(project => !project.temporary)
  const sessionProject = (session: SessionSummary) => projects.find(project => project.projectId === session.projectId)
  return <main className="app-home" aria-label={t("首页")}>
    <div className="app-home-hero">
      <div><h1>{t("继续你的研究")}</h1><p className="hint">{t("选择一个项目，或从一段对话开始。")}</p></div>
      <div className="app-home-actions">
        <Button variant="outline" size="sm" disabled={!ready || busy} onClick={() => void act(onChooseProject)}><文件夹图标 />{t("打开项目")}</Button>
        <Button variant="primary" size="sm" disabled={busy} onClick={onNewChat}><加号图标 />{t("新建对话")}</Button>
      </div>
    </div>
    {actionProblem ? <p className="caveat" role="alert">{actionProblem}</p> : null}
    <div className="app-home-columns">
      <section aria-labelledby="app-home-projects">
        <h2 id="app-home-projects">{t("项目")}</h2>
        {projectProblem ? <div className="app-home-problem" role="alert"><p>{t("项目列表读取失败，请重试。")}</p><p className="hint">{projectProblem}</p><Button variant="text" size="inline" onClick={() => setRetry(value => value + 1)}>{t("重试")}</Button></div> : !ready || !projectsLoaded ? <p role="status" className="hint">{t("正在连接…")}</p> : formal.length ? <div className="app-home-list">{formal.map(project => <Button key={project.projectId} variant="ghost" size="card" className="app-home-project" disabled={busy} onClick={() => onOpenProject(project)}>
          <span className="app-home-details"><strong><文件夹图标 />{project.name}</strong><span className="app-home-path" title={project.workspace}>{短路径(project.workspace)}</span><span className="hint">{tf("{0} 个会话", project.totalSessionCount)}</span></span><span aria-hidden="true">›</span>
        </Button>)}</div> : <p className="hint">{t("还没有项目，打开一个文件夹即可开始。")}</p>}
      </section>
      <section aria-labelledby="app-home-sessions" aria-busy={loading}>
        <h2 id="app-home-sessions">{t("最近会话")}</h2>
        {loading ? <p role="status" className="hint">{t("正在读取最近会话…")}</p> : null}
        {problem ? <div className="app-home-problem" role="alert"><p>{t("部分会话未能读取，请重试。")}</p><p className="hint">{problem}</p><Button variant="text" size="inline" onClick={() => setRetry(value => value + 1)}>{t("重试")}</Button></div> : null}
        {!loading && projectsLoaded && !recent.length && !problem ? <p className="hint">{t("还没有会话，开始一段新对话吧。")}</p> : null}
        {!loading ? <div className="app-home-list">{recent.map((session, index) => {
          const project = sessionProject(session)
          const context = session.remote?.label ?? (project && !project.temporary ? project.name : t("普通对话"))
          return <Button key={session.sessionId} variant="ghost" size="card" className={`app-home-session${index === 0 ? ' app-home-resume' : ''}`} disabled={busy} onClick={() => void act(() => onOpenSession(session))}>
            <span className="app-home-details">{index === 0 ? <span className="hint">{t("上次进行到这里")}</span> : null}<strong>{session.title ?? t("新会话")}</strong><span className="hint">{context} · {多久之前(session.lastActiveAt ?? session.createdAt, now)}</span></span>
            <span className="app-home-continue">{index === 0 ? t("继续") : null}<返回图标 className="app-home-forward" /></span>
          </Button>
        })}</div> : null}
      </section>
    </div>
    <p className="app-home-hint hint">{t("新建对话即可开始，不必先创建项目或配置本地环境。")}</p>
  </main>
}

export function HomeButton({ onClick }: { onClick: () => void }) {
  return <Button variant="ghost" size="sm" onClick={onClick}><返回图标 />{t("首页")}</Button>
}
