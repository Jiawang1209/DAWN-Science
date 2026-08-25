/**
 * 记忆插件的工具面(2026-08-25,规格 `specs/2026-08-25-记忆-design.md`;
 * 插件册第三张卡)。三工具三族:
 *   - propose:`memory_propose`——**提议制**,进待确认队列,采纳后下一段会话生效;
 *   - read:`memory_list`——查存量(注入的是快照,这个查全量/归档外的明细);
 *   - skill:`skill_propose`——AI 把流程写成 SKILL.md 提交待确认。
 *
 * 复用 office 插件的定义 DSL 与 pi 包壳(`包成pi工具`)。
 * 模型侧**没有** replace/remove——改删是用户在记忆屏的动作,不给模型直改的口。
 */
import { join } from "node:path"
import { 包成pi工具 } from "../office/index.js"
import type { Office工具定义 } from "../office/shape.js"
import { MemoryStore, parseEntryBranches, stripEntryId, type 记忆轨 } from "../../memory/store.js"
import { SuggestionQueue } from "../../memory/queue.js"
import { 待装技能 } from "../../memory/pending-skills.js"

export interface Memory开关 {
  off: boolean
  propose: boolean
  read: boolean
  skill: boolean
}

export interface Memory依赖 {
  /** 全局记忆根(USER.md/MEMORY.md/SUGGESTIONS.jsonl/pending-skills 都在它下面) */
  memoriesDir: string
  /** 技能库根(skill_propose 批准后的落点;重名检查也看它) */
  skillsDir: string
}

export function memory工具定义(
  workspace: string,
  deps: Memory依赖,
): { 族: string; 名: string; 工具: Office工具定义[] }[] {
  const store = new MemoryStore(deps.memoriesDir)
  const queue = new SuggestionQueue(join(deps.memoriesDir, "SUGGESTIONS.jsonl"))
  const pending = new 待装技能(join(deps.memoriesDir, "pending-skills"), () => deps.skillsDir)

  const propose: Office工具定义[] = [
    {
      name: "memory_propose",
      description:
        "提议一条长期记忆(进待确认队列,用户采纳后写入,下一段会话注入生效)。只提**长期有效**的事实:项目约定、口径决策、架构、踩坑结论;流水进展不要提。不要自己写时间戳。target:user=用户档案,memory=全局事实,key=本项目关键记忆(可用 branches 限定只在某些 git 分支生效)。",
      parameters: {
        target: { type: "string", required: true, enum: ["user", "memory", "key"], description: "记哪条轨" },
        content: { type: "string", required: true, description: "要记的内容(不带时间戳)" },
        reason: { type: "string", description: "为什么值得长期记住(用户确认时看)" },
        branches: {
          type: "array",
          items: { type: "string" },
          description: "仅 key:限定只在这些 git 分支注入(缺省=全部分支)",
        },
      },
      execute: async (args) => {
        const target = String(args.target) as 记忆轨
        const r = queue.propose(target, String(args.content ?? ""), String(args.reason ?? ""), {
          ...(target === "key" ? { workspace } : {}),
          ...(Array.isArray(args.branches) && args.branches.length > 0
            ? { branches: (args.branches as unknown[]).map(String) }
            : {}),
        })
        return { content: r.message }
      },
    },
  ]

  const read: Office工具定义[] = [
    {
      name: "memory_list",
      description:
        "查长期记忆的存量明细(注入快照之外的全量查看)。key 轨可按 branch 过滤;filter 子串筛;默认最多 50 条。",
      parameters: {
        target: { type: "string", required: true, enum: ["user", "memory", "key"], description: "查哪条轨" },
        filter: { type: "string", description: "子串筛选(大小写不敏感)" },
        branch: { type: "string", description: "仅 key:只看这个分支可见的条目" },
        limit: { type: "integer", description: "最多几条(默认 50)" },
      },
      execute: async (args) => {
        const target = String(args.target) as 记忆轨
        let entries: string[]
        try {
          entries = store.entries(target, target === "key" ? { workspace } : undefined)
        } catch (e) {
          return { content: e instanceof Error ? e.message : String(e) }
        }
        if (target === "key" && args.branch) {
          const b = String(args.branch).trim()
          entries = entries.filter((e) => {
            const scope = parseEntryBranches(e)
            return scope === null || scope.includes(b)
          })
        }
        if (args.filter) {
          const q = String(args.filter).toLowerCase()
          entries = entries.filter((e) => e.toLowerCase().includes(q))
        }
        const 总 = entries.length
        // limit 传了非数字(如 "abc")时 Number→NaN,slice(0,NaN) 会静默返回空数组,
        // 却照报「共 N 条」——模型据此以为记忆空了(审查 debug C10)。NaN 一律退回默认 50。
        const n = Number(args.limit ?? 50)
        const limit = Number.isFinite(n) ? Math.max(1, Math.min(n, 500)) : 50
        entries = entries.slice(0, limit)
        if (总 === 0) return { content: `${target}:没有条目` }
        const 截 = 总 > entries.length ? `(共 ${总} 条,只列前 ${entries.length}——加 filter 缩小范围)` : ""
        return { content: `${target}:${总} 条${截}\n${entries.map((e) => `- ${stripEntryId(e)}`).join("\n")}` }
      },
    },
  ]

  const skill: Office工具定义[] = [
    {
      name: "skill_propose",
      description:
        "把一套做过、值得复用的流程写成技能提交(进待确认队列,用户批准后装进技能库)。body 必须是完整 SKILL.md:frontmatter(name + description)+ 步骤正文;name 全小写 kebab-case 且与 frontmatter 一致。",
      parameters: {
        name: { type: "string", required: true, description: "技能名(kebab-case,如 otu-network)" },
        body: { type: "string", required: true, description: "完整 SKILL.md 内容" },
      },
      execute: async (args) => {
        const r = pending.propose(String(args.name ?? ""), String(args.body ?? ""))
        return { content: r.message }
      },
    },
  ]

  return [
    { 族: "propose", 名: "提议", 工具: propose },
    { 族: "read", 名: "查看", 工具: read },
    { 族: "skill", 名: "技能沉淀", 工具: skill },
  ]
}

export function memoryTools(workspace: string, 开: Memory开关, deps: Memory依赖): unknown[] {
  if (开.off) return []
  const 出: unknown[] = []
  for (const f of memory工具定义(workspace, deps)) {
    if (!开[f.族 as keyof Omit<Memory开关, "off">]) continue
    for (const d of f.工具) 出.push(包成pi工具(d, workspace))
  }
  return 出
}
