/**
 * 先出方案（2026-09-27，spec `2026-09-27-先出方案-design.md`）：运行时、后端、界面共用的几件纯函数。
 *
 * **坐在 `protocol/`**：界面要用「产物解析」与「对照」，而 UI 只许跨到这一层
 * （`tests/protocol/ui-boundary.test.ts`）——与 `notebook-cells.ts` 同一个理由。
 */

/** 交方案的工具名。中枢据它不画工具行、`history()` 据它还原成卡片——**只在这里写一次** */
export const 出方案工具名 = "propose_plan"
/** 方案期看数据结构的工具名 */
export const 看数据工具名 = "inspect_data"

/**
 * 方案必须有的五节（spec §2.3）。**顺序就是点名的顺序**。
 * 学的是预注册的骨架：问题、数据、方法、图、产物——看到结果之前把这五件事定下来。
 */
export const 必填小节 = ["问题与假设", "数据与切分", "统计检验与模型", "图", "产物"] as const

/** 一版方案。协议里的 `plan` 条目 = 它 + `type` + `id` */
export interface 方案 {
  /** 那次 `propose_plan` 的 toolCallId。`answerPlan` 用它指是哪一版 */
  planId: string
  version: number
  title: string
  markdown: string
  status: "proposed" | "approved" | "superseded" | "discarded"
  /** 存档路径，相对工作区。只有批准了才有 */
  savedPath?: string
  /** 批准时刻（epoch 毫秒） */
  approvedAt?: number
  /** 批的是人改过的那一版 */
  edited?: true
  /**
   * 工作区里那份方案文件此刻和批准时那一版不一样（2026-09-28，D3 定案）：人在两轮之间自己改过——**不恢复**，卡片上说「你改过」。
   * agent 在一轮里改的会被恢复、响亮地说，不走这一条。**只在 true 时出现**；远端会话核对不了，从不出现
   */
  fileChanged?: true
}

const 二级标题 = /^##\s+(.+?)\s*$/

export function 缺的小节(markdown: string): string[] {
  const 有 = new Set(
    markdown
      .split(/\r?\n/)
      .map((l) => 二级标题.exec(l)?.[1]?.trim())
      .filter((x): x is string => Boolean(x)),
  )
  return 必填小节.filter((h) => !有.has(h))
}

/**
 * `## 产物` 这一节里反引号包着、**像路径**的东西（含 `/` 或带扩展名），按出现先后、去重、去掉开头的 `./`。
 * 不像路径的（`pandas`）不算——对照要的是文件，不是名词。
 */
export function 方案产物(markdown: string): string[] {
  const 行 = markdown.split(/\r?\n/)
  const 起 = 行.findIndex((l) => /^##\s+产物\s*$/.test(l))
  if (起 < 0) return []
  const 出: string[] = []
  for (const l of 行.slice(起 + 1)) {
    if (/^##\s/.test(l)) break
    for (const m of l.matchAll(/`([^`\s]+)`/g)) {
      const p = m[1]!.replace(/^\.\//, "")
      if (!/\/|\.\w+$/.test(p)) continue
      if (!出.includes(p)) 出.push(p)
    }
  }
  return 出
}

/** 最简单的通配：`*` 不跨目录，`**` 跨。别的字符照字面比 */
export function 对得上(模式: string, 路径: string): boolean {
  if (!模式.includes("*")) return 模式 === 路径
  const 转 = 模式
    .split("**")
    .map((段) => 段.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
    .join(".*")
  return new RegExp(`^${转}$`).test(路径)
}

export interface 对照结果 {
  计划: { 路径: string; 生成了: string[] }[]
  计划外: string[]
}

/**
 * 批准之后这段会话生成的文件 vs 方案里的产物（spec §2.2）。**批准之前生成的不算**——那不是照方案做出来的。
 * `产物` 就是 `listArtifacts` 的清单（`bornAt` 是 ISO 字符串）。
 */
export function 方案对照(
  计划: readonly string[],
  产物: readonly { path: string; bornAt: string }[],
  批准于: number,
): 对照结果 {
  const 之后 = 产物.filter((a) => Date.parse(a.bornAt) >= 批准于)
  return {
    计划: 计划.map((p) => ({ 路径: p, 生成了: 之后.filter((a) => 对得上(p, a.path)).map((a) => a.path) })),
    计划外: 之后.filter((a) => !计划.some((p) => 对得上(p, a.path))).map((a) => a.path),
  }
}

/**
 * `<YYYY-MM-DD>-<标题>.md`，本地日期。NUL 与控制字符去掉；不能进文件名的字符与空白换成 `-`；最长 40 个**码位**
 * （2026-09-28 审查：按 UTF-16 单元截会把表情这类代理对切成半个，写出一个坏文件名）；截完首尾的 `-` 再去一次。
 */
export function 方案文件名(标题: string, 时刻: Date): string {
  const 换 = 标题
    .replace(/\p{Cc}+/gu, "")
    .replace(/[\\/:*?"<>|#：\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  const 净 = [...换].slice(0, 40).join("").replace(/^-|-$/g, "")
  const p = (n: number) => String(n).padStart(2, "0")
  return `${时刻.getFullYear()}-${p(时刻.getMonth() + 1)}-${p(时刻.getDate())}-${净 || "方案"}.md`
}

/**
 * 批准之后替人发的那一句（spec §2.2）。**它是人的一条发言**：进转录、看得见。
 * 给模型看的，所以是指令口吻、不走 i18n（与 `斜杠选完` 写进草稿的那句同一个口径）。
 * 改过的那一版多一句「以文件为准」：模型上下文里是它自己交的原稿，得让它去读人改过的。
 */
export function 执行那句(存档路径: string, 改过: boolean): string {
  return (
    `照批准的方案做${改过 ? "（我改过，以文件为准，先 read 它）" : ""}：\`${存档路径}\`。` +
    "和方案不一样的地方，做完时逐条说出来，并说明为什么。"
  )
}
