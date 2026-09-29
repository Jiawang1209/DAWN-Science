/**
 * 回退这一轮 · 界面一侧（2026-09-27，spec §2）。确认框说什么由这里的纯函数定——**有单测**，App 只管把它摆进 `ConfirmDialog`。
 *
 * 三条纪律：内核那句只要有活内核就一定在；文件退不了时说缘故、只剩「只撤掉对话」；预览失败、执行失败都出声。
 */
import { atom } from "nanostores"
import type { ResponseOf } from "../../protocol/operations.js"
import type { TranscriptItem } from "../../protocol/index.js"
import { msgid, t, tf } from "../i18n/index.js"
import { 是回显 } from "./transcript-slot.js"

export type 回退预览 = ResponseOf<"previewRewind">
export type 回退回执 = ResponseOf<"rewindTurn">
export type 回退做法 = "both" | "files" | "conversation"

export interface 回退确认内容 {
  title: string
  行们: { 标: string; path: string; 注?: string }[]
  /** 列表之外要说的：空表那句、退不了的缘故、附图、对话那一句 */
  说明: string[]
  内核: string | undefined
  safety: string
  主: { label: string; 做法: 回退做法 }
  次?: { label: string; 做法: 回退做法 }
}

/**
 * 标题里那句太长就截断——截断要看得出来（`…`），不是悄悄少几个字。
 * **按码点数**：`slice` 按 UTF-16 单元切，会把 emoji 劈成半个代理对（审查 f）。多行压成一行：标题只有一行。
 */
const 摘 = (s: string) => {
  const 字 = Array.from(s.replace(/\s+/g, " ").trim())
  return 字.length > 24 ? `${字.slice(0, 24).join("")}…` : 字.join("")
}
const 人话字节 = (n: number) => (n >= 1024 ** 3 ? `${Number((n / 1024 ** 3).toFixed(1))} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`)

/** 表里的原文用 `msgid()` 标出来：`t()` 拿的是变量，双语扫描要靠这个记号认出它们 */
const 退不了的话: Record<Extract<回退预览["files"], { ok: false }>["reason"], string> = {
  remote: msgid("远端会话的文件在服务器上，DAWN 不在服务器上存任何东西"),
  before_archive: msgid("这句在开始存档之前（这段会话早于回退功能）"),
  gap: msgid("这句之后有一轮没存上档"),
  too_many_files: msgid("工作区超过 2 万个文件，没法存档"),
  no_archive: msgid("这段会话没有存档"),
}

export function 回退确认(预览: 回退预览, 这句: string): 回退确认内容 {
  const 说明: string[] = []
  const 行们: 回退确认内容["行们"] = []
  const f = 预览.files
  if (f.ok) {
    for (const p of f.restore) 行们.push({ 标: t("改回去"), path: p })
    for (const p of f.remove) 行们.push({ 标: t("挪走"), path: p, 注: t("这句之前还没有它") })
    for (const k of f.keep) 行们.push({ 标: t("不动"), path: k.path, 注: t("你后来改过") })
    for (const c of f.cannot) {
      const 注 =
        c.reason === "too_large"
          ? tf("超过 {0}，没存旧版本", 人话字节(预览.limits.fileBytes))
          : c.reason === "over_budget"
            ? tf("存档满了（{0}），没存旧版本", 人话字节(预览.limits.totalBytes))
            : c.reason === "raw_data"
              ? t("data/raw/ 是原始数据，回退不碰它")
              : t("没存上旧版本")
      行们.push({ 标: t("退不回"), path: c.path, 注 })
    }
    if (行们.length === 0) 说明.push(t("这句之后 agent 没有动过文件。"))
    说明.push(t("对话：选「文件和对话一起回退」，这句和它之后的对话撤掉，这句放回输入框。"))
  } else {
    说明.push(tf("文件回退不了：{0}", t(退不了的话[f.reason])))
    说明.push(t("对话：这句和它之后的对话撤掉，这句放回输入框；文件保持现在的样子。"))
  }
  if (预览.images) 说明.push(tf("那句附的 {0} 张图放不回输入框，要的话重新附。", 预览.images))
  return {
    // 只附了图、没有字：不出现空的「」
    title: 摘(这句) ? tf("回到「{0}」之前？", 摘(这句)) : t("回到那句之前？"),
    行们,
    说明,
    内核: 预览.kernels.length ? tf("内核里的变量不会回退：{0} 内核还是现在的样子。", 预览.kernels.join("、")) : undefined,
    safety: t("data/raw/ 不会被碰。.git、node_modules、虚拟环境和符号链接不在回退范围。挪走和换下来的文件放进工作区的 .dawn/trash/。"),
    ...(f.ok
      ? { 主: { label: t("文件和对话一起回退"), 做法: "both" as const }, 次: { label: t("只回退文件"), 做法: "files" as const } }
      : { 主: { label: t("只撤掉对话"), 做法: "conversation" as const } }),
  }
}

