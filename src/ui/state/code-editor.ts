import { atom } from 'nanostores'
import { t } from '../i18n/index.js'
import { isAbsoluteFilePath } from '../file-navigation.js'
import { createScriptEditRequest, scriptEditResult, type ScriptEditRequest } from '../code-editor-ai.js'

export type CodeOwner = { projectId?: string; sessionId?: string; connectionId?: string }
export interface EditorScope {
  key: string
  owner: CodeOwner
  sessionId?: string | undefined
  kind?: string | undefined
  label: string
  cwd?: string | undefined
}
export interface CodeSelection { from: number; to: number; text: string; fromLine?: number; toLine?: number }
export interface CodeDocument {
  id: string
  scope: EditorScope
  path?: string | undefined
  text: string
  savedText?: string | undefined
  version: string | null
  language: string
  saving: boolean
  running: boolean
  selection?: CodeSelection | undefined
  error?: string | undefined
  outputOpen: boolean
  reloadRevision?: number
  lastRun?: { snapshot: string; code: string; selection: boolean; language: 'python' | 'R'; cellId?: string; error?: string } | undefined
}
export interface EditorServices {
  read: (scope: EditorScope, path: string) => Promise<{ path: string; text: string; version: string }>
  save: (scope: EditorScope, path: string, text: string, expectedVersion: string | null) => Promise<{ path: string; version: string; bytes: number }>
  run: (scope: EditorScope, language: 'python' | 'R', code: string) => Promise<{ cellId: string }>
}

export function codeLanguage(language: string): string {
  if (/^(py|python|python3)$/i.test(language)) return 'python'
  if (/^r$/i.test(language)) return 'R'
  return language.toLowerCase() || 'text'
}
export function pathLanguage(path: string): string { return codeLanguage(path.split('.').at(-1) ?? '') }

/** Browser-picked absolute identities stay intact; remote draft paths belong to the session cwd. */
export function editorDocumentPath(scope: EditorScope, path: string): string {
  if (!path || path.includes('\0')) throw new Error(t("请先填写脚本保存路径"))
  if (!scope.owner.connectionId || path.startsWith('/')) return path
  if (!scope.cwd?.startsWith('/')) throw new Error(t("远端工作区路径未知，无法读取交付文件"))
  return `${scope.cwd.replace(/\/+$/, '')}/${path}`
}

