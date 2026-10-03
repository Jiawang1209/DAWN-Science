import { expect, it } from "vitest"
import { resolve } from "node:path"
import { probeAcpModels } from "../../src/runtime/acp/models.js"

it("通过 ACP 握手返回真实模型列表，不发推理请求", async () => {
  const result = await probeAcpModels({ command: "node", args: [resolve("scripts/fake-acp-agent.mjs")] })
  expect(result.configId).toBe("model")
  expect(result.models.map((m) => m.name)).toEqual(["Sonnet", "Opus"])
  expect(result.current).toBe("sonnet")
})

it("适配器启动失败不能伪造模型目录", async () => {
  await expect(probeAcpModels({ command: "dawn-nonexistent-acp-for-test", args: [] })).rejects.toThrow(/起不来 ACP/)
})

it("握手不响应时超时并清理适配器", async () => {
  await expect(probeAcpModels({ command: "node", args: ["-e", "process.stdin.resume()"] }, 100)).rejects.toThrow(/模型列表超时/)
})
