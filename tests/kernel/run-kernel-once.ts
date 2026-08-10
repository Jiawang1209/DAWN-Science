/**
 * 起一个真内核，用 `KernelChannel` 执行一句，打印结果，然后干净退出。
 *
 * **它是一个独立进程，为的就是让调用方能判退出码**——
 * 关停顺序写错的症状是「输出全对、进程 SIGABRT」，
 * 而 Spike D 记着一条诊断陷阱：**结论会先打印、崩溃在后**。
 *
 * 用法：`tsx run-kernel-once.ts <kernelName> <code>`
 */
import { launch } from "spawnteract"
import { createMainChannel } from "enchannel-zmq-backend"
import { executeRequest, kernelInfoRequest } from "@nteract/messaging"
import { createKernelChannel } from "../../src/kernel/channel.js"
import type { JupyterMessage } from "../../src/kernel/types.js"

const [kernelName, code] = process.argv.slice(2)
if (!kernelName || !code) {
  // **参数缺了要响亮失败**：少一个参数时静默跑一个空 code，看起来会像「内核没输出」
  console.error("用法：tsx run-kernel-once.ts <kernelName> <code>")
  process.exit(2)
}

const kernel = await launch(kernelName)
const raw = await createMainChannel(kernel.config)

const ch = createKernelChannel({
  channel: raw,
  process: kernel.spawn,
  kernelInstanceId: `k-${kernelName}-1`,
  /**
   * **这里是两套类型相遇的地方，所以断言写在这里，不写在别处。**
   * nteract 的 `JupyterMessage` 是带泛型的、且可选字段没有 `| undefined`；
   * 我们的开了 `exactOptionalPropertyTypes`。**适配器边界本来就该承担这一次转换**——
   * 让它渗进 `src/` 才是问题。
   */
  handshake: kernelInfoRequest() as unknown as JupyterMessage,
  runIdOf: () => "run-integration",
  makeExecute: (code, o) =>
    (o ? executeRequest(code, o as never) : executeRequest(code)) as unknown as JupyterMessage,
})

/**
 * 收 iopub 的 stream。**打标必须已经在消息上**，不是我们在这里补的。
 *
 * **等到真的收到，而不是睡一个固定时长。**
 * 第一版是「reply 到了之后睡 300ms」——Python 过、R 红：
 * iopub 与 shell 是两条独立通道，**stream 完全可以晚于 execute_reply 到达**，
 * 而慢多少取决于内核与当时的负载。固定睡眠把这件事变成了掷骰子。
 */
let text = ""
let stamped = ""
let 收到: (() => void) | undefined
const 等输出 = new Promise<void>((res) => (收到 = res))
ch.on("stream", (t) => {
  text += String(t.message.content.text ?? "")
  stamped = `kernelInstanceId=${t.provenance.kernelInstanceId} kernelRevision=${t.provenance.kernelRevision} runId=${t.provenance.runId}`
  if (text.includes("KCH_OK")) 收到?.()
})

await ch.ready()

/**
 * **收到过哪些消息类型。** 2026-08-10：这条集成测试红过一次
 * （30s 等不到 stream），而**直接跑、连跑、换 stdio、换顺序全部一次通过**，
 * 复现不出来。与其猜，不如让它下次红的时候自己说清楚：
 * 「一条都没收到」与「收到了 status/error 但没有 stream」是完全不同的病。
 */
const 见过 = new Map<string, number>()
ch.on("*", (t) => {
  const k = t.message.header.msg_type
  见过.set(k, (见过.get(k) ?? 0) + 1)
})

/** **失败必须出声**：只盯 stream 的话，一次执行错误看起来和「没输出」一模一样 */
ch.on("error", (t) => {
  console.log("ERROR:", JSON.stringify(t.message.content).slice(0, 300))
})
ch.on("execute_result", (t) => {
  console.log("RESULT:", JSON.stringify(t.message.content).slice(0, 300))
})

// 同上：nteract 的消息类型在这里转成我们的（适配器边界）
const req = executeRequest(code) as unknown as JupyterMessage
const reply = await ch.request(req, { timeoutMs: 60_000 })
console.log("REPLY_STATUS:", String(reply.message.content.status))
// **等输出真的到**，超时就响亮失败——「没等到」与「内核没输出」要分得清
await Promise.race([
  等输出,
  new Promise((_r, rej) =>
    setTimeout(() => {
      const 明细 = [...见过.entries()].map(([k, n]) => `${k}×${n}`).join(" ") || "（一条都没收到）"
      rej(new Error(`execute_reply 已到，但 30s 内没等到 iopub 的 stream。收到过：${明细}；已攒到的文本 ${JSON.stringify(text)}`))
    }, 30_000),
  ),
])

console.log(text.trim())
console.log(stamped)

await ch.close()
console.log("CLEAN_EXIT")
process.exit(0)