/** Window-lifetime drafts. No code text is written to global preference storage. */
export function createCodeEditorStore(services: EditorServices) {
  const $documents = atom<Readonly<Record<string, CodeDocument>>>({})
  const $active = atom<Readonly<Record<string, string>>>({})
  // One display preference per application window, shared across script documents.
  const $wordWrap = atom(true)
  const $editRequests = atom<readonly ScriptEditRequest[]>([])
  const $appliedEdits = atom<readonly ScriptEditRequest[]>([])
  const $editPreview = atom<{ request: ScriptEditRequest; code: string } | undefined>()
  const requests = new Map<string, number>()
  const ticket = (scope: string) => { const n = (requests.get(scope) ?? 0) + 1; requests.set(scope, n); return n }
  const put = (doc: CodeDocument) => $documents.set({ ...$documents.get(), [doc.id]: doc })
  const get = (id: string) => {
    const doc = $documents.get()[id]
    if (!doc) throw new Error(t("代码草稿不存在"))
    return doc
  }
  const patch = (id: string, fields: Partial<CodeDocument>) => put({ ...get(id), ...fields })
  const select = (scope: string, id: string) => $active.set({ ...$active.get(), [scope]: id })
  const message = (error: unknown) => error instanceof Error ? error.message : String(error)
  const editRequest = (requestId: string, scopeKey: string) => {
    const request = $editRequests.get().find(r => r.id === requestId)
    if (!request) throw new Error(t("这次脚本修改请求已失效，请重新带入对话"))
    const doc = get(request.documentId)
    if (request.scopeKey !== scopeKey || doc.scope.key !== scopeKey || doc.scope.sessionId !== request.sessionId) throw new Error(t("这份修改不属于当前脚本会话"))
    return { request, doc }
  }
  const checkEdit = (requestId: string, scopeKey: string) => {
    const { request, doc } = editRequest(requestId, scopeKey)
    if ($active.get()[scopeKey] !== doc.id) throw new Error(t("请先回到这次修改对应的原脚本"))
    if (doc.saving || doc.running) throw new Error(t("脚本正在保存或运行，请稍后应用修改"))
    if (doc.text !== request.baseline) throw new Error(t("原脚本草稿已改变，请重新带入对话，避免覆盖后续修改"))
    return { request, doc }
  }
  return {
    $documents, $active, $wordWrap, $editRequests, $appliedEdits, $editPreview,
    prepareEdit(id: string, label: string) {
      const doc = get(id)
      if (doc.saving || doc.running) throw new Error(t("脚本正在保存或运行，请稍后带入对话"))
      const request = createScriptEditRequest(doc, doc.path ?? label)
      $editRequests.set([...$editRequests.get().filter(r => r.documentId !== id), request])
      $editPreview.set(undefined)
      return request
    },
    reviewEdit(requestId: string, scopeKey: string, code: string, language: string) {
      const { request, doc } = editRequest(requestId, scopeKey)
      if (!['', 'text', 'plain', 'plaintext'].includes(language.toLowerCase()) && codeLanguage(language) !== request.language) throw new Error(t("AI 回复的代码语言与原脚本不一致"))
      ticket(scopeKey)
      select(scopeKey, doc.id)
      $editPreview.set({ request, code })
    },
    returnToEditedDocument(requestId: string, scopeKey: string) {
      const request = $appliedEdits.get().find(r => r.id === requestId)
      if (!request || request.scopeKey !== scopeKey || get(request.documentId).scope.key !== scopeKey) throw new Error(t("这份修改不属于当前脚本会话"))
      ticket(scopeKey)
      select(scopeKey, request.documentId)
    },
    closeEditReview() { $editPreview.set(undefined) },
    editProblem(requestId: string, scopeKey: string) {
      try { checkEdit(requestId, scopeKey); return undefined }
      catch (error) { return message(error) }
    },
    applyEdit(requestId: string, scopeKey: string, code: string, mode: 'document' | 'selection', commit: (before: string, after: string) => void) {
      const { request, doc } = checkEdit(requestId, scopeKey)
      if ($editPreview.get()?.request.id !== requestId || $editPreview.get()?.code !== code) throw new Error(t("请先查看这份修改的差异"))
      const after = scriptEditResult(request, code, mode)
      if (after === doc.text) throw new Error(t("AI 回复与原脚本相同，没有可应用的修改"))
      commit(doc.text, after)
      if (get(doc.id).text !== after) throw new Error(t("编辑器未应用修改，已保留原请求"))
      $appliedEdits.set([...$appliedEdits.get().slice(-31), request])
      $editRequests.set($editRequests.get().filter(r => r.id !== requestId))
      $editPreview.set(undefined)
    },
    current(scope: string) { const id = $active.get()[scope]; return id ? $documents.get()[id] : undefined },
    openSource(scope: EditorScope, source: string, text: string, language: string) {
      ticket(scope.key)
      const id = JSON.stringify([scope.key, 'source', source])
      if (!$documents.get()[id]) put({ id, scope, text, version: null, language: codeLanguage(language), saving: false, running: false, outputOpen: false })
      select(scope.key, id)
      return id
    },
    async openFile(scope: EditorScope, path: string) {
      const request = ticket(scope.key)
      const initial = new Map(Object.values($documents.get()).filter(d => d.scope.key === scope.key).map(d => [d.id, d]))
      const loaded = await services.read(scope, path)
      const existing = Object.values($documents.get()).find(d => d.scope.key === scope.key && d.path === loaded.path)
      const id = existing?.id ?? JSON.stringify([scope.key, 'file', loaded.path])
      if (requests.get(scope.key) !== request) return id
      // Never replace dirty or in-flight drafts when a file is opened again.
      if (!existing || (initial.get(id) === existing && !existing.saving && !existing.running && existing.text === existing.savedText)) {
        put({ id, scope, path: loaded.path, text: loaded.text, savedText: loaded.text, version: loaded.version, language: pathLanguage(loaded.path), saving: false, running: false, outputOpen: existing?.outputOpen ?? false, lastRun: existing?.lastRun, reloadRevision: existing ? (existing.reloadRevision ?? 0) + 1 : 0 })
      }
      if (requests.get(scope.key) === request) select(scope.key, id)
      return id
    },
    edit(id: string, text: string) { patch(id, { text }) },
    async reload(id: string) {
      const before = get(id)
      if (!before.path) throw new Error(t("请先填写脚本保存路径"))
      const loaded = await services.read(before.scope, before.path)
      if (get(id) !== before || get(id).saving || get(id).running) throw new Error(t("读取期间草稿已变化，未替换代码"))
      patch(id, { text: loaded.text, savedText: loaded.text, path: loaded.path, version: loaded.version, selection: undefined, error: undefined, reloadRevision: (get(id).reloadRevision ?? 0) + 1 })
    },
    setSelection(id: string, selection: CodeSelection) { patch(id, { selection }) },
    toggleOutput(id: string) { patch(id, { outputOpen: !get(id).outputOpen }) },
    async save(id: string, newPath?: string) {
      const before = get(id)
      if (before.saving) return
      const path = before.path ?? newPath?.trim()
      if (!path) throw new Error(t("请先填写脚本保存路径"))
      if (!before.path && (isAbsoluteFilePath(path) || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.split(/[\\/]/).some(part => part === '..' || part === '.'))) throw new Error(t("新脚本请使用工作区内相对路径"))
      patch(id, { saving: true, error: undefined })
      try {
        const result = await services.save(before.scope, path, before.text, before.version)
        patch(id, { path: result.path, version: result.version, savedText: before.text, saving: false, language: before.path ? get(id).language : pathLanguage(result.path) })
      } catch (error) { patch(id, { saving: false, error: message(error) }); throw error }
    },
    async run(id: string, selection?: CodeSelection) {
      const before = get(id)
      if (before.running) return
      if (before.scope.kind !== 'native' || !before.scope.sessionId) throw new Error(t("当前会话不支持共享内核运行，可编辑和保存脚本"))
      if (before.language !== 'python' && before.language !== 'R') throw new Error(t("选区运行支持 Python 和 R，其他脚本可编辑保存"))
      const selected = Boolean(selection && selection.to > selection.from)
      const code = selected ? selection!.text : before.text
      if (!code.trim()) throw new Error(t("没有可运行的代码"))
      const lastRun: NonNullable<CodeDocument['lastRun']> = { snapshot: before.text, code, selection: selected, language: before.language }
      patch(id, { running: true, error: undefined, lastRun, outputOpen: true })
      try {
        const result = await services.run(before.scope, before.language, code)
        patch(id, { running: false, lastRun: { ...lastRun, cellId: result.cellId } })
      } catch (error) {
        patch(id, { running: false, error: message(error), lastRun: { ...lastRun, error: message(error) } })
        throw error
      }
    },
  }
}
export type CodeEditorStore = ReturnType<typeof createCodeEditorStore>
