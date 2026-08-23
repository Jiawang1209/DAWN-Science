/**
 * `@路径` 引用（2026-08-23，学自 omdsh-dev/dsh-at-file，解读在 `ccb_hive_code_learn/dsh-at-file-解读.md`）。
 *
 * 三条定案：
 * 1. **引用 = 路径 + 类型，不是内容。** 发送前只验路径存在，给模型补一条
 *    `<workspace-reference path="…" kind="file|directory" />`；模型要看就自己用工具读——
 *    于是「读」这件事过我们的权限门、进账本。PDF / 大表 / 图片一视同仁。
 * 2. **草稿里是纯文本 `@路径`**，不做 chip。引用栏是从草稿 parse 出来的视图，不是另一份状态。
 * 3. **识别语法只有这一份**（`引用令牌`）。输入卡的菜单、引用栏、发送前的扫描都从这里取——
 *    dsh-at-file 叫它 recognition contract：三处各抄一份，迟早有一处认的和别处不一样。
 *    `tests/ui/design-contract.test.ts` 盯着不许别处再写这条正则。
 *
 * 这个文件**不 import node**：界面与主进程都用它。真正的 `stat` 由调用方注入。
 */

/**
 * `@` 后面一串没有空白、没有第二个 `@` 的字。
 * **全角标点也是边界**（dsh-at-file 只认空白——它的用户写英文；我们的人写「看看 @a.csv，再看 @b.csv」，
 * 那个全角逗号不是路径的一部分）。半角句末标点留给 `尾随标点` 剥。
 */
export const 引用令牌 = /@([^\s@，。；：！？（）「」『』【】、《》]+)/g

/** 草稿里一个 `@路径` 的位置（含 `@`），路径已去掉尾部 `/` 与尾随标点 */
export interface 引用 {
  path: string
  start: number
  end: number
}

/** 中文 / 英文句末常见的标点——`看看 @data/a.csv。` 里那个句号不属于路径 */
const 尾随标点 = /[.,;:!?。，；：！？)）\]】」』>]+$/

/**
 * 扫一段文字里的 `@路径`，按首次出现去重。
 * 只认形状，不验存在——存在与否在发送那一刻问文件系统。
 */
export function 扫引用(text: string): 引用[] {
  const 见过 = new Set<string>()
  const 出: 引用[] = []
  for (const m of text.matchAll(引用令牌)) {
    const 原 = m[1]!
    // 粘贴进来的（带标记）不算——见 `粘贴标记`
    if (原.includes("\u2060")) continue
    // 先剥尾随标点，再剥目录形式的尾 `/`
    const 去标点 = 原.replace(尾随标点, "")
    const path = 去标点.replace(/\/+$/, "")
    if (!path || 见过.has(path)) continue
    见过.add(path)
    出.push({ path, start: m.index, end: m.index + 1 + 去标点.length })
  }
  return 出
}

export interface 引用结果 {
  path: string
  kind: "file" | "directory"
}

/** 这一路径在哪：本地相对工作区；远端则相对那段会话的当前目录 */
export type 查路径 = (relative: string) => Promise<"file" | "directory" | undefined>

/** 给模型那一行。属性转义，路径本身一个字不改 */
export function 引用标记(r: 引用结果, host?: string): string {
  const 转 = (v: string) => v.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  return `<workspace-reference path="${转(r.path)}" kind="${r.kind}"${host ? ` host="${转(host)}"` : ""} />`
}

/**
 * 发送前那一步：扫用户这一句、逐个验存在，把存在的拼成引用附在后面。
 *
 * - 绝对路径、越出工作区的（`..`）**不认**：引用只指工作区里的东西；
 * - 不存在的留作普通文字——`@alice` 这种 handle 就这样自然地什么都不发生；
 * - 原文一字不动，引用另起一段附在末尾（dsh-at-file 注入的是一条独立消息；pi 的 `prompt` 只收一段文本，
 *   所以拼在后面、用空行隔开。界面上显示的仍是人写的原文——显示与发出去的分开，技能那一路早就这么干）。
 */
export async function 展开引用(text: string, 查: 查路径, host?: string): Promise<{ text: string; refs: 引用结果[] }> {
  const refs: 引用结果[] = []
  for (const r of 扫引用(text)) {
    if (r.path.startsWith("/") || r.path.startsWith("~") || /^[A-Za-z]:[\\/]/.test(r.path)) continue
    const 段 = r.path.split("/")
    if (段.includes("..")) continue
    const kind = await 查(r.path).catch(() => undefined)
    if (!kind) continue
    refs.push({ path: r.path, kind })
  }
  if (refs.length === 0) return { text, refs }
  return { text: `${text}\n\n${refs.map((r) => 引用标记(r, host)).join("\n")}`, refs }
}

/* ---------- 第二档（学 dsh-at-file）：粘贴的 `@` 不算；文件名过滤 ---------- */

/**
 * 粘贴标记：零宽的 word-joiner，塞在粘贴进来的每个 `@` 后面。
 * 屏幕上看不见、草稿一字不变，但识别语法看见它就知道「这不是人打的手势」——
 * 从别的应用复制来的一段里的 `@alice`、哪怕是真实存在的 `@data/a.csv`，都不开菜单、不进栏、不发给模型。
 * 发给模型 / 存转录前剥掉。
 */
export const 粘贴标记 = "⁠"
export function 护住粘贴的艾特(text: string): string {
  return text.replace(/@(?=[^\s@])/g, `@${粘贴标记}`)
}
export function 剥掉粘贴标记(text: string): string {
  return text.replaceAll(粘贴标记, "")
}

/** 一条文件名过滤规则：精确文件名（不含路径分隔符）或正则；都只看文件名，不看父目录 */
export interface 文件规则 {
  kind: "exact" | "regex"
  pattern: string
  caseSensitive: boolean
}

/** 正则写坏了要在存之前就说——这里回错误字样，没错回 undefined */
export function 规则的毛病(r: 文件规则): string | undefined {
  if (!r.pattern) return "空的"
  if (r.kind === "exact" && /[\\/]/.test(r.pattern)) return "精确匹配只认文件名，不能带路径分隔符"
  if (r.kind === "regex") {
    try {
      new RegExp(r.pattern, r.caseSensitive ? "" : "i")
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }
  return undefined
}

/** 编成一个判据：这个文件名该不该从 `@` 菜单里滤掉。坏规则跳过（两头都验过，这里只是兜底） */
export function 编文件规则(rules: readonly 文件规则[]): (name: string) => boolean {
  const 判 = rules
    .filter((r) => !规则的毛病(r))
    .map((r) =>
      r.kind === "exact"
        ? r.caseSensitive
          ? (n: string) => n === r.pattern
          : (n: string) => n.toLowerCase() === r.pattern.toLowerCase()
        : ((re) => (n: string) => re.test(n))(new RegExp(r.pattern, r.caseSensitive ? "" : "i")),
    )
  return (name) => 判.some((f) => f(name))
}