/** 一句自己说的话：回退要的就这两样 */
export interface 那句 {
  id: string
  text: string
}

/**
 * 按 id 找自己说的那句（审查 e）。**找不到、或那条不是自己说的：`undefined`**——
 * 调用方据此拒绝并出声，而不是拿空字符串开一张「回到「」之前？」的框。
 */
export function 找这句(items: readonly TranscriptItem[], turnId: string): 那句 | undefined {
  const x = items.find((i) => i.id === turnId)
  return x && x.type === "turn" && x.who === "user" ? { id: x.id, text: x.text } : undefined
}

/** 最后一句自己说的话（命令面板「回到上一句之前」）。一句都没说过：`undefined` */
export function 最后一句(items: readonly TranscriptItem[]): 那句 | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const x = items[i]!
    // 回显（A1）不是后端的一句——回退不到它，跳过
    if (x.type === "turn" && x.who === "user" && !是回显(x.id)) return { id: x.id, text: x.text }
  }
  return undefined
}

/**
 * **哪几段正在回退**（审查 Important，2026-09-27）。key 是 `sessionId`——主区与坞里那段各算各的。
 * 从发出预览那一刻起记上，到执行做完 / 失败、预览失败、或框没选就关掉时抹掉。
 * 界面据它把那颗按钮与面板那条灰掉，写「正在回退，等它做完」——而不是让第二下跑到后端去碰
 * 「正在回退，回退完再发」（那句说的是**发送**，放在这里读不通）。
 * 只在内存里：回退不跨重启，重启后没有进行中的回退。
 */
export const $回退中 = atom<Readonly<Record<string, true>>>({})
const 记上 = (会话: string) => $回退中.set({ ...$回退中.get(), [会话]: true })
const 抹掉 = (会话: string) => {
  if (!$回退中.get()[会话]) return
  const { [会话]: _, ...其余 } = $回退中.get()
  $回退中.set(其余)
}

/**
 * 预览 → 问 → 执行 → 原文放回输入框。失败一律经 `note` 出声。
 * 回执里逐个文件的结果（跳过的、失败的）由后端写进对话那条通知——那是留在转录里的记录，这里不再弹第二遍。
 *
 * **同一段正在回退时再来一下：什么也不发**（审查 g：连点两下不发两次预览）。`$回退中` 是同步读写的，
 * 第二下赶在界面重渲染、按钮灰掉之前到也拦得住。那颗按钮与面板那条此刻都灰着、写着缘故，所以不另出声。
 *
 * `问` 的第三个参数：框没选就关了（取消 / Escape）时调它。选过之后再来也无妨——只认第一次。
 */
export async function 回退这一轮(d: {
  会话: string
  这句: string
  预览: () => Promise<回退预览>
  问: (内容: 回退确认内容, 选了: (做法: 回退做法) => void, 没选: () => void) => void
  执行: (做法: 回退做法) => Promise<回退回执>
  放回输入框: (text: string) => void
  note: (msg: string) => void
}): Promise<void> {
  if ($回退中.get()[d.会话]) return
  记上(d.会话)
  let 定了 = false
  const 收尾 = () => 抹掉(d.会话)
  const 说 = (e: unknown) => d.note(tf("回退没成：{0}", e instanceof Error ? e.message : String(e)))
  let p: 回退预览
  try {
    p = await d.预览()
  } catch (e) {
    收尾()
    return 说(e)
  }
  d.问(
    回退确认(p, d.这句),
    (做法) => {
      if (定了) return
      定了 = true
      void d
        .执行(做法)
        .then((r) => {
          if (r.editorText !== undefined) d.放回输入框(r.editorText)
        })
        .catch(说)
        .finally(收尾)
    },
    () => {
      if (定了) return
      定了 = true
      收尾()
    },
  )
}
