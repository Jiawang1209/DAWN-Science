/**
 * 输入框上方的 `/` 菜单（2026-08-22）。只有两类东西：**技能**（`/skill:名`）与**子 agent**（派出去）。
 * 命令面板留给 ⌘K——作者：「`/` 弹出来的是其他的功能，不对」。
 *
 * 草稿以 `/` 开头、且还没打到空格，就显示；边打边按名字 / 说明筛。
 * 上下键挪、回车选、Esc 关；选了技能把草稿换成 `/skill:名 `，选了子 agent 换成「用子 agent「名」来做：」。
 * **选什么就写什么进草稿**，不替人发——他还要写任务。
 */
import { useEffect, useMemo, useState } from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import type { SlashItem } from "./state/view.js"

/** 草稿此刻是不是在「打 `/` 命令」的状态：`/` 开头、没有空白 */
export function 在打斜杠(draft: string): boolean {
  return /^\/[^\s]*$/.test(draft)
}

export function 斜杠选完(item: SlashItem): string {
  return item.kind === "skill" ? `/skill:${item.name} ` : item.kind === "team" ? "/team " : `用子 agent「${item.name}」来做：`
}

export function 筛斜杠(items: readonly SlashItem[], draft: string): SlashItem[] {
  const q = draft.replace(/^\//, "").replace(/^skill:/, "").trim().toLowerCase()
  if (!q) return [...items]
  return items.filter((x) => `${x.name} ${x.title ?? ""} ${x.description} ${x.group ?? ""}`.toLowerCase().includes(q))
}

export function SlashMenu({
  items,
  draft,
  selected,
  onPick,
  onHover,
}: {
  items: readonly SlashItem[]
  draft: string
  /** 键盘选中的下标（由输入框管，因为方向键落在输入框上） */
  selected: number
  onPick: (item: SlashItem) => void
  onHover: (i: number) => void
}) {
  const 列 = useMemo(() => 筛斜杠(items, draft), [items, draft])
  const [, 重画] = useState(0)
  useEffect(() => 重画((n) => n + 1), [selected])
  if (列.length === 0) {
    return (
      <div className="slash-menu" role="listbox" aria-label={t("技能与子 agent")}>
        <p className="hint slash-empty">{items.length === 0 ? t("还没有技能与子 agent") : t("没有对上的")}</p>
      </div>
    )
  }
  return (
    <div className="slash-menu" role="listbox" aria-label={t("技能与子 agent")}>
      {列.map((x, i) => (
        <Button
          key={`${x.kind}:${x.name}`}
          variant="ghost"
          size="inline"
          role="option"
          aria-selected={i === selected}
          className={`slash-item${i === selected ? " active" : ""}`}
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(x)}
        >
          <span className="slash-kind tag">{x.kind === "skill" ? t("技能") : x.kind === "team" ? t("团队") : t("子 agent")}</span>
          <span className="slash-name">{x.title ?? x.name}</span>
          {x.title ? <span className="slash-slug">{x.kind === "skill" ? `/skill:${x.name}` : x.kind === "team" ? "/team" : x.name}</span> : x.kind === "skill" ? <span className="slash-slug">{`/skill:${x.name}`}</span> : null}
          <span className="slash-desc">{x.description}</span>
        </Button>
      ))}
      <p className="hint slash-foot">{tf("↑↓ 挑，回车选；{0}", t("⌘K 是命令面板"))}</p>
    </div>
  )
}
