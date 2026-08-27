/**
 * 输入框上方的 `@` 菜单（2026-08-23，学自 dsh-at-file；解读在 `ccb_hive_code_learn/dsh-at-file-解读.md`）。
 *
 * 与 `/` 菜单同一副壳子（上下挑、回车选、Esc 关；方向键落在输入框上，所以选中的下标由输入框管），
 * 里头换成工作区路径：
 * - 没打字 / 打到 `xx/`：**浏览**这一层（`listDirectory`），浅的在前、目录在前；
 * - 打了字：`searchFiles` 按名找（有预算、截断出声），再用借来的排序把文件名命中的排前面；
 * - 高亮一个目录按 → 钻进去（草稿推进到 `@路径/`，菜单不关）；回车 / 点鼠标是「引用这个目录」。
 *
 * **不另建索引**：dsh-at-file 的 `atFile/search` 就是我们现成的 `listDirectory` + `searchFiles`，远端白得。
 */
import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 文件类按名字 } from "./file-kind.js"
import { 类型图标, type Listing, type SearchResult } from "./files.js"
import { 成候选行, 排路径, type 候选行, type 路径条目 } from "./at-file.js"
import { 扫引用, 护住粘贴的艾特 } from "../files/mentions.js"
import { 用选中项跟滚 } from "./slash-menu.js"
import { 关闭图标 } from "./icons.js"

/** 菜单最多摆多少条（dsh-at-file 也是 50：可滚的视口） */
export const 最多候选 = 50

/** 这段会话的文件在哪、怎么取（由 App 接上；本地 / 远端同一副接口） */
export interface 引用文件源 {
  /** 远端时是那段会话的当前目录（绝对）；本地是空串。令牌里写的路径都相对它 */
  根: string
  loadDir: (path: string) => Promise<Listing>
  search: (query: string, 根: string) => Promise<SearchResult>
  /** 第二档：这个文件名该不该从菜单里滤掉（全局 + 工作区规则编好的判据） */
  滤掉?: ((name: string) => boolean) | undefined
  /** 第二档：粘贴进来的 `@` 要不要护住（不算引用） */
  护粘贴?: boolean | undefined
}

function 拼(根: string, rel: string): string {
  if (!根) return rel
  if (!rel) return 根
  return `${根.replace(/\/+$/, "")}/${rel}`
}
function 去根(根: string, p: string): string {
  if (!根) return p
  const 前缀 = `${根.replace(/\/+$/, "")}/`
  return p.startsWith(前缀) ? p.slice(前缀.length) : p
}

/**
 * 粘贴时护住 `@`（第二档）：剪贴板里的文字有 `@x` 就接管这次粘贴——把标记塞进去再写进草稿。
 * 只有文字、且真有 `@` 才接管；不然让浏览器照常粘。回 true = 接管了。
 */
export function 接管粘贴(e: React.ClipboardEvent<HTMLTextAreaElement>, 源: 引用文件源 | undefined, 写: (草稿: string, caret: number) => void): boolean {
  if (!源?.护粘贴) return false
  const 文 = e.clipboardData.getData("text/plain")
  if (!文) return false
  const 护 = 护住粘贴的艾特(文)
  if (护 === 文) return false
  e.preventDefault()
  const el = e.currentTarget
  const 前 = el.value.slice(0, el.selectionStart)
  const 后 = el.value.slice(el.selectionEnd)
  写(前 + 护 + 后, 前.length + 护.length)
  return true
}

export interface 候选状态 {
  行: 候选行[]
  忙: boolean
  /** 截断 / 出错时说给人的一句话；没有就是空 */
  说明?: string
}

/**
 * 按 query 取候选。**每次击键作废上一次**（序号比对，不用 AbortController——协议层没给信号），
 * 取回来的结果在本地排。
 */
