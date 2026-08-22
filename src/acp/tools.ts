/**
 * 递给外部 agent 的那几件工具（B1 路线 B，2026-08-17）。
 *
 * ## 只给「只有我们有」的东西
 *
 * **一个文件工具、一个 bash 工具都不给**——ACP 进程自己就有，
 * 而且它以我们的身份跑在我们的项目目录里，OS 权限就是全部权限。
 * 再给一份只是多一个重复实现，一分钱安全都买不到
 * （见设计文档里那段「我原本的担心是错的」）。
 *
 * 给的是它**自己做不到**的四类：项目里的技能、账本、溯源。
 *
 * ## 与 wisp 的能力网关的实质区别：**每一次调用都记账**
 *
 * wisp 那套是围绕「能力范围」设计的（`search_tools` / `use_tool` 门面）。
 * 我们围绕的是**不变式 5**：外部 agent 经这条路做的每一件事都落一条 Run，
 * 父账挂在那一轮 ACP 回合上。
 *
 * 所以**刻意不做通用门面**：门面省的是 schema 体积，
 * 代价是账本上留下的是一句 `use_tool`，而不是「它到底调了什么」。
 */
import { readFileSync } from "node:fs"
import type { 网关工具 } from "./gateway.js"

/** 这一层要用到的外部能力。**全部注入**——这个文件不认识数据库，也不认识 Electron */
export interface 工具装配 {
  /** 这个会话属于哪个项目。**没有项目的会话拿不到项目级的东西** */
  项目of: (sessionId: string) => string | undefined
  /** 列出可用技能（与「Agent Skills」那一屏同一条路，**两处分家就会各说各的**） */
  列技能: (projectId: string | undefined) => Promise<{ name: string; description: string; filePath: string }[]>
  /** 查一个产物是哪一次 Run 出的 */
  查溯源: (resourceId: string) => { producingRunId?: string | undefined; recordedAt?: string | undefined } | undefined
  /**
   * 记一条 Run。**返回 runId**。
   * `parentRunId` 缺席时不硬挂——那是把 A 的账算到 B 头上。
   */
  /**
   * 在**我们起的解释器**里跑一段代码（B1·B′，2026-08-17）。
   *
   * **这是四件里最有分量的一件**：ACP agent 自己只有 bash，
   * 它跑完 `python x.py` 之后，账本上没有环境证据、没有结构化输出、
   * 没有图。走这条路的话三样都有。
   *
   * 不给这个钩子时，那件工具**根本不出现在清单里**——
   * 摆一个「点了说没配」的工具，比不摆更坏。
   */
  跑内核?: (
    sessionId: string,
    language: "python" | "R",
    code: string,
  ) => Promise<{ 文本: string; 出错?: boolean }>
  记一笔: (
    sessionId: string,
    requestType: string,
    详情: { 出错: boolean; 说明?: string },
  ) => void
  /**
   * 定时任务（第二档，2026-08-22，学自 dsh-automation 的 `automation_*` 工具）。
   * **跑在哪、用哪个 agent 都取当前这段会话的**——在哪儿说的就在哪儿跑。
   * 建出来的按当前会话的权限档：「全放行」直接生效；「拦危险的」建成**暂停**的，
   * 要人到「定时」里按恢复——这就是我们的「授权卡」：无人值守的东西不该由一句话就开起来。
   */
  定时?: {
    建: (sessionId: string, req: { name: string; prompt: string; schedule: Record<string, unknown> }) => Promise<{ id: string; name: string; status: string; nextAt?: string; where: string }>
    列: () => Promise<{ id: string; name: string; status: string; schedule: Record<string, unknown>; nextAt?: string; lastRun?: { status: string; summary?: string; error?: { message: string } } }[]>
    删: (id: string) => Promise<void>
  }
}

const 空参数 = { type: "object", properties: {}, additionalProperties: false }

