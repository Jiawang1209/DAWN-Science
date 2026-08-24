/**
 * Office 工具的**移植面**（2026-08-25，学自 dsh-office，解读见
 * `ccb_hive_code_learn/dsh-office-解读.md`）。
 *
 * 上游是 cordis 的 `defineTool`；我们只保留它的三样：名字 + 说明 + 参数 DSL + execute。
 * 参数 DSL 原样保留（`{ type, required?, description, items?, properties? }` 的属性表），
 * 由 `index.ts` 的 `转JSONSchema` 翻成标准 JSON Schema 交给 pi——**不逐个改写成 typebox**，
 * 改写 14 份 schema 才是真正的漂移源。
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

/** 上游参数 DSL 的一格 */
export interface 参数格 {
  type?: string
  required?: boolean
  description?: string
  items?: 参数格
  properties?: Record<string, 参数格>
  additionalProperties?: boolean | 参数格
  enum?: readonly (string | number)[]
}

/** 上游靠 schemastery 推参数类型；移植后入参在运行时由 JSON Schema 把关，这里如实放开 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type 工具入参 = any

export interface Office工具定义 {
  name: string
  description: string
  parameters: Record<string, 参数格>
  execute: (args: 工具入参) => Promise<{ content: string }>
}
