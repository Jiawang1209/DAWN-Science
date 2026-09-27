/**
 * 回退这一轮 · 界面一侧（2026-09-27，spec §2）。确认框说什么由这里的纯函数定——**有单测**，App 只管把它摆进 `ConfirmDialog`。
 *
 * 三条纪律：内核那句只要有活内核就一定在；文件退不了时说缘故、只剩「只撤掉对话」；预览失败、执行失败都出声。
 */
import type { ResponseOf } from "../../protocol/operations.js"
import { msgid, t, tf } from "../i18n/index.js"

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

/** 标题里那句太长就截断——截断要看得出来（`…`），不是悄悄少几个字 */
const 摘 = (s: string) => (s.length > 24 ? `${s.slice(0, 24)}…` : s)
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
    title: tf("回到「{0}」之前？", 摘(这句)),
    行们,
    说明,
    内核: 预览.kernels.length ? tf("内核里的变量不会回退：{0} 内核还是现在的样子。", 预览.kernels.join("、")) : undefined,
    safety: t("data/raw/ 不会被碰。.git、node_modules、虚拟环境和符号链接不在回退范围。挪走和换下来的文件放进工作区的 .dawn/trash/。"),
    ...(f.ok
      ? { 主: { label: t("文件和对话一起回退"), 做法: "both" as const }, 次: { label: t("只回退文件"), 做法: "files" as const } }
      : { 主: { label: t("只撤掉对话"), 做法: "conversation" as const } }),
  }
}

/**
 * 预览 → 问 → 执行 → 原文放回输入框。失败一律经 `note` 出声。
 * 回执里逐个文件的结果（跳过的、失败的）由后端写进对话那条通知——那是留在转录里的记录，这里不再弹第二遍。
 */
export async function 回退这一轮(d: {
  这句: string
  预览: () => Promise<回退预览>
  问: (内容: 回退确认内容, 选了: (做法: 回退做法) => void) => void
  执行: (做法: 回退做法) => Promise<回退回执>
  放回输入框: (text: string) => void
  note: (msg: string) => void
}): Promise<void> {
  const 说 = (e: unknown) => d.note(tf("回退没成：{0}", e instanceof Error ? e.message : String(e)))
  let p: 回退预览
  try {
    p = await d.预览()
  } catch (e) {
    return 说(e)
  }
  d.问(回退确认(p, d.这句), (做法) => {
    void d
      .执行(做法)
      .then((r) => {
        if (r.editorText !== undefined) d.放回输入框(r.editorText)
      })
      .catch(说)
  })
}