export function use艾特候选(query: string | undefined, 源: 引用文件源 | undefined): 候选状态 {
  const [态, 设态] = useState<候选状态>({ 行: [], 忙: false })
  const 序 = useRef(0)
  useEffect(() => {
    if (query === undefined || !源) return
    const 这次 = ++序.current
    设态((前) => ({ ...前, 忙: true }))
    const 跑 = async (): Promise<候选状态> => {
      const q = query.replaceAll("\\", "/")
      // 浏览：空、或以 `/` 结尾——列那一层
      if (q === "" || q.endsWith("/")) {
        const 目录 = q.replace(/\/+$/, "")
        const l = await 源.loadDir(拼(源.根, 目录))
        const 条: 路径条目[] = l.entries.filter((e) => !源.滤掉?.(e.name)).map((e) => ({ path: 目录 ? `${目录}/${e.name}` : e.name, kind: e.kind }))
        const 行 = 成候选行(排路径(条, "", 最多候选))
        const 省 = l.omitted + (条.length > 最多候选 ? 条.length - 最多候选 : 0)
        return { 行, 忙: false, ...(省 ? { 说明: tf("还有 {0} 条没列出来——再打几个字", 省) } : {}) }
      }
      // 找：带 `/` 就从最后一个 `/` 前的目录搜起，最后一段是关键词
      const 斜 = q.lastIndexOf("/")
      const 起点 = 斜 >= 0 ? q.slice(0, 斜) : ""
      const 词 = 斜 >= 0 ? q.slice(斜 + 1) : q
      const r = await 源.search(词, 拼(源.根, 起点))
      const 条: 路径条目[] = r.matches.filter((m) => !源.滤掉?.(m.path.split("/").at(-1)!)).map((m) => ({ path: 去根(源.根, m.path), kind: m.kind }))
      const 行 = 成候选行(排路径(条, q, 最多候选))
      const 说明 =
        r.truncated === "matches"
          ? tf("只列了前 {0} 条就停了——再打几个字缩小范围", r.matches.length)
          : r.truncated === "visited"
            ? tf("看了 {0} 条还没看完就停了——换个起点或再打几个字", r.visited)
            : r.truncated === "time"
              ? tf("搜了一会儿没搜完（看了 {0} 条）——换个起点或再打几个字", r.visited)
              : undefined
      return { 行, 忙: false, ...(说明 ? { 说明 } : {}) }
    }
    void 跑().then(
      (s) => {
        if (序.current === 这次) 设态(s)
      },
      (e: unknown) => {
        if (序.current === 这次) 设态({ 行: [], 忙: false, 说明: e instanceof Error ? e.message : String(e) })
      },
    )
  }, [query, 源])
  return query === undefined ? { 行: [], 忙: false } : 态
}

export function AtMenu({
  态,
  selected,
  有源,
  onPick,
  onHover,
}: {
  态: 候选状态
  selected: number
  /** 没有源 = 还没选工作目录（空态屏）——要说清，不是一片空白 */
  有源: boolean
  onPick: (行: 候选行) => void
  onHover: (i: number) => void
}) {
  const 列 = useMemo(() => 态.行, [态.行])
  const 跟滚 = 用选中项跟滚(selected)
  if (!有源) {
    return (
      <div className="slash-menu at-menu" role="listbox" aria-label={t("引用工作区文件")}>
        <p className="hint slash-empty">{t("先选一个工作目录，才有文件可以引用")}</p>
      </div>
    )
  }
  return (
    <div ref={跟滚} className="slash-menu at-menu" role="listbox" aria-label={t("引用工作区文件")}>
      {列.length === 0 ? (
        <p className="hint slash-empty">{态.忙 ? t("正在找…") : (态.说明 ?? t("没有对上的文件"))}</p>
      ) : (
        列.map((x, i) => (
          <Button
            key={x.path}
            variant="ghost"
            size="inline"
            role="option"
            aria-selected={i === selected}
            className={`slash-item at-item${i === selected ? " active" : ""}`}
            onMouseMove={() => { if (i !== selected) onHover(i) }}
            onClick={() => onPick(x)}
          >
            <span className="at-icon"><类型图标 类={文件类按名字(x.path.split("/").at(-1)!, x.kind)} /></span>
            <span className="slash-name at-name">{x.name}</span>
            {x.dir ? <span className="slash-desc at-dir">{x.dir}</span> : null}
          </Button>
        ))
      )}
      {列.length > 0 && 态.说明 ? <p className="hint slash-foot">{态.说明}</p> : null}
      <p className="hint slash-foot">{t("↑↓ 挑，回车引用；→ 进目录")}</p>
    </div>
  )
}

/**
 * 引用栏：草稿里有几个 `@路径` 就几行，摆在输入框上方（dsh-at-file 的 dock）。
 * **从草稿 parse 出来的视图，不是另一份状态**——× 是从草稿里抠掉那几个字。
 */
export function AtRail({ draft, 正在打, onOpen, onRemove }: { draft: string; /** 光标正在打的那个 `@` 的下标——还没打完的不进栏 */ 正在打?: number | undefined; onOpen?: ((path: string) => void) | undefined; onRemove: (path: string) => void }) {
  const 引用们 = 扫引用(draft).filter((r) => r.start !== 正在打)
  if (引用们.length === 0) return null
  return (
    <ul className="at-rail" aria-label={t("引用的文件")}>
      {引用们.map((r) => (
        <li key={r.path} className="at-rail-row">
          <Button variant="ghost" size="inline" className="at-rail-path" onClick={() => onOpen?.(r.path)} disabled={!onOpen}>
            <类型图标 类={文件类按名字(r.path.split("/").at(-1)!, "file")} />
            <span className="at-rail-name">{r.path}</span>
          </Button>
          <Button variant="ghost" size="icon" className="at-rail-x" aria-label={tf("不引用 {0}", r.path)} onClick={() => onRemove(r.path)}>
            <关闭图标 />
          </Button>
        </li>
      ))}
    </ul>
  )
}
