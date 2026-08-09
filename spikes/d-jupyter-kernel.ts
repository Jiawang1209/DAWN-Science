/**
 * Spike D —— Jupyter 内核链路
 *
 * **这是语言决策的唯一风险点。** 规格 10.1 把主体定为 TypeScript，依据是
 * 「nteract 栈已提供 jupyter_client 的等价能力」。本 spike 不通过则回退 Python。
 *
 * 三个必须回答的问题（实施计划 Task 0.5 Step 5）：
 *   Q1 能否起内核并拿到 iopub 输出？
 *   Q2 **能否中断正在执行的 cell？**（规格 10.4 硬要求，wisp-science 的自研方案就败在这条）
 *   Q3 zeromq 原生模块是否可用？
 *
 * ⚠️ rxjs 版本分裂（实测）：@nteract/messaging 与 @nteract/types 各自嵌套 rxjs 6.6.7，
 * 而顶层是 7.8.2。两者的 Observable 类型结构不兼容——把 rxjs 7 的 take/timeout/
 * firstValueFrom 用在 nteract 返回的 Observable 上会直接 typecheck 失败。
 * 故本文件**只使用 nteract 自带的算子**（childOf / ofMessageType），
 * 等待与超时全部手写。见 FINDINGS.md 对 ②-A 的架构建议。
 *
 * 跑法：npm run spike:d        换内核：DAWN_KERNEL=ark npm run spike:d
 */
import { launch } from "spawnteract"
import { createMainChannel } from "enchannel-zmq-backend"
import { childOf, executeRequest, kernelInfoRequest, ofMessageType } from "@nteract/messaging"

const KERNEL = process.env.DAWN_KERNEL ?? "dawn-spike"
const IS_R = /^(ark|ir)$/i.test(KERNEL)

// 死循环代码按内核语言切换——「一套协议通吃」验证的就是除这行外全部同构
const LOOP_CODE = IS_R ? "while (TRUE) Sys.sleep(0.1)" : "import time\nwhile True:\n    time.sleep(0.1)"
const PRINT_CODE = IS_R ? 'cat("DAWN_MARKER_OK\\n")' : 'print("DAWN_MARKER_OK")'
/** 中断之后再算一道题。**内核串行执行**——它能跑完，本身就证明死循环停了 */
const ALIVE_CODE = IS_R ? 'cat("DAWN_ALIVE:", 40 + 2, "\\n")' : 'print("DAWN_ALIVE:", 40 + 2)'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Msg { header: { msg_type: string; msg_id: string }; content: Record<string, unknown> }

/** 订阅直到 predicate 命中或超时。不用 rxjs 算子，避免 6/7 混用。 */
function waitFor(obs: { subscribe: (f: (m: Msg) => void) => { unsubscribe: () => void } },
                 predicate: (m: Msg) => boolean, ms: number): Promise<Msg | null> {
  return new Promise((resolve) => {
    let settled = false
    const sub = obs.subscribe((m) => {
      if (!settled && predicate(m)) { settled = true; clearTimeout(t); sub.unsubscribe(); resolve(m) }
    })
    const t = setTimeout(() => {
      if (!settled) { settled = true; sub.unsubscribe(); resolve(null) }
    }, ms)
  })
}

/** 持续收集消息，返回一个可随时读取的数组与停止函数。 */
function collect(obs: { subscribe: (f: (m: Msg) => void) => { unsubscribe: () => void } }) {
  const out: string[] = []
  const sub = obs.subscribe((m) => out.push(`${m.header.msg_type}: ${JSON.stringify(m.content).slice(0, 200)}`))
  return { out, stop: () => sub.unsubscribe() }
}

