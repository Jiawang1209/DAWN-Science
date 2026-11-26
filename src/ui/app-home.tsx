import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import type { ProjectSummary, SessionSummary, RemoteConnection } from '../protocol/index.js'
import type { WorkbenchClient } from './client.js'
import { Button } from './primitives.js'
import { 文件夹图标, 加号图标, 返回图标, 收藏图标, 设置图标, 对话描边图标, 服务器图标 } from './icons.js'
import rpIcon from '../../packaging/icon.svg'
import { 短路径, 多久之前 } from './format.js'
import { $lang, t, tf } from './i18n/index.js'

export interface AppHomeProps {
  client: Pick<WorkbenchClient, 'get'>
  projects: readonly ProjectSummary[]
  connections?: readonly Pick<RemoteConnection, 'id' | 'username' | 'host' | 'port'>[] | undefined
  onProjectsLoaded?: ((projects: readonly ProjectSummary[]) => void) | undefined
  ready: boolean
  onOpenProject: (project: ProjectSummary) => void
  onOpenSession: (session: SessionSummary) => Promise<void>
  onChooseProject: () => Promise<void>
  onNewChat: () => void
  onCreateProject?: (() => void) | undefined
  onEditProject?: ((project: ProjectSummary) => void) | undefined
  onToggleFavorite?: ((project: ProjectSummary) => Promise<void>) | undefined
}

