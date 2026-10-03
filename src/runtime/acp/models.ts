import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { AcpRuntime, type ACP命令 } from "./runtime.js"
import { UserFacingError } from "../../errors.js"
import type { 会话开关 } from "../types.js"

/** ACP 没有独立模型目录请求；通过隔离会话的握手获取，不发送 prompt、不创建 DAWN 任务。 */
export async function probeAcpModels(command: ACP命令, timeoutMs = 15_000) {
  const dir = await mkdtemp(join(tmpdir(), "dawn-acp-models-"))
  const sessionId = randomUUID()
  const runtime = new AcpRuntime({ commandOf: () => command })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      runtime.start({ sessionId, workspace: dir, sessionDir: dir }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new UserFacingError("读取 ACP 模型列表超时，请检查适配器是否已登录并重试")), timeoutMs)
      }),
    ])
    let model: 会话开关 | undefined
    const detach = runtime.attach(sessionId, (event) => {
      if (event.kind === "config_options") model = event.options.find((o) => o.category === "model")
    })
    detach()
    const found = model as 会话开关 | undefined
    return {
      configId: found?.id ?? "",
      ...(found?.current ? { current: found.current } : {}),
      models: (found?.options ?? []).map((m) => ({ id: m.value, name: m.name, ...(m.description ? { description: m.description } : {}) })),
    }
  } finally {
    clearTimeout(timer)
    try { await runtime.stop(sessionId) }
    finally { await rm(dir, { recursive: true, force: true }) }
  }
}
