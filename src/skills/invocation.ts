/**
 * SKILL.md 的调用策略（skills-manage，2026-08-21）。
 *
 * 学自 dsh-skills-manager 的 `updateInvocationPolicy`（Apache-2.0，思路借、代码自己写）：
 * **只动 frontmatter 里的两行，别的一字不碰**——不把 YAML 读进来再吐出去，
 * 那会丢注释、改键序、打散嵌套块。
 *
 * 三档（与它那儿「一个开关管两件事」不同——有人只想「模型别自己用、我手动还能调」）：
 *
 * | 档 | frontmatter | 谁能用 |
 * |---|---|---|
 * | `model`  | 两行都没有（缺省） | 模型自己挑，`/skill:名` 也行 |
 * | `manual` | `disable-model-invocation: true` | 只有 `/skill:名`（pi 原生认这一行） |
 * | `off`    | 再加 `user-invocable: false` | 谁都不给（`native.ts` 的 `skillsOverride` 把它剔掉） |
 *
 * 这两行是 agentskills.io 的标准字段，Claude / Codex / pi 都认——所以写文件而不是在 DAWN 配置里记名单：
 * 后者会让同一个技能在 DAWN 里关着、在别的工具里开着，两个真相（作者 2026-08-21 定的）。
 */

export type 调用档 = "model" | "manual" | "off"

const 行 = /^(disable-model-invocation|user-invocable)\s*:\s*(.*)$/
const 真 = (v: string) => /^(true|yes|on|1)$/i.test(v)
const 假 = (v: string) => /^(false|no|off|0)$/i.test(v)
/** 去掉行内注释与引号，只留值 */
const 取值 = (raw: string) => raw.replace(/\s+#.*$/, "").trim().replace(/^(['"])(.*)\1$/, "$2").trim()

/** 把文本拆成 BOM / 换行符 / 行数组 / frontmatter 收尾行号（没有完整头尾 → end = -1） */
function 拆(text: string) {
  const bom = text.charCodeAt(0) === 0xfeff ? "﻿" : ""
  const 正文 = bom ? text.slice(1) : text
  const 换行 = 正文.includes("\r\n") ? "\r\n" : "\n"
  const 行们 = 正文.split(/\r?\n/)
  let end = -1
  if (行们[0]?.trim() === "---") {
    for (let i = 1; i < 行们.length; i++) {
      if (行们[i]!.trim() === "---") {
        end = i
        break
      }
    }
  }
  return { bom, 换行, 行们, end }
}

/** 读。读不出（没 frontmatter、值写得怪）一律当缺省 `model`——**读不坏** */
export function 读调用策略(text: string): 调用档 {
  const { 行们, end } = 拆(text)
  if (end < 0) return "model"
  let 模型关 = false
  let 手动关 = false
  for (let i = 1; i < end; i++) {
    const m = 行.exec(行们[i]!)
    if (!m) continue
    const v = 取值(m[2]!)
    if (m[1] === "disable-model-invocation" && 真(v)) 模型关 = true
    if (m[1] === "user-invocable" && 假(v)) 手动关 = true
  }
  return 手动关 ? "off" : 模型关 ? "manual" : "model"
}

/**
 * 写。返回新文本；**没有完整 frontmatter 回 `undefined`**——不硬改一个我们读不懂的文件。
 * 原有的这两行（不论写法、带不带注释）先去掉，再按档补上；`model` 是把两行都删掉，不写 `false`。
 */
export function 写调用策略(text: string, 档: 调用档): string | undefined {
  const { bom, 换行, 行们, end } = 拆(text)
  if (end < 0) return undefined
  const 头 = 行们.slice(1, end).filter((l) => !行.test(l))
  if (档 === "manual") 头.push("disable-model-invocation: true")
  if (档 === "off") 头.push("disable-model-invocation: true", "user-invocable: false")
  return bom + ["---", ...头, "---", ...行们.slice(end + 1)].join(换行)
}