/** Backend summaries are not written into the active project's session store. */
export function AppHome({ client, projects: knownProjects, connections = [], onProjectsLoaded, ready, onOpenProject, onOpenSession, onChooseProject, onNewChat, onCreateProject, onEditProject, onToggleFavorite }: AppHomeProps) {
  useStore($lang)
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [projectProblem, setProjectProblem] = useState<string>()
  const [allSessions, setAllSessions] = useState<readonly SessionSummary[]>([])
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
    setLoading(true); setAllSessions([]); setProblem(undefined); setProjectProblem(undefined)
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
      setAllSessions([...new Map(rows.map(row => [row.sessionId, row])).values()]
        .filter(row => row.kind !== 'pty' && !row.archivedAt)
        .sort((a, b) => (b.lastActiveAt ?? b.createdAt).localeCompare(a.lastActiveAt ?? a.createdAt) || a.sessionId.localeCompare(b.sessionId)))
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
  const formal = projects.filter(project => !project.temporary).sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))
  const recent = allSessions
  const remoteGroups = new Map<string, { session: SessionSummary; count: number }>()
  for (const session of allSessions) {
    if (!session.remote) continue
    const key = JSON.stringify([session.projectId, session.remote.connectionId, session.remote.cwd])
    const existing = remoteGroups.get(key)
    if (existing) existing.count++
    else remoteGroups.set(key, { session, count: 1 })
  }
  const sessionProject = (session: SessionSummary) => projects.find(project => project.projectId === session.projectId)
  return <main className="app-home" aria-label={t("首页")}><div className="app-home-content">
    <div className="app-home-hero">
      <div className="app-home-brand"><img src={rpIcon} alt="" /><div><h1>DAWN Science</h1><p>{t("让想法，在研究中生长。")}</p></div></div>
      <div className="app-home-actions">
        <Button variant="outline" size="sm" disabled={busy} onClick={onNewChat}><对话描边图标 />{t("新建对话")}</Button>
        <Button variant="outline" size="sm" disabled={!ready || busy} onClick={() => void act(onChooseProject)}><文件夹图标 />{t("打开项目")}</Button>
        {onCreateProject ? <Button variant="outline" size="sm" disabled={!ready || busy} onClick={onCreateProject}><加号图标 />{t("新建项目")}</Button> : null}
      </div>
    </div>
    {actionProblem ? <p className="caveat" role="alert">{actionProblem}</p> : null}
    <div className="app-home-columns">
      <section aria-labelledby="app-home-projects">
        <h2 id="app-home-projects">{t("项目")}</h2>
        {projectProblem ? <div className="app-home-problem" role="alert"><p>{t("项目列表读取失败，请重试。")}</p><p className="hint">{projectProblem}</p><Button variant="text" size="inline" onClick={() => setRetry(value => value + 1)}>{t("重试")}</Button></div> : !ready || !projectsLoaded ? <p role="status" className="hint">{t("正在连接…")}</p> : formal.length ? <div className="app-home-list">{[true, false].map(favorite => {
          const group = formal.filter(project => !!project.favorite === favorite)
          if (!group.length) return null
          const label = favorite ? t("已收藏 · 优先显示") : formal.some(project => project.favorite) ? t("其他项目") : t("本地项目")
          return <div key={String(favorite)} role="group" aria-label={label} className="app-home-project-group"><h3>{label}</h3>{group.map(project => <article key={project.projectId} className="app-home-project-card" data-favorite={!!project.favorite}>
          <Button variant="ghost" size="inline" className="app-home-project" disabled={busy} onClick={() => onOpenProject(project)}>
            <span className="app-home-folder"><文件夹图标 /></span><span className="app-home-details"><strong>{project.name}</strong><span className="app-home-path" title={project.workspace}>{短路径(project.workspace)}</span>{project.description ? <span className="app-home-description" title={project.description}>{project.description}</span> : null}</span><span aria-hidden="true">›</span>
          </Button>
          <div className="app-home-project-footer"><span className="hint">{tf("{0} 个会话", project.totalSessionCount)}</span><div>
            {onToggleFavorite ? <Button variant="ghost" size="row-action" disabled={busy} aria-pressed={!!project.favorite} aria-label={project.favorite ? tf("取消收藏项目：{0}", project.name) : tf("收藏项目：{0}", project.name)} onClick={() => void act(() => onToggleFavorite(project))}><收藏图标 />{project.favorite ? <span className="app-home-favorite-label">{t("已收藏")}</span> : null}</Button> : null}
            {onEditProject ? <Button variant="ghost" size="row-action" disabled={busy} aria-label={tf("项目设置：{0}", project.name)} onClick={() => onEditProject(project)}><设置图标 /></Button> : null}
          </div></div>
        </article>)}</div>
        })}</div> : <p className="hint">{t("还没有项目，打开一个文件夹即可开始。")}</p>}
        {!loading && remoteGroups.size ? <div role="group" aria-label={t("远程工作区")} className="app-home-project-group app-home-remotes">
          <h3>{t("远程工作区")}</h3>
          {[...remoteGroups].map(([key, { session, count }]) => {
            const remote = session.remote!
            const connection = connections.find(row => row.id === remote.connectionId)
            const host = connection?.host.includes(':') && !connection.host.startsWith('[') ? `[${connection.host}]` : connection?.host
            const address = connection
              ? connection.port === 22 ? `${connection.username}@${host}:${remote.cwd}` : `ssh://${connection.username}@${host}:${connection.port}${remote.cwd}`
              : `${tf("服务器配置不可用：{0}", remote.label)} · ${remote.cwd}`
            const owner = sessionProject(session)
            const name = owner && !owner.temporary ? owner.name : remote.cwd.split('/').filter(Boolean).at(-1) ?? '/'
            return <Button key={key} variant="ghost" size="card" className="app-home-project app-home-remote-card" disabled={busy} onClick={() => void act(() => onOpenSession(session))}>
              <span className="app-home-folder"><服务器图标 /></span><span className="app-home-details"><strong>{name}</strong><span className="app-home-path" title={address}>{address}</span><span className="hint">{tf("{0} 个会话", count)} · {t("继续远程会话")}</span></span><返回图标 className="app-home-forward" />
            </Button>
          })}
        </div> : null}
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
            {index ? <对话描边图标 /> : null}<span className="app-home-details">{index === 0 ? <span className="app-home-resume-label">{t("上次进行到这里")}</span> : null}<strong>{session.title ?? t("新会话")}</strong><span className="hint">{context} · {多久之前(session.lastActiveAt ?? session.createdAt, now)}</span></span>
            <span className="app-home-continue">{index === 0 ? t("继续") : null}<返回图标 className="app-home-forward" /></span>
          </Button>
        })}</div> : null}
      </section>
    </div>
    <p className="app-home-hint hint">{!formal.length ? t("新建对话即可开始，不必先创建项目或配置本地环境。") : null}</p>
    </div>
  </main>
}

export function HomeButton({ onClick }: { onClick: () => void }) {
  return <Button variant="ghost" size="icon" className="home-button" aria-label={t("首页")} data-tooltip={t("返回首页")} onClick={onClick}><返回图标 /></Button>
}
