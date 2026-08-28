/**
 * composer 上那颗「✦ 增强 ▾」（提示词增强 E2，2026-08-21）。
 *
 * 设计：`docs/superpowers/specs/2026-08-21-提示词增强-design.md`「界面」一节。
 * 点文字用当前档增强；点小箭头换档（基础 / 标准 / 专家，记在 `dawn.global.enhance-mode`，只在菜单里显示）；
 * 增强中变「取消」；改完变「撤回」，**撤回最多 5 层、敲键盘也不消失**
 * （参考项目那条「一敲键就没」不抄——人改两个字再想撤回是常事）。
 *
 * 草稿的读写由调用方给（`draft` / `setDraft`）：对话屏的草稿住在 `$drafts`，空态屏住在 useState，
 * 这颗按钮不关心住哪儿。
 */
import { useEffect, useRef, useState } from "react"
import { Button, Row } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 下拉图标, 星图标 } from "./icons.js"

export type EnhanceMode = "basic" | "standard" | "expert"
export const ENHANCE_MODE_KEY = "dawn.global.enhance-mode"

export interface EnhanceOutcome {
  text: string
  note?: string | undefined
  usedContext: { rounds?: [number, number]; docs?: string[]; code?: string[] } | null
}

const 档名: Record<EnhanceMode, () => string> = {
  basic: () => t("基础"),
  standard: () => t("标准"),
  expert: () => t("专家"),
}
const 档说明: Record<EnhanceMode, () => string> = {
  basic: () => t("只改写，不带参考"),
  standard: () => t("带上本会话里相关的几轮对话"),
  expert: () => t("再加工作区里相关的文档与代码（只在像开发任务时）"),
}

export function loadEnhanceMode(): EnhanceMode {
  try {
    const v = localStorage.getItem(ENHANCE_MODE_KEY)
    return v === "basic" || v === "standard" || v === "expert" ? v : "standard"
  } catch {
    return "standard"
  }
}