async function main() {
  const R = { q1: false, q2: false, q3: false, interruptMode: "", zmqVersion: "", lang: "" }

  // ── Q3：zeromq 可用性（拿不到就没有后续） ───────────────────────────
  const zmq = (await import("zeromq")) as unknown as { version: string }
  R.zmqVersion = zmq.version
  R.q3 = Boolean(R.zmqVersion)
  console.log(`[0] zeromq ${R.zmqVersion}`)

  console.log(`[1] 启动内核 ${KERNEL}`)
  const kernel = await launch(KERNEL)
  R.interruptMode = kernel.kernelSpec.interrupt_mode ?? "signal"
  console.log(`    pid=${kernel.spawn.pid}  interrupt_mode=${R.interruptMode}`)
  console.log(`    shell=${kernel.config.ip}:${kernel.config.shell_port}  transport=${kernel.config.transport}`)

  console.log("[2] 建立通道")
  const channels = await createMainChannel(kernel.config)
  const ch = channels as unknown as {
    next: (m: unknown) => void
    pipe: (...ops: unknown[]) => { subscribe: (f: (m: Msg) => void) => { unsubscribe: () => void } }
  }

  // 握手：内核未就绪前发出的消息会被丢弃，必须先等 kernel_info_reply
  console.log("[3] 握手 kernel_info_request")
  const info = kernelInfoRequest()
  const infoWait = waitFor(ch.pipe(childOf(info), ofMessageType("kernel_info_reply")), () => true, 25_000)
  ch.next(info)
  const reply = await infoWait
  if (!reply) { console.error("    ❌ 内核未在 25s 内响应 kernel_info_request"); process.exit(1) }
  const li = reply.content.language_info as { name?: string; version?: string } | undefined
  R.lang = `${li?.name ?? "?"} ${li?.version ?? ""}`.trim()
  console.log(`    内核就绪：${R.lang}`)

  // ── Q1：执行并从 iopub 取回输出 ─────────────────────────────────────
  console.log("[4] 执行 print，等待 iopub stream")
  const msg = executeRequest(PRINT_CODE)
  const c1 = collect(ch.pipe(childOf(msg), ofMessageType("stream", "execute_result", "error", "status")))
  ch.next(msg)
  await sleep(5000)
  c1.stop()

  console.log("    收到的消息:")
  for (const s of c1.out) console.log("      " + s)
  R.q1 = c1.out.some((s) => s.includes("DAWN_MARKER_OK"))
  console.log(`    ${R.q1 ? "✅" : "❌"} 拿到输出: ${R.q1}`)

  // ── Q2：中断死循环 ──────────────────────────────────────────────────
  console.log("[5] 执行死循环，2 秒后中断")
  const loopMsg = executeRequest(LOOP_CODE)

  /**
   * **判据是「打断之后内核还能算对一道题」，不是 reply 长成某个形状。**
   *
   * 2026-08-10 修正。上一版写的是 `status === "error" && ename ~ KeyboardInterrupt`
   * ——**那是 Python 的形状**。R 的 IRkernel 回的是 `status = "abort"`、没有 ename，
   * 于是这份脚本把一个**工作正常**的 R 内核判成了失败，
   * 而 FINDINGS 里据此记了一条「R 未通过」。两个都是 Jupyter 协议里合法的回复。
   *
   * 与语言无关的判据只有一个：**内核串行执行**，所以中断后再发一条能跑完，
   * 就同时证明了两件事——死循环真的停了，且内核没被打死。
   *
   * 只看「有没有 execute_reply」仍然不够（正常结束也有 reply），
   * 所以 reply 的 status 保留为诊断信息打印出来，但不作为判据。
   */
  const replyWait = waitFor(ch.pipe(childOf(loopMsg), ofMessageType("execute_reply")), () => true, 25_000)
  const c2 = collect(ch.pipe(childOf(loopMsg), ofMessageType("error", "status")))

  ch.next(loopMsg)
  await sleep(2000)

  if (R.interruptMode === "signal") {
    console.log("    发送 SIGINT 到内核进程")
    kernel.spawn.kill("SIGINT")
  } else {
    console.log("    发送 interrupt_request（control 通道）")
    ch.next({
      header: { ...loopMsg.header, msg_id: `${loopMsg.header.msg_id}-int`, msg_type: "interrupt_request" },
      parent_header: {}, metadata: {}, content: {}, channel: "control",
    })
  }

  const replyMsg = await replyWait
  c2.stop()

  for (const s of c2.out) console.log("      " + s)
  const status = replyMsg?.content?.status
  const ename = replyMsg?.content?.ename
  console.log(`    execute_reply: status=${status ?? "（无·超时）"} ename=${ename ?? "（无）"}`)
  // **真正的判据**：再算一道题，能算对就说明死循环停了、内核还活着
  const aliveMsg = executeRequest(ALIVE_CODE)
  const aliveOut = collect(ch.pipe(childOf(aliveMsg), ofMessageType("stream")))
  const aliveReply = waitFor(ch.pipe(childOf(aliveMsg), ofMessageType("execute_reply")), () => true, 20_000)
  ch.next(aliveMsg)
  const aliveMsgReply = await aliveReply
  aliveOut.stop()
  const alive = aliveOut.out.join("") + JSON.stringify(aliveMsgReply?.content ?? {})
  const stillWorks = /DAWN_ALIVE:\s*42/.test(alive) && aliveMsgReply?.content?.status === "ok"
  console.log(`    中断后再执行: ${stillWorks ? "算对了，内核活着" : "没答对 → " + alive.slice(0, 120)}`)
  R.q2 = stillWorks
  console.log(`    ${R.q2 ? "✅" : "❌"} 中断生效（且内核仍可用）: ${R.q2}`)

  // ── 收尾 ────────────────────────────────────────────────────────────
  try { kernel.spawn.kill() } catch { /* 已退出 */ }

  const L = "═".repeat(70)
  console.log(`\n${L}\n判定\n${L}`)
  console.log(`内核                    : ${KERNEL} · ${R.lang}（interrupt_mode=${R.interruptMode}）`)
  console.log(`Q3 zeromq 可用          : ${R.q3 ? `是（v${R.zmqVersion}）` : "否"}`)
  console.log(`Q1 起内核并拿到 iopub   : ${R.q1 ? "是" : "否"}`)
  console.log(`Q2 能中断执行中的 cell  : ${R.q2 ? "是" : "否"}`)
  console.log(`\n三项全「是」→ Spike D 通过：${R.q1 && R.q2 && R.q3 ? "✅ TypeScript 方案确认" : "❌"}`)
  process.exit(R.q1 && R.q2 && R.q3 ? 0 : 1)
}

main().catch((e) => { console.error("Spike D 异常：", e); process.exit(1) })
