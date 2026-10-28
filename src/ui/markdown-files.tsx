import { useEffect, useState } from 'react'
import type { ResponseOf } from '../protocol/index.js'
import { t } from './i18n/index.js'

export type MarkdownFileContext = {
  path: string
  readFile: (path: string) => Promise<ResponseOf<'readFile'>>
  onOpenFile: (path: string) => void
}
// Internal markers pass through Markdown sanitization but are never fetched or navigated.
const origin = 'https://dawn-workspace.invalid/'

export function resolveMarkdownFile(document: string, reference: string): string | undefined {
  if (!reference || reference.startsWith('#') || /^[a-z][\w+.-]*:/i.test(reference) || reference.startsWith('/')) return
  let path: string
  try { path = decodeURIComponent(reference.split(/[?#]/, 1)[0]!) } catch { return }
  if (!path || /[\\\x00-\x1f]/.test(path) || path.startsWith('/') || /^[a-z][\w+.-]*:/i.test(path)) return
  const parts = document.split('/').slice(0, -1).filter(Boolean)
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!parts.length) return; parts.pop() }
    else parts.push(part)
  }
  return parts.length ? (document.startsWith('/') ? '/' : '') + parts.join('/') : undefined
}

export function markdownFilePath(url: string | undefined): string | undefined {
  if (!url?.startsWith(origin)) return
  try { return decodeURIComponent(url.slice(origin.length)) || undefined } catch { return }
}

type MarkdownNode = { type: string; url?: string; children?: MarkdownNode[] }
export function fileReferencePlugin({ document }: { document: string }) {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (node.url && ['link', 'image', 'definition'].includes(node.type)) {
        const path = resolveMarkdownFile(document, node.url)
        if (path) node.url = origin + encodeURIComponent(path)
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}

export function MarkdownFileImage({ path, alt, context }: { path: string; alt: string; context: MarkdownFileContext }) {
  const [result, setResult] = useState<{ path: string; readFile: MarkdownFileContext['readFile']; src?: string; error?: string }>()
  useEffect(() => {
    let live = true
    void context.readFile(path).then(content => {
      if (!live) return
      if (content.kind !== 'image') throw new Error(t("引用文件不是可预览的图片"))
      setResult({ path, readFile: context.readFile, src: `data:${content.mediaType};base64,${content.base64}` })
    }).catch((error: unknown) => {
      if (live) setResult({ path, readFile: context.readFile, error: error instanceof Error ? error.message : String(error) })
    })
    return () => { live = false }
  }, [path, context.readFile])
  const current = result?.path === path && result.readFile === context.readFile ? result : undefined
  if (current?.error) return <span className="field-error" role="status">{alt}: {current.error}</span>
  if (!current?.src) return <span role="status">{t("正在读取图片")} · {alt}</span>
  return <img src={current.src} alt={alt} onError={() => setResult({ path, readFile: context.readFile, error: t("图片解码失败") })} />
}
