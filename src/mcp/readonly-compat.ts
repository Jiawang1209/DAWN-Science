/** Known MLAI library reads for old servers without MCP readOnlyHint.
 * Supplies a missing hint; the existing MCP permission gate still applies.
 * Match handshake identity and bounded input contracts, not config aliases,
 * URLs, descriptions, or a server's trusted status.
 */
import type { Tool } from "@modelcontextprotocol/sdk/types.js"

const contracts: Record<string, readonly string[]> = {
  search_cases: ["query", "category", "language", "task", "stage", "algorithm", "library", "figure_type", "limit", "mode"],
  semantic_search: ["query", "limit"],
  search_figures: ["query", "figure_type", "task", "limit", "mode", "case_id"],
  search_chunks: ["query", "mode", "task", "stage", "algorithm", "library", "figure_type", "limit", "source_kind"],
  get_chunk: ["unit_id", "context"],
  recommend_pipeline: ["task", "goals", "n_samples", "target_type", "imbalanced", "notes", "language"],
  recommend_figures: ["goal_text", "figure_type", "task", "n"],
  get_case: ["case_id", "figure_limit"],
  list_taxonomy: ["dimension"],
  get_asset: ["case_id", "path", "rows"],
}
const anchors: Record<string, readonly string[]> = {
  get_asset: ["case_id", "path"], get_case: ["case_id"], get_chunk: ["unit_id"],
  list_taxonomy: ["dimension"], recommend_pipeline: ["task"], recommend_figures: ["goal_text"],
}

function stringSchema(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const schema = value as { type?: unknown; anyOf?: unknown[] }
  return schema.type === "string" || (Array.isArray(schema.anyOf) && schema.anyOf.some(stringSchema))
}

function matches(tool: Tool): boolean {
  const allowed = Object.hasOwn(contracts, tool.name) ? contracts[tool.name] : undefined
  const props = tool.inputSchema.properties
  return !!allowed && tool.inputSchema.type === "object" && !!props
    && Object.keys(props).every(key => allowed.includes(key))
    && (anchors[tool.name] ?? ["query"]).every(key => stringSchema(props[key]))
}

export function legacyMlaiReads(identity: { name: string } | undefined, tools: readonly Tool[]): Set<string> {
  const result = new Set<string>()
  if (identity?.name !== "MLAI-science") return result
  const names = new Set(tools.map(tool => tool.name))
  if (names.size !== tools.length) return result
  if (!["search_cases", "get_case", "list_taxonomy", "get_asset"].every(name => tools.some(tool => tool.name === name && matches(tool)))) return result
  for (const tool of tools) {
    if (tool.annotations?.readOnlyHint === undefined
      && tool.annotations?.destructiveHint !== true && tool.annotations?.openWorldHint !== true
      && matches(tool)) result.add(tool.name)
  }
  return result
}
