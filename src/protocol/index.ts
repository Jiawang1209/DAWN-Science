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
export { 能上服务器 } from "./remote-capable.js"

export {
  ArtifactSchema,
  CostSchema,
  FileChangeFactsSchema,
  ProjectSummarySchema,
  ProvenanceLinkSchema,
  RemoteConnectionSchema,
  RemoteStateSchema,
  RunOriginSchema,
  TaskSummarySchema,
  RunStatusSchema,
  RunSummarySchema,
  SessionSummarySchema,
  WorkbenchCapabilitiesSchema,
} from "./entities.js"

export type {
  Artifact,
  Cost,
  FileChangeFacts,
  ProjectSummary,
  ProvenanceLink,
  RemoteConnection,
  RemoteState,
  RunOrigin,
  TaskSummary,
  RunStatus,
  RunSummary,
  SessionSummary,
  WorkbenchCapabilities,
} from "./entities.js"

export {
  RemoteUpdateSchema,
  SessionSnapshotSchema,
  SessionUpdateSchema,
  TranscriptItemSchema,
} from "./events.js"
export type { RemoteUpdate, SessionSnapshot, SessionUpdate, TranscriptItem, TeamSnapshot } from "./events.js"

export {
  DEFAULT_PAGE_SIZE,
  ErrorCodeSchema,
  MAX_PAGE_SIZE,
  OPERATIONS,
  PageInfoSchema,
  WorkbenchErrorSchema,
  WorkbenchSuccessSchema,
  isMutating,
  只读模式该拦,
  operationNames,
} from "./operations.js"

export type {
  ErrorCode,
  OperationDef,
  OperationName,
  PageInfo,
  ResponseOf,
  WorkbenchError,
} from "./operations.js"
