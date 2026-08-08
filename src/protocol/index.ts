/**
 * Workbench Protocol —— UI 与核心之间的唯一契约。
 *
 * **`src/ui/**` 只准从这里 import**，不准 import `runtime/` / `session/` / `store/`。
 * 该约束由 Task 2.13 的测试强制执行——原则不写成测试就会被绕过，尤其在赶工时。
 *
 * 依据 Rho：*"The UI must depend on a versioned Rho Workbench Protocol,
 * not directly on Tauri commands, Ark, Jupyter messages, or aisdk internals"*
 */
export { WORKBENCH_PROTOCOL_VERSION, isCompatible } from "./version.js"

export {
  CostSchema,
  FileChangeFactsSchema,
  ProjectSummarySchema,
  ProvenanceLinkSchema,
  RunOriginSchema,
  RunStatusSchema,
  RunSummarySchema,
  SessionSummarySchema,
  WorkbenchCapabilitiesSchema,
} from "./entities.js"

export type {
  Cost,
  FileChangeFacts,
  ProjectSummary,
  ProvenanceLink,
  RunOrigin,
  RunStatus,
  RunSummary,
  SessionSummary,
  WorkbenchCapabilities,
} from "./entities.js"

export { SessionSnapshotSchema, SessionUpdateSchema, TranscriptItemSchema } from "./events.js"
export type { SessionSnapshot, SessionUpdate, TranscriptItem } from "./events.js"

export {
  DEFAULT_PAGE_SIZE,
  ErrorCodeSchema,
  MAX_PAGE_SIZE,
  OPERATIONS,
  PageInfoSchema,
  WorkbenchErrorSchema,
  WorkbenchSuccessSchema,
  isMutating,
  operationNames,
} from "./operations.js"

export type {
  ErrorCode,
  OperationDef,
  OperationName,
  PageInfo,
  WorkbenchError,
} from "./operations.js"