export function EnhanceControl({
  draft,
  setDraft,
  enhance,
  cancel,
  reason,
  onProblem,
  onNote,
}: {
  draft: string
  setDraft: (text: string) => void
  /** 真去改写。`requestId` 给取消用 */
  enhance: (req: { text: string; mode: EnhanceMode; requestId: string }) => Promise<EnhanceOutcome>
  cancel: (requestId: string) => Promise<unknown>
  /**
   * **做不了时灰着、说理由，不再整颗消失**（2026-08-28 作者定的：「界面里面还是要有的」）。
   * 看不见的能力等于不存在——没 key 的人本来就该在这里看到「填一个就能用」。
   */
  reason?: string | undefined
  /** 出错往 composer 下那条说 */
  onProblem: (msg: string | undefined) => void
  /** 「带上了什么 / 为什么没带」也往 composer 下面说——行内放不下 */
  onNote: (msg: string | undefined) => void
}) {
  const [mode, 设mode] = useState<EnhanceMode>(loadEnhanceMode)
  const [菜单, 设菜单] = useState(false)
  const [忙, 设忙] = useState<string | undefined>(undefined)
  /** 撤回栈：每次增强前的草稿压一层，最多 5 层 */
  const [栈, 设栈] = useState<string[]>([])
  const 当前请求 = useRef<string | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!菜单) return
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) 设菜单(false)
    }
    document.addEventListener("pointerdown", away)
    return () => document.removeEventListener("pointerdown", away)
  }, [菜单])

  const 换档 = (m: EnhanceMode) => {
    设mode(m)
    设菜单(false)
    try {
      localStorage.setItem(ENHANCE_MODE_KEY, m)
    } catch {
      /* 记不住就记不住，这次仍然生效 */
    }
  }

  const 去增强 = async () => {
    const text = draft.trim()
    if (!text || 忙) return
    const requestId = `enh-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    当前请求.current = requestId
    设忙(t("改写中"))
    onProblem(undefined)
    onNote(undefined)
    const 之前 = draft
    try {
      const r = await enhance({ text, mode, requestId })
      if (当前请求.current !== requestId) return // 已取消
      设栈((前) => [...前, 之前].slice(-5))
      setDraft(r.text)
      onNote(r.note ? tf("这次没带上下文：{0}", r.note) : r.usedContext ? 说参考(r.usedContext) : undefined)
    } catch (e) {
      if (当前请求.current !== requestId) return
      onProblem(tf("增强失败：{0}", e instanceof Error ? e.message : String(e)))
    } finally {
      if (当前请求.current === requestId) {
        当前请求.current = undefined
        设忙(undefined)
      }
    }
  }

  const 去取消 = () => {
    const id = 当前请求.current
    if (!id) return
    当前请求.current = undefined
    设忙(undefined)
    void cancel(id).catch(() => {})
  }

  const 撤回 = () => {
    const 上 = 栈.at(-1)
    if (上 === undefined) return
    设栈((前) => 前.slice(0, -1))
    setDraft(上)
    onNote(undefined)
  }

  // ⌘⇧E
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault()
        if (忙) 去取消()
        else void 去增强()
      }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  })

  if (reason) {
    return (
      <div className="enhance-control">
        <Button variant="ghost" size="sm" className="enhance-main" disabled aria-label={reason}>
          <星图标 className="row-icon" /> {t("优化输入")}
        </Button>
      </div>
    )
  }
  const 空 = !draft.trim()

  return (
    <div className="enhance-control" ref={box}>
      {/**
        * **一颗按钮、两个点击区**（2026-08-21 作者定的：档位与增强合并，省位置）：
        * 点文字 = 增强（忙时 = 放弃）；点右边那个小箭头 = 换档。档位只在菜单里看得见。
        */}
      {忙 ? (
        <Button variant="ghost" size="sm" className="enhance-main busy" onClick={去取消}>
          <span className="enhance-spin" aria-hidden="true" />
          <span>{tf("{0}…放弃", 忙)}</span>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="enhance-main"
          disabled={空}
          /* 灰的理由进标签，不再常驻一句话在旁边（2026-08-22 作者：「后面的先写点什么，有点儿不好看」） */
          aria-label={空 ? t("先写点什么再优化") : t("优化输入")}
          onClick={() => void 去增强()}
        >
          <星图标 className="row-icon" /> {t("优化输入")}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="enhance-mode"
        aria-haspopup="menu"
        aria-expanded={菜单}
        aria-label={tf("档位：{0}", 档名[mode]())}
        onClick={() => 设菜单((v) => !v)}
      >
        <下拉图标 />
      </Button>
      {栈.length > 0 ? (
        <Button variant="ghost" size="sm" className="enhance-undo" onClick={撤回}>
          {栈.length > 1 ? tf("撤回（{0}）", 栈.length) : t("撤回")}
        </Button>
      ) : null}
      {菜单 ? (
        <div className="agent-menu enhance-menu" role="menu" aria-label={t("选档位")}>
          <ul>
            {(["basic", "standard", "expert"] as const).map((m) => (
              <li key={m}>
                <Row role="menuitemradio" aria-checked={m === mode} active={m === mode} onClick={() => 换档(m)}>
                  <span className="sess">
                    <span className="name">{档名[m]()}</span>
                    <span className="sub">{档说明[m]()}</span>
                  </span>
                </Row>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function 说参考(u: NonNullable<EnhanceOutcome["usedContext"]>): string {
  const 段: string[] = []
  if (u.rounds) 段.push(tf("对话第 {0}–{1} 轮", u.rounds[0], u.rounds[1]))
  if (u.docs?.length) 段.push(tf("{0} 份文档", u.docs.length))
  if (u.code?.length) 段.push(tf("{0} 个代码文件", u.code.length))
  return tf("带上了：{0}", 段.join("、"))
}
