import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const 注册模型列表 = readFileSync("scripts/mock-inference-server.mjs", "utf8")
  .match(/modelIds\s*=\s*\[([^\]]+)\]/)?.[1]
const 可用模型 = new Set([... (注册模型列表 ?? "").matchAll(/["']([^"']+)["']/g)].map(([, id]) => id))

describe.each(["scripts/dev-mock.mjs", "scripts/test-packaged.mjs"])("%s mock agent model", (path) => {
  it("uses a model advertised by the mock provider", () => {
    const script = readFileSync(path, "utf8")
    const model = script.match(/model:\s*(deepseek-[\w-]+)/)?.[1]

    expect(model, `${path} must declare its mock agent model`).toBeDefined()
    expect(可用模型.has(model!), `${path} model ${model} is not in mockModelsJson`).toBe(true)
  })
})