export function 工具清单(有内核: boolean): 网关工具[] {
  return [
    ...(有内核
      ? [
          {
            name: "dawn_run_in_kernel",
            description:
              "在 DAWN 起的 Jupyter 内核里跑一段代码（Python 或 R）。**同一段会话里变量留得住**——" +
              "上一次定义的东西下一次还在。比自己起 python 进程强的地方：输出是结构化的（图、表、报错分开），" +
              "而且这次运行会带着环境快照进 DAWN 的账本，之后查得到「这个结果是怎么来的」。",
            schema: {
              type: "object",
              properties: {
                language: { type: "string", enum: ["python", "R"], description: "哪门语言" },
                code: { type: "string", description: "要跑的代码" },
              },
              required: ["language", "code"],
              additionalProperties: false,
            },
          },
        ]
      : []),
    {
      name: "dawn_list_skills",
      description:
        "列出当前项目里可用的 Agent Skills（DAWN 管理的技能，含项目级、全局与自带三处）。返回名字、说明与文件路径。",
      schema: 空参数,
    },
    {
      name: "dawn_use_skill",
      description:
        "读出一个 Agent Skill 的完整内容（SKILL.md）。先用 dawn_list_skills 拿到名字。",
      schema: {
        type: "object",
        properties: { name: { type: "string", description: "技能名" } },
        required: ["name"],
        additionalProperties: false,
      },
    },
    {
      name: "dawn_provenance",
      description: "查一个产物是哪一次运行产生的（DAWN 的溯源账本）。",
      schema: {
        type: "object",
        properties: { resourceId: { type: "string", description: "产物的路径或 id" } },
        required: ["resourceId"],
        additionalProperties: false,
      },
    },
    {
      name: "dawn_schedule_create",
      description:
        "建一条 DAWN 定时任务：到点了会开一段全新的会话（跑在当前这段会话所在的项目 / 服务器上，用同一个 agent），把 prompt 发给它。" +
        "prompt 要自包含——那段会话记不得现在这段对话。计划四选一：daily（time）/ weekly（weekdays + time）/ interval（everyMinutes）/ once（at，ISO）/ monthly（day + time）/ everyDays（everyDays + start + time）。" +
        "当前会话是「拦危险的」档时，建出来是暂停的，要用户到「定时」里按恢复——告诉用户这一点。",
      schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "短名字" },
          prompt: { type: "string", description: "每次独立运行都用的、自包含的任务说明" },
          kind: { type: "string", enum: ["daily", "weekly", "interval", "once", "monthly", "everyDays"] },
          time: { type: "string", description: "HH:mm（daily / weekly / monthly / everyDays）" },
          weekdays: { type: "array", items: { type: "string", enum: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] }, description: "weekly 用" },
          everyMinutes: { type: "integer", description: "interval 用，最小 1" },
          at: { type: "string", description: "once 用，ISO 时刻" },
          day: { type: "integer", description: "monthly 用，1–31" },
          everyDays: { type: "integer", description: "everyDays 用" },
          start: { type: "string", description: "everyDays 用，YYYY-MM-DD 起点" },
        },
        required: ["name", "prompt", "kind"],
        additionalProperties: false,
      },
    },
    {
      name: "dawn_schedule_list",
      description: "列出 DAWN 的定时任务：名字、计划、下一次、上一次结果。",
      schema: 空参数,
    },
    {
      name: "dawn_schedule_delete",
      description: "删一条 DAWN 定时任务（先用 dawn_schedule_list 拿 id）。运行记录留着。",
      schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    },
    {
      name: "dawn_record_note",
      description:
        "往 DAWN 的账本里记一条你的结论（例如「样本在 3 月之前有偏」）。它会挂在当前这一轮上，之后在项目历史里查得到。",
      schema: {
        type: "object",
        properties: { text: { type: "string", description: "要记下的一句话" } },
        required: ["text"],
        additionalProperties: false,
      },
    },
  ]
}

/**
 * 真正干活的那一半。
 *
 * **每一次调用都先记一笔账**，无论成败——失败也是事实
 * （「它试过读一个不存在的技能」本身就值得留在账本上）。
 */
export function 建调用(装配: 工具装配) {
  return async (
    sessionId: string,
    工具名: string,
    参数: Record<string, unknown>,
  ): Promise<{ 文本: string; 出错?: boolean }> => {
    const 记 = (出错: boolean, 说明?: string) =>
      装配.记一笔(sessionId, `acp_tool:${工具名}`, { 出错, ...(说明 ? { 说明 } : {}) })
    try {
      const r = await 干(装配, sessionId, 工具名, 参数)
      记(false)
      return r
    } catch (e) {
      const 因 = e instanceof Error ? e.message : String(e)
      记(true, 因)
      // **原样交给它**：它需要知道为什么不行，才可能改道
      return { 文本: 因, 出错: true }
    }
  }
}

