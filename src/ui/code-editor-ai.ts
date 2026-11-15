import { diffLines } from 'diff'
import type { TranscriptItem } from '../protocol/index.js'
import type { CodeDocument, CodeSelection } from './state/code-editor.js'
import { t, tf } from './i18n/index.js'

export interface ScriptEditRequest {
  source?: 'linked'
  id: string
  documentId: string
  scopeKey: string
  sessionId?: string | undefined
  language: string
  label: string
  baseline: string
  selection: CodeSelection
  prompt: string
}

export interface ScriptDiffLine {
  kind: 'context' | 'add' | 'del'
  text: string
  oldLine?: number
  newLine?: number
}

const MAX_CONTEXT_BYTES = 128 * 1024
const MAX_SCRIPT_BYTES = 1024 * 1024
const MAX_DIFF_LINES = 20_000
const encoder = new TextEncoder()
const marker = (id: string) => `<!-- dawn-script-edit:${id} -->`
const anyMarker = /<!-- dawn-script-edit:[A-Za-z0-9_-]+ -->/

export function hasScriptEditContext(text: string): boolean { return anyMarker.test(text) }

/** CodeMirror positions count a CRLF separator as one character, unlike the raw source. */
function rawOffset(text: string, position: number): number {
  if (!Number.isSafeInteger(position) || position < 0) throw new Error(t("选区已变化，请重新选择代码后带入对话"))
  let raw = 0, logical = 0
  while (logical < position && raw < text.length) {
    raw += text[raw] === '\r' && text[raw + 1] === '\n' ? 2 : 1
    logical++
  }
  if (logical !== position) throw new Error(t("选区已变化，请重新选择代码后带入对话"))
  return raw
}

function rawRange(baseline: string, selection: CodeSelection): { from: number; to: number } {
  const from = rawOffset(baseline, selection.from), to = rawOffset(baseline, selection.to)
  if (to <= from || baseline.slice(from, to) !== selection.text) throw new Error(t("选区已变化，请重新选择代码后带入对话"))
  return { from, to }
}

function fenced(text: string, language: string, fence: string): string {
  return `${fence}${language}\n${text}${text.endsWith('\n') ? '' : '\n'}${fence}`
}

function validateContext(doc: CodeDocument, id: string) {
  if (encoder.encode(doc.text).byteLength > MAX_CONTEXT_BYTES) throw new Error(t("脚本过大，无法完整带入对话（上限 128 KiB）"))
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error(t("代码修改请求无效"))
}

