/**
 * 子侧任务的执行逻辑（①-B″ · S1）。
 *
 * **不认识进程、不认识 stdin/stdout**——那是 `child.ts` 的事。
 * 这一层只回答：给一个规格和一个 pi 会话，怎么得到一条 `done`。
 *
 * 拆开的理由是可测：真跑 pi 要有模型、凭证与网络，而这里要验的全是**边界行为**
 * （空输出、报错、异常），那些恰恰是真会话里最难稳定复现的。
 */
import type { SubagentDoneMessage, SubagentChildSpec } from "./protocol.js"

/** 本层需要 pi 会话的**全部**能力。窄到这个程度，假实现才写得出来 */
export interface ChildPiSession {
  /** 跑完一整轮才 resolve —— pi 的 `prompt()` 就是这个语义 */
  prompt(text: string): Promise<void>
  subscribe(cb: (e: unknown) => void): () => void
}

export type ChildSessionFactory = (spec: SubagentChildSpec) => Promise<ChildPiSession>

/** pi 事件里我们要看的那几个形状。**只翻译，不解释** */
interface PiEventShape {
  type?: string
  assistantMessageEvent?: { type?: string; delta?: string }
  errorMessage?: string
}

export async function runChildTask(
  spec: SubagentChildSpec,
  createSession: ChildSessionFactory,
): Promise<SubagentDoneMessage> {
  let session: ChildPiSession
  try {
    session = await createSession(spec)
  } catch (err) {
    // 建会话就失败（模型不存在、凭证不对）——**也是一条 done，不是崩溃**。
    // 崩溃的话父侧只能看到「退出码非 0」，丢掉了这句话
    return { type: "done", ok: false, error: `建立子 agent 会话失败：${message(err)}` }
  }

  let text = ""
  let streamError: string | undefined

  const unsubscribe = session.subscribe((raw) => {
    const e = raw as PiEventShape
    if (e.type === "message_update" && e.assistantMessageEvent?.type === "text_delta") {
      text += e.assistantMessageEvent.delta ?? ""
      return
    }
    // 事件流里的错误**不会让 `prompt()` 抛**，不看这里就会静静地丢掉
    if (e.errorMessage) streamError = e.errorMessage
  })

  try {
    await session.prompt(spec.task)
  } catch (err) {
    return done(false, withPartial(`子 agent 执行失败：${message(err)}`, text))
  } finally {
    // **失败路径上也要退订。** 子进程虽然马上就退，但挂着的订阅会挡住 exit
    unsubscribe()
  }

  if (streamError) return done(false, withPartial(`子 agent 报错：${streamError}`, text))

  /**
   * **空输出算失败。**
   *
   * 与执行器那边「退出码 0 但没给出 done」同源：chain 模式会把上一步的输出
   * 当 `{previous}` 传给下一步。把空串当成功传下去，下一步就会
   * **基于一段并不存在的结论**去做计划，而它看不出这段结论是空的。
   */
  if (!text.trim()) {
    return done(false, `子 agent "${spec.agent}" 跑完了，但没有产生任何输出`)
  }

  return { type: "done", ok: true, output: text }
}

/** 已经吐出来的半截要带上——排查时它常常是唯一的线索 */
function withPartial(reason: string, partial: string): string {
  const t = partial.trim()
  return t ? `${reason}（已产出的部分：${t}）` : reason
}

function done(ok: false, error: string): SubagentDoneMessage {
  return { type: "done", ok, error }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))
