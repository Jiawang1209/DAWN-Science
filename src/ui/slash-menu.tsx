/**
 * 输入框上方的 `/` 菜单（2026-08-22）。只有两类东西：**技能**（`/skill:名`）与**子 agent**（派出去）。
 * 命令面板留给 ⌘K——作者：「`/` 弹出来的是其他的功能，不对」。
 *
 * 草稿以 `/` 开头、且还没打到空格，就显示；边打边按名字 / 说明筛。
 * 上下键挪、回车选、Esc 关；选了技能把草稿换成 `/skill:名 `，选了子 agent 换成「用子 agent「名」来做：」。
 * **选什么就写什么进草稿**，不替人发——他还要写任务。
 */
import { useEffect, useMemo, useRef } from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import type { SlashItem } from "./state/view.js"

/** 草稿此刻是不是在「打 `/` 命令」的状态：`/` 开头、没有空白 */
export function 在打斜杠(draft: string): boolean {
  return /^\/[^\s]*$/.test(draft)
}

/**
 * 选完写什么进草稿。子 agent 有两条路（2026-08-22 作者定的「一份两用」，2026-08-23 才在这份菜单里露出来）：
 * 打的是 `/skill:…` 就写 `/skill:名 `（把那套规矩叫进主对话），否则写「用子 agent「名」来做：」（派出去）。
 */
export function 斜杠选完(item: SlashItem, draft = ""): string {
  if (item.kind === "team") return "/team "
  if (item.kind === "skill" || /^\/skill:/i.test(draft)) return `/skill:${item.name} `
  return `用子 agent「${item.name}」来做：`
}

export function 筛斜杠(items: readonly SlashItem[], draft: string): SlashItem[] {
  const q = draft.replace(/^\//, "").replace(/^skill:/, "").trim().toLowerCase()
  if (!q) return [...items]
  return items.filter((x) => `${x.name} ${x.title ?? ""} ${x.description} ${x.group ?? ""}`.toLowerCase().includes(q))
}

/**
 * 键盘选中的那项要跟着滚进可视区（2026-08-27，作者报的：上下键超过界限就不动了，得用鼠标）。
 *
 * 只在 `selected` 变了时滚，`block: "nearest"` 不把列表甩来甩去。`@` 菜单同用。
 * jsdom 没有 `scrollIntoView`，所以要判一下——测试里 spy 到原型上。
 */
export function 用选中项跟滚(selected: number) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" })
  }, [selected])
  return ref
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
  const ref = 用选中项跟滚(selected)
  if (列.length === 0) {
    return (
      <div className="slash-menu" role="listbox" aria-label={t("技能与子 agent")}>
        <p className="hint slash-empty">{items.length === 0 ? t("还没有技能与子 agent") : t("没有对上的")}</p>
      </div>
    )
  }
  return (
    <div ref={ref} className="slash-menu" role="listbox" aria-label={t("技能与子 agent")}>
      {列.map((x, i) => (
        <Button
          key={`${x.kind}:${x.name}`}
          variant="ghost"
          size="inline"
          role="option"
          aria-selected={i === selected}
          className={`slash-item${i === selected ? " active" : ""}`}
          // **mousemove 不是 mouseenter**：键盘滚动让鼠标底下换了一项时 mouseenter 也会触发，高亮就被抢回去了——那正是「得用鼠标辅助」的另一半
          onMouseMove={() => { if (i !== selected) onHover(i) }}
          onClick={() => onPick(x)}
        >
          <span className="slash-kind tag">{x.kind === "skill" ? t("技能") : x.kind === "team" ? t("团队") : t("子 agent")}</span>
          <span className="slash-name">{x.title ?? x.name}</span>
          {x.kind === "skill" ? (
            <span className="slash-slug">{`/skill:${x.name}`}</span>
          ) : x.kind === "team" ? (
            x.title ? <span className="slash-slug">/team</span> : null
          ) : (
            // 子 agent：两个写法都摆出来——名字是派出去，`/skill:名` 是叫进主对话（同一份文件，两种用法）
            <span className="slash-slug">
              {x.name}
              <span className="slash-slug-alt">{` · /skill:${x.name}`}</span>
            </span>
          )}
          <span className="slash-desc">{x.description}</span>
        </Button>
      ))}
      <p className="hint slash-foot">
        {/^\/skill:/i.test(draft) ? t("回车把这套规矩叫进主对话（/skill:）") : t("回车：技能叫进主对话，子 agent 派出去；打 /skill:名 可把子 agent 当技能叫进来")}
        {` · ${t("⌘K 是命令面板")}`}
      </p>
    </div>
  )
}