async function 干(
  装配: 工具装配,
  sessionId: string,
  工具名: string,
  参数: Record<string, unknown>,
): Promise<{ 文本: string; 出错?: boolean }> {
  const 项目 = 装配.项目of(sessionId)

  if (工具名 === "dawn_list_skills") {
    const 技能 = await 装配.列技能(项目)
    if (技能.length === 0) {
      // **如实说「没有」**，不返回一个空列表让它自己猜
      return { 文本: "这个项目里没有可用的 Agent Skill。" }
    }
    return {
      文本: 技能.map((s) => `- ${s.name}：${s.description}`).join("\n"),
    }
  }

  if (工具名 === "dawn_use_skill") {
    const 名 = 参数["name"]
    if (typeof 名 !== "string") throw new Error("要给 name")
    const 技能 = await 装配.列技能(项目)
    const 命中 = 技能.find((s) => s.name === 名)
    /**
     * **找不到就把有哪些列出来**。只说「没有这个技能」的话，
     * 模型下一步多半是再猜一个名字——而那是可以避免的一轮。
     */
    if (!命中) {
      throw new Error(
        `没有叫「${名}」的技能。现在有：${技能.map((s) => s.name).join("、") || "（一个都没有）"}`,
      )
    }
    return { 文本: readFileSync(命中.filePath, "utf8") }
  }

  if (工具名 === "dawn_provenance") {
    const id = 参数["resourceId"]
    if (typeof id !== "string") throw new Error("要给 resourceId")
    const link = 装配.查溯源(id)
    if (!link?.producingRunId) {
      /**
       * **「没有记录」不是错误**，是一个答案——这个产物不是 DAWN 跑出来的
       * （可能是人手放进去的）。说成错误会让模型以为是自己问错了。
       */
      return { 文本: `账本里没有「${id}」的溯源记录——它可能不是 DAWN 产生的。` }
    }
    return { 文本: `产生它的是 Run ${link.producingRunId}（记于 ${link.recordedAt ?? "未知时间"}）。` }
  }

  if (工具名 === "dawn_run_in_kernel") {
    const lang = 参数["language"]
    const code = 参数["code"]
    if (lang !== "python" && lang !== "R") throw new Error("language 只能是 python 或 R")
    if (typeof code !== "string" || !code.trim()) throw new Error("要给一段非空的 code")
    if (!装配.跑内核) throw new Error("这次运行没有装配内核")
    return 装配.跑内核(sessionId, lang, code)
  }

  if (工具名 === "dawn_record_note") {
    const 文 = 参数["text"]
    if (typeof 文 !== "string" || !文.trim()) throw new Error("要给一句非空的 text")
    // 记账在外层统一做，这里只回执
    return { 文本: `记下了：${文.trim()}` }
  }

  if (工具名 === "dawn_schedule_create") {
    if (!装配.定时) throw new Error("本次运行没有装配定时任务")
    const name = 参数["name"]
    const prompt = 参数["prompt"]
    const kind = 参数["kind"]
    if (typeof name !== "string" || typeof prompt !== "string" || typeof kind !== "string") throw new Error("要给 name、prompt、kind")
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    const schedule: Record<string, unknown> =
      kind === "daily" ? { kind, time: 参数["time"], timeZone }
      : kind === "weekly" ? { kind, weekdays: 参数["weekdays"], time: 参数["time"], timeZone }
      : kind === "interval" ? { kind, everyMinutes: 参数["everyMinutes"], anchor: new Date().toISOString(), timeZone }
      : kind === "once" ? { kind, at: 参数["at"], timeZone }
      : kind === "monthly" ? { kind, day: 参数["day"], time: 参数["time"], timeZone }
      : { kind: "everyDays", everyDays: 参数["everyDays"], start: 参数["start"] ?? new Date().toISOString().slice(0, 10), time: 参数["time"], timeZone }
    const d = await 装配.定时.建(sessionId, { name, prompt, schedule })
    return {
      文本:
        d.status === "paused"
          ? `建好了「${d.name}」（id ${d.id}），跑在 ${d.where}。**现在是暂停的**：当前会话是「拦危险的」档，无人值守的任务要用户自己到侧栏「定时」里按「恢复」才会开始跑。请把这一点告诉用户。`
          : `建好了「${d.name}」（id ${d.id}），跑在 ${d.where}${d.nextAt ? `，下一次 ${d.nextAt}` : ""}。`,
    }
  }

  if (工具名 === "dawn_schedule_list") {
    if (!装配.定时) throw new Error("本次运行没有装配定时任务")
    const 们 = await 装配.定时.列()
    if (们.length === 0) return { 文本: "还没有定时任务。" }
    return {
      文本: 们
        .map((d) => `- ${d.name}（id ${d.id}，${d.status === "paused" ? "暂停中" : "活着"}）计划 ${JSON.stringify(d.schedule)}${d.nextAt ? `，下一次 ${d.nextAt}` : ""}${d.lastRun ? `，上次 ${d.lastRun.status}${d.lastRun.summary ? `：${d.lastRun.summary.slice(0, 200)}` : d.lastRun.error ? `：${d.lastRun.error.message}` : ""}` : ""}`)
        .join("\n"),
    }
  }

  if (工具名 === "dawn_schedule_delete") {
    if (!装配.定时) throw new Error("本次运行没有装配定时任务")
    const id = 参数["id"]
    if (typeof id !== "string") throw new Error("要给 id")
    await 装配.定时.删(id)
    return { 文本: `删了 ${id}。运行记录留着。` }
  }

  throw new Error(`DAWN 没有这个工具：${工具名}`)
}
