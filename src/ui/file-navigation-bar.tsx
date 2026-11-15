import { useEffect, useRef, useState, type ReactNode } from "react"
import { fileAncestors, relativeFilePath } from "./file-navigation.js"
import { Button } from "./primitives.js"
import { 复制图标, 勾图标, 铅笔图标, 返回图标, 上箭头图标, 文件夹描边图标 } from "./icons.js"
import { t, tf } from "./i18n/index.js"
import { 在组词 } from "./ime.js"
import type { DirectoryNavigation } from "./state/file-navigation.js"

export function FileNavigationControls({ navigation }: { navigation: DirectoryNavigation }) {
  return <div className="files-navigation-controls">
    <Button variant="ghost" size="icon" aria-label={t("后退")} disabled={!navigation.canBack} onClick={() => void navigation.back()}><返回图标 /></Button>
    <Button variant="ghost" size="icon" aria-label={t("前进")} disabled={!navigation.canForward} onClick={() => void navigation.forward()}><span className="files-forward-icon"><返回图标 /></span></Button>
    <Button variant="ghost" size="icon" aria-label={t("上一级")} disabled={!navigation.directory?.parentPath} onClick={() => { if (navigation.directory?.parentPath) void navigation.navigate(navigation.directory.parentPath) }}><上箭头图标 /></Button>
  </div>
}

export function FileNavigationBar({ path, projectPath, navigate, projectAction }: { path: string; projectPath: string; navigate: (path: string) => unknown; projectAction?: ReactNode }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(path)
  const [copied, setCopied] = useState(false), [copying, setCopying] = useState(false), [note, setNote] = useState("")
  const input = useRef<HTMLInputElement>(null), current = useRef(path), timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  current.current = path
  useEffect(() => { setEditing(false); setDraft(path); setCopied(false); setNote(""); clearTimeout(timer.current) }, [path])
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select() } }, [editing])
  const edit = () => { setDraft(path); setEditing(true) }
  const go = () => { if (draft.trim()) { navigate(draft.trim()); setEditing(false) } }
  const copy = async () => {
    const target = path
    setCopied(false); setCopying(true); setNote(""); clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(target)
      if (current.current === target) { setCopied(true); setNote(tf("已复制绝对路径：{0}", target)); timer.current = setTimeout(() => setCopied(false), 1800) }
    } catch (error) {
      if (current.current === target) { edit(); setNote(tf("复制不了：{0}", error instanceof Error ? error.message : String(error))) }
    } finally { setCopying(false) }
  }
  const ancestors = fileAncestors(path)
  const crumbs = ancestors.length > 4 ? [ancestors[0]!, { label: "…", path: "" }, ...ancestors.slice(-2)] : ancestors
  return <div className="files-browser-location">
    <div className="files-address-bar">
      {editing ? <div className="files-address-editor">
        <input ref={input} className="control" value={draft} aria-label={t("跳到路径")} onChange={e => setDraft(e.target.value)} onKeyDown={e => {
        if (在组词(e)) return
        if (e.key === "Enter") { e.preventDefault(); go() }
        if (e.key === "Escape") { setDraft(path); setEditing(false) }
      }} /><Button variant="ghost" size="sm" aria-label={t("前往路径")} onClick={go}>↵</Button></div> : <>
        <nav className="files-breadcrumbs" aria-label={t("当前位置")}>{crumbs.map((crumb, index) => <span key={crumb.path || "ellipsis"}>
          {index > 0 && crumbs[index - 1]?.path !== "/" ? <span className="files-path-separator" aria-hidden="true">/</span> : null}
          <Button variant="ghost" size="inline" aria-current={crumb.path === path ? "location" : undefined} onClick={() => crumb.path ? navigate(crumb.path) : edit()}>{crumb.label}</Button>
        </span>)}</nav>
        <Button variant="ghost" size="icon" aria-label={t("输入目录路径")} disabled={!path} onClick={edit}><铅笔图标 /></Button>
      </>}
      <Button variant="ghost" size="sm" className="files-copy-path" aria-label={t("复制当前目录完整路径")} disabled={!path || copying} onClick={() => void copy()}>{copied ? <勾图标 /> : <复制图标 />}{copied ? t("已复制") : t("复制路径")}</Button>
    </div>
    <div className="files-project-shortcut" role="group" aria-label={t("文件根目录")}><span><文件夹描边图标 />{tf("项目：{0}", projectPath.split("/").filter(Boolean).at(-1) || projectPath)}</span><div className="files-project-actions">{projectAction}<Button variant="text" size="inline" onClick={() => navigate(projectPath)}><返回图标 />{t("回到项目")}</Button></div></div>
    {path && projectPath && relativeFilePath(projectPath, path) === undefined ? <p className="hint files-browser-scope">{t("项目外 · 会话工作目录保持不变")}</p> : null}
    {note ? <p className="hint files-copy-note" role="status">{note}</p> : null}
  </div>
}