function contextFormat(doc: CodeDocument) {
  const fence = '`'.repeat((doc.text.match(/`+/g) ?? []).reduce((length, run) => Math.max(length, run.length + 1), 3))
  const language = /^[A-Za-z0-9_+.-]{1,32}$/.test(doc.language) ? doc.language : 'text'
  return { fence, language }
}

/** A fresh snapshot for a single composer submission; it never changes the document. */
export function createLinkedScriptEditRequest(doc: CodeDocument, label: string, instruction: string, id: string = crypto.randomUUID()): ScriptEditRequest {
  validateContext(doc, id)
  // Generated IDs cannot occur in user/source boundaries. Fail closed for a supplied colliding ID.
  const start = `<!-- dawn-linked-script:${id}:`
  const end = `<!-- dawn-linked-script-end:${id} -->`
  if ([instruction, doc.text, label].some(text => text.includes(start) || text.includes(end))) throw new Error(t("代码修改请求无效"))
  const { fence, language } = contextFormat(doc)
  const selection = { from: 0, to: doc.text.replace(/\r\n/g, '\n').length, text: doc.text }
  const context = [
    tf("当前对话关联的脚本：{0}。以下是本次发送时的完整草稿（包含未保存修改），请以此为准，不要使用历史回复中的旧版本。", JSON.stringify(label)),
    fenced(doc.text, language, fence),
    t("请根据本条用户消息回答。用户要求修改脚本时，请只返回一个与原脚本语言一致的代码块，内容是修改后的完整脚本，不要省略未修改部分，保留无关代码。用户询问解释或其他问题时，请正常回答。不要调用工具、写入文件或运行代码；脚本修改由我查看差异后手动应用到原脚本。"),
    marker(id),
  ].join('\n\n')
  const prompt = `${instruction}\n\n${start}${encodeURIComponent(label)} -->\n\n${context}\n\n${end}`
  return { id, documentId: doc.id, scopeKey: doc.scope.key, sessionId: doc.scope.sessionId, language: doc.language, label, baseline: doc.text, selection, source: 'linked', prompt }
}

/** Parse only the generated outer envelope, leaving user/source lookalikes inside intact. */
export function splitLinkedScriptPrompt(text: string): { instruction: string; context: string; label: string } | undefined {
  const ending = /\n\n<!-- dawn-linked-script-end:([A-Za-z0-9_-]{1,128}) -->$/.exec(text)
  if (!ending) return undefined
  const id = ending[1]!
  const prefix = `\n\n<!-- dawn-linked-script:${id}:`
  const from = text.indexOf(prefix)
  if (from < 0 || text.indexOf(prefix, from + prefix.length) !== -1) return undefined
  const labelFrom = from + prefix.length
  const labelTo = text.indexOf(' -->\n\n', labelFrom)
  if (labelTo < 0) return undefined
  const context = text.slice(labelTo + ' -->\n\n'.length, ending.index)
  if (!context.endsWith(marker(id))) return undefined
  try { return { instruction: text.slice(0, from), context, label: decodeURIComponent(text.slice(labelFrom, labelTo)) } }
  catch { return undefined }
}

export function createScriptEditRequest(doc: CodeDocument, label: string, id: string = crypto.randomUUID()): ScriptEditRequest {
  if (!doc.selection || doc.selection.to <= doc.selection.from) throw new Error(t("请先选择要修改的代码"))
  validateContext(doc, id)
  rawRange(doc.text, doc.selection)
  const logicalText = doc.text.replace(/\r\n/g, '\n')
  const selection = {
    ...doc.selection,
    fromLine: logicalText.slice(0, doc.selection.from).split('\n').length,
    toLine: logicalText.slice(0, doc.selection.to - 1).split('\n').length,
  }
  const { fence, language } = contextFormat(doc)
  const prompt = [
    tf("请基于当前脚本的完整草稿修改选中的代码：{0}，L{1}–{2}。", JSON.stringify(label), selection.fromLine, selection.toLine),
    t("完整草稿（包含未保存修改）："),
    fenced(doc.text, language, fence),
    t("需要修改的选区："),
    fenced(selection.text, language, fence),
    t("请结合完整草稿理解变量、依赖和绘图对象，以选区为修改重点，保留无关代码。请只返回一个与原脚本语言一致的代码块，内容是修改后的完整脚本，不要省略未修改部分。不要调用工具、写入文件或运行代码；我会先查看差异，再应用到原脚本。"),
    marker(id),
  ].join('\n\n')
  return { id, documentId: doc.id, scopeKey: doc.scope.key, sessionId: doc.scope.sessionId, language: doc.language, label, baseline: doc.text, selection, prompt }
}

function precedingUser(items: readonly TranscriptItem[], replyId: string): Extract<TranscriptItem, { type: 'turn' }> | undefined {
  const target = items.findIndex(item => item.id === replyId)
  const reply = items[target]
  if (reply?.type !== 'turn' || reply.who !== 'agent' || !reply.final) return undefined
  for (let index = target - 1; index >= 0; index--) {
    const user = items[index]!
    if (user.type !== 'turn' || user.who !== 'user' || user.id.startsWith('echo:')) continue
    if (!user.final) return undefined
    return user
  }
  return undefined
}

/** Keep expired edit responses distinct from ordinary standalone code examples. */
export function scriptEditReplyHasContext(items: readonly TranscriptItem[], replyId: string): boolean {
  const user = precedingUser(items, replyId)
  return !!user && anyMarker.test(user.text)
}

/** A reply is linked by its actual preceding user turn, never by the latest pending request. */
export function scriptEditForReply(requests: readonly ScriptEditRequest[], items: readonly TranscriptItem[], scopeKey: string, replyId: string): ScriptEditRequest | undefined {
  const user = precedingUser(items, replyId)
  if (!user) return undefined
  // Textareas normalize CRLF and standalone CR to LF before the composer sends.
  // Canonicalize the comparison only; the original script snapshot remains byte-exact.
  const canonical = (text: string) => text.replace(/\r\n?/g, '\n')
  const userText = canonical(user.text)
  const matching = requests.filter(request => request.scopeKey === scopeKey && userText.includes(canonical(request.prompt)))
  if (matching.length !== 1) return undefined
  const request = matching[0]!
  // More than one attached context, including an expired/unknown context, is ambiguous.
  if (anyMarker.test(userText.replace(canonical(request.prompt), ''))) return undefined
  return request
}

function normalizeReplacement(code: string, replaced: string, baseline: string): string {
  let normalized = code.replace(/\r\n/g, '\n')
  // Fenced Markdown contributes a terminal newline even for a source range without one.
  if (!replaced.endsWith('\n') && normalized.endsWith('\n')) normalized = normalized.slice(0, -1)
  return baseline.includes('\r\n') ? normalized.replace(/\n/g, '\r\n') : normalized
}

export function scriptEditResult(request: ScriptEditRequest, code: string, mode: 'document' | 'selection'): string {
  if (code.length > MAX_SCRIPT_BYTES || encoder.encode(code).byteLength > MAX_SCRIPT_BYTES) throw new Error(t("修改后的脚本过大，无法查看差异或应用"))
  let candidate: string
  if (mode === 'document') candidate = normalizeReplacement(code, request.baseline, request.baseline)
  else if (mode === 'selection') {
    const range = rawRange(request.baseline, request.selection)
    candidate = request.baseline.slice(0, range.from) + normalizeReplacement(code, request.selection.text, request.baseline) + request.baseline.slice(range.to)
  } else throw new Error(t("代码修改请求无效"))
  if (encoder.encode(candidate).byteLength > MAX_SCRIPT_BYTES) throw new Error(t("修改后的脚本过大，无法查看差异或应用"))
  return candidate
}

export function scriptEditDiff(before: string, after: string): ScriptDiffLine[] {
  if (before.length > MAX_SCRIPT_BYTES || after.length > MAX_SCRIPT_BYTES || encoder.encode(before).byteLength > MAX_SCRIPT_BYTES || encoder.encode(after).byteLength > MAX_SCRIPT_BYTES) {
    throw new Error(t("差异过大，请缩小修改范围后重试"))
  }
  let lineCount = 2
  for (const text of [before, after]) for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10 && ++lineCount > MAX_DIFF_LINES) throw new Error(t("差异过大，请缩小修改范围后重试"))
  }
  const changes = diffLines(before, after, { timeout: 150, maxEditLength: 10_000 })
  if (!changes) throw new Error(t("差异过大，请缩小修改范围后重试"))
  let oldLine = 1, newLine = 1
  const result: ScriptDiffLine[] = []
  for (const change of changes) {
    const lines = change.value.split('\n')
    if (lines.at(-1) === '') lines.pop()
    for (const line of lines) {
      const text = line.replace(/\r$/, '')
      if (change.added) result.push({ kind: 'add', text, newLine: newLine++ })
      else if (change.removed) result.push({ kind: 'del', text, oldLine: oldLine++ })
      else result.push({ kind: 'context', text, oldLine: oldLine++, newLine: newLine++ })
    }
  }
  return result
}
