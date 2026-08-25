/**
 * 命令面板（①-B″ · U1）。
 *
 * **它先做，是因为后面每一样功能都要往里放入口。** 面板本身没有功能，
 * 它是个货架——货架的形状定错了，后面几个 Task 都得跟着歪。
 *
 * 命令从哪来见 `commands.ts`：`run` 只许转发给 `Actions`，不许自己实现。
 * 那条纪律才是这个 Task 的实质，面板只是它的一个出口。
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "@nanostores/react"
import { Row } from "./primitives.js"
import type { Command } from "./commands.js"
import { $paletteOpen, $paletteQuery, closePalette, togglePalette } from "./state/view.js"

import { t } from "./i18n/index.js"
/**
 * 标题与关键词一起匹配。
 *
 * **关键词不是锦上添花**：人记得的往往不是我们起的那个名字——
 * 想改主题的人会搜「主题」，也可能搜「暗色」或「theme」。
 */
function matches(c: Command, q: string): boolean {
  if (!q) return true
  const hay = `${c.title} ${c.keywords ?? ""}`.toLowerCase()
  return hay.includes(q.toLowerCase())
}

/** 按分组聚拢，**保持首次出现的顺序**——这样视觉顺序与方向键顺序一致 */
function group(cmds: readonly Command[]): { group: string; items: Command[] }[] {
  const out: { group: string; items: Command[] }[] = []
  for (const c of cmds) {
    const slot = out.find((g) => g.group === c.group)
    if (slot) slot.items.push(c)
    else out.push({ group: c.group, items: [c] })
  }
  return out
}

export function CommandPalette({ commands }: { commands: readonly Command[] }) {
  const open = useStore($paletteOpen)
  const query = useStore($paletteQuery)
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl+K。**挂在 document 上**——它在任何地方都该管用，包括正在打字时
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 唯一的例外是终端（审查 debug I6）：那里 Ctrl+K 是 shell 的 kill-line,把它抢过来开命令面板
      // 会让人在终端里删不了行、还莫名弹出面板。焦点在终端里就让开。
      if ((e.target as Element | null)?.closest?.(".term-host")) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        togglePalette()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const groups = useMemo(() => group(commands.filter((c) => matches(c, query))), [commands, query])
  /** 拍平之后的顺序 = 屏幕上的顺序。方向键走的是这一份 */
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  const firstUsable = useMemo(() => flat.findIndex((c) => !c.unavailable), [flat])

  // 打开、或查询词变了 → 选中回到第一条可用的
  useEffect(() => {
    setIndex(firstUsable)
  }, [firstUsable, open])

  // 打开时自动聚焦。否则还得再点一下才能打字
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  if (!open) return null

  /** 往前/往后找下一条**可用**的。停在按不动的命令上很别扭 */
  const move = (delta: number) => {
    if (flat.length === 0) return
    for (let step = 1; step <= flat.length; step++) {
      const next = (index + delta * step + flat.length * step) % flat.length
      if (!flat[next]?.unavailable) {
        setIndex(next)
        return
      }
    }
  }

  const runAt = (i: number) => {
    const c = flat[i]
    // **可见不等于可用。** 不可用的照样列出来（缺失不等于不支持），但按不动
    if (!c || c.unavailable) return
    closePalette()
    c.run()
  }

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("命令面板")}
      onKeyDown={(e) => {
        if (e.key === "Escape") closePalette()
        else if (e.key === "ArrowDown") {
          e.preventDefault()
          move(1)
        } else if (e.key === "ArrowUp") {
          e.preventDefault()
          move(-1)
        } else if (e.key === "Enter") {
          e.preventDefault()
          runAt(index)
        }
      }}
    >
      <div className="palette">
        <input
          ref={input}
          className="control palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-label={t("搜索命令")}
          placeholder={t("输入命令名或关键词")}
          value={query}
          onChange={(e) => $paletteQuery.set(e.target.value)}
        />

        {flat.length === 0 ? (
          /* 留白说不出「是没有这个命令，还是搜错了」 */
          <p className="empty">{t("没有匹配的命令")}</p>
        ) : (
          <div className="palette-list" id="palette-list" role="listbox" aria-label={t("命令")}>
            {groups.map((g) => (
              <div key={g.group} className="palette-group">
                <p className="palette-group-title">{t(g.group)}</p>
                {g.items.map((c) => {
                  const i = flat.indexOf(c)
                  return (
                    <Row
                      key={c.id}
                      role="option"
                      aria-selected={i === index}
                      aria-disabled={Boolean(c.unavailable)}
                      active={i === index}
                      className="palette-item"
                      onClick={() => runAt(i)}
                    >
                      <span className="name">{c.title}</span>
                      {/* **不可用必须说清是哪一种。** 笼统写「不可用」等于没说 */}
                      {c.unavailable ? <span className="why">{c.unavailable}</span> : null}
                      {c.keybinding ? <span className="keys">{c.keybinding}</span> : null}
                    </Row>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
