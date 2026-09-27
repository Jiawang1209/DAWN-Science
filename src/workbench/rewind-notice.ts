/**
 * 回退之后对话里那句通知（2026-09-27，spec §2.4）。进转录（`notice`），不是 toast——它说的是一件发生过的事。
 *
 * **内核那句只要挂着活内核就一定出现**：文件回得去，内核里的变量回不去（规格 7.5：失败必须出声）。
 * 措辞固定为「文件已回退，内核里的变量没有回退」——e2e 与后端测试都按这句找。
 */
import type { 回退做法 } from "../runtime/types.js"
import type { 回退结果 } from "../project/checkpoints.js"

const 摘 = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s)

export function 回退通知(x: {
  这句: string
  做法: 回退做法
  结果: 回退结果 | undefined
  内核们: readonly string[]
  图数: number
  conversationError?: string | undefined
}): string {
  const 段: string[] = []
  const r = x.结果
  if (x.做法 !== "conversation" && r) {
    const 动了 = r.restored.length + r.removed.length
    if (动了 === 0 && r.keep.length === 0 && r.cannot.length === 0 && r.failed.length === 0) {
      段.push("这句之后 agent 没有动过文件。")
    } else if (动了 > 0) {
      const 放 = r.trash ? `（放在 ${r.trash}/）` : ""
      段.push(`改回去 ${r.restored.length} 个文件、挪走 ${r.removed.length} 个${放}。`)
    }
    if (r.keep.length) 段.push(`${r.keep.map((k) => k.path).join("、")} 你后来改过，没动。`)
    if (r.cannot.length) 段.push(`${r.cannot.map((k) => k.path).join("、")} 退不回（旧版本没存）。`)
    for (const f of r.failed) 段.push(`${f.path} 没退成（${f.message}）。`)
  }
  if (x.做法 === "conversation") 段.push("文件没有回退，工作区里还留着被撤掉那几轮的改动。")
  if (x.做法 !== "files") {
    if (x.conversationError) 段.push(`对话没撤掉（${x.conversationError}）。`)
    else {
      const 图 = x.图数 > 0 ? `（附的 ${x.图数} 张图没放回来，要的话重新附）` : ""
      段.push(`这句和它之后的对话已撤掉，这句放回了输入框${图}。`)
    }
  }
  if (x.内核们.length) {
    const 谁 = x.内核们.join("、")
    段.push(
      x.做法 === "conversation"
        ? `内核里的变量没有回退：${谁} 内核里还是被撤掉那几轮算出来的东西。`
        : `文件已回退，内核里的变量没有回退：${谁} 内核里还是回退前算出来的东西。`,
    )
  }
  return `已回到「${摘(x.这句)}」之前：${段.join("")}`
}
