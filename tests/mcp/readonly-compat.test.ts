import { describe, expect, it } from "vitest"
import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import { legacyMlaiReads } from "../../src/mcp/readonly-compat.js"

const tool = (name: string, keys: string[], annotations?: Tool["annotations"]): Tool => ({
  name, inputSchema: { type: "object", properties: Object.fromEntries(keys.map(key => [key, { type: "string" }])) },
  ...(annotations ? { annotations } : {}),
})
const core = () => [tool("search_cases", ["query"]), tool("get_case", ["case_id"]), tool("list_taxonomy", ["dimension"]), tool("get_asset", ["case_id", "path"])]
const reads = (tools: Tool[]) => legacyMlaiReads({ name: "MLAI-science" }, tools)

describe("旧 MLAI 的窄只读契约", () => {
  it("缺核心工具、身份错误及重复名称均不推断", () => {
    expect(reads(core().slice(1)).size).toBe(0)
    expect(legacyMlaiReads({ name: "other" }, core()).size).toBe(0)
    expect(legacyMlaiReads(undefined, core()).size).toBe(0)
    expect(reads([...core(), core()[0]!]).size).toBe(0)
  })
  it("显式非只读、破坏或开放操作不会被缺声明兼容覆盖", () => {
    for (const annotations of [{ readOnlyHint: false }, { destructiveHint: true }, { openWorldHint: true }]) {
      const tools = core(); tools[0] = { ...tools[0]!, annotations }
      expect(reads(tools).has("search_cases")).toBe(false)
    }
  })
  it("只识别已知参数契约，不信任新增执行参数、错误类型及原型属性名", () => {
    expect(reads([...core(), tool("search_chunks", ["query", "execute"])]).has("search_chunks")).toBe(false)
    const changed = tool("search_chunks", ["query"])
    changed.inputSchema.properties = { query: { type: "boolean" } }
    expect(reads([...core(), changed]).has("search_chunks")).toBe(false)
    expect(reads([...core(), tool("constructor", ["query"])]).has("constructor")).toBe(false)
  })
  it("允许 nullable 字符串参数及新段落读取，但不推断整个服务", () => {
    const tools = [...core(), tool("get_chunk", ["unit_id", "context"]), tool("run_code", ["code"])]
    tools[2]!.inputSchema.properties = { dimension: { anyOf: [{ type: "string" }, { type: "null" }] } }
    expect([...reads(tools)]).toEqual(["search_cases", "get_case", "list_taxonomy", "get_asset", "get_chunk"])
  })
})
