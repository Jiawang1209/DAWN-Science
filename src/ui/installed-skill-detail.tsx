import { useEffect, useRef, useState } from 'react'
import { Streamdown } from 'streamdown'
import type { InstalledSkillFile, InstalledSkillFiles } from '../protocol/skill-management.js'
import type { AgentSkill, SkillActions } from './skills.js'
import { Button, Loader } from './primitives.js'
import { SkillOriginDetails } from './skill-discovery.js'
import { t, tf } from './i18n/index.js'

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export function InstalledSkillDetail({ skill, actions, onBack, onChanged }: {
  skill: AgentSkill; actions: SkillActions; onBack: () => void; onChanged: () => void
}) {
  const [files, setFiles] = useState<InstalledSkillFiles>(), [path, setPath] = useState('SKILL.md')
  const [file, setFile] = useState<InstalledSkillFile>(), [error, setError] = useState('')
  const [source, setSource] = useState(false), [reload, setReload] = useState(0)
  const [tags, setTags] = useState((skill.tags ?? []).join(', ')), [saving, setSaving] = useState(false), [feedback, setFeedback] = useState('')
  const heading = useRef<HTMLHeadingElement>(null), live = useRef(true)
  const actionsRef = useRef(actions); actionsRef.current = actions
  useEffect(() => {
    heading.current?.focus()
    live.current = true
    return () => { live.current = false }
  }, [])
  useEffect(() => { setTags((skill.tags ?? []).join(', ')) }, [skill.tags])
  useEffect(() => {
    let active = true
    setError('')
    actionsRef.current.listFiles?.(skill.filePath).then(value => { if (active) setFiles(value) }).catch(error => { if (active) setError(message(error)) })
    return () => { active = false }
  }, [skill.filePath, reload])
  useEffect(() => {
    let active = true
    setFile(undefined); setError('')
    actionsRef.current.readFile?.(skill.filePath, path).then(value => { if (active) setFile(value) }).catch(error => { if (active) setError(message(error)) })
    return () => { active = false }
  }, [skill.filePath, path, reload])
  const saveTags = async (reset: boolean) => {
    if (!actions.setTags || saving) return
    setSaving(true); setFeedback('')
    try {
      await actions.setTags(skill.filePath, reset ? undefined : tags.split(/[,，]/).map(x => x.trim()).filter(Boolean), reset)
      if (live.current) { setFeedback(t("标签已保存")); onChanged() }
    } catch (error) { if (live.current) setFeedback(message(error)) }
    finally { if (live.current) setSaving(false) }
  }
  const markdown = /\.md$/i.test(path)
  const body = file?.text?.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '') ?? ''
  return <div className="skills-page installed-skill-detail">
    <div className="skills-actions">
      <Button variant="ghost" size="sm" disabled={saving} onClick={onBack}>{t("技能目录")}</Button>
      <Button size="sm" onClick={() => setReload(n => n + 1)}>{t("刷新详情")}</Button>
    </div>
    <header className="skills-head">
      <h2 ref={heading} tabIndex={-1}>{skill.name}</h2>
      <p>{skill.description}</p>
      <p className="hint">{skill.from === 'builtin' ? t("自带") : skill.from === 'project' ? t("这个项目带的") : t("你写的")} · {skill.invocation === 'off' ? t("已关") : skill.invocation === 'manual' ? t("只能手动调用") : t("已启用")}</p>
      <code className="skill-path">{skill.filePath}</code>
      {skill.hasOrigin && actions.discovery ? <SkillOriginDetails filePath={skill.filePath} actions={actions.discovery} /> : null}
    </header>
    {actions.setTags ? <section className="skill-tag-editor" aria-label={t("标签管理")}>
      <label>{t("个人标签")}
        <input className="control" aria-label={t("个人标签")} value={tags} maxLength={3200} disabled={saving} onChange={e => setTags(e.target.value)} />
      </label>
      <p className="hint">{t("用逗号分隔。标签仅保存在本机，不改动技能文件。")}</p>
      <div className="skills-actions">
        <Button size="sm" aria-label={tf("应用标签：{0}", skill.name)} disabled={saving} onClick={() => void saveTags(false)}>{t("应用标签")}</Button>
        <Button variant="secondary" size="sm" disabled={saving} onClick={() => void saveTags(true)}>{t("恢复原有标签")}</Button>
      </div>
      {feedback ? <p role="status">{feedback}</p> : null}
    </section> : null}
    <section aria-label={t("技能文件")}>
      <h3>{t("技能文件")}</h3>
      <p className="hint">{t("只读浏览，预览不会执行脚本。")}</p>
      {files?.notices.map(notice => <p className="caveat" key={notice}>{notice}</p>)}
      <div className="skill-package-browser">
        <nav className="skill-package-files" aria-label={t("包内文件")}>
          {!files && !error ? <Loader label={t("正在读取技能文件")} /> : null}
          {files?.files.map(item => <Button key={item.path} variant="ghost" size="sm" aria-current={path === item.path ? 'true' : undefined} aria-label={item.path} onClick={() => setPath(item.path)}>{item.path}<span className="hint">{tf("{0} 字节", item.bytes)}</span></Button>)}
        </nav>
        <div className="installed-skill-content">
          <div className="skills-actions"><strong>{path}</strong>{markdown ? <>
            <Button size="sm" aria-label={tf("文档视图：{0}", path)} variant={source ? 'secondary' : 'primary'} aria-pressed={!source} onClick={() => setSource(false)}>{t("文档视图")}</Button>
            <Button size="sm" variant={source ? 'primary' : 'secondary'} aria-pressed={source} onClick={() => setSource(true)}>{t("源码")}</Button>
          </> : null}</div>
          {error ? <p className="caveat" role="alert">{error}</p> : null}
          {!file && !error ? <Loader label={t("正在读取技能文件")} /> : null}
          {file?.notice ? <p className="hint">{file.notice}</p> : null}
          {file?.text !== undefined ? markdown && !source ? <div className="md">
            <Streamdown mode="static" animated={false} controls={false} skipHtml rehypePlugins={[]} components={{
              img: ({ alt }) => <span>{alt}</span>,
              a: ({ href, children }) => {
                const relative = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) + (href ?? '') : href ?? ''
                return files?.files.some(file => file.path === relative) ? <Button variant="text" size="inline" onClick={() => setPath(relative)}>{children}</Button> : <span>{children}</span>
              },
            }}>{body}</Streamdown>
          </div> : <pre>{file.text}</pre> : null}
        </div>
      </div>
    </section>
  </div>
}
