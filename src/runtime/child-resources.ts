/** 将主运行时已有资源位置装配给子任务；不改变主会话/Bot 的资源加载。 */
import { join } from "node:path"
import { MemoryStore, gitBranch } from "../memory/store.js"
import { createResourceHost, type ResourceHost } from "../subagent/resources.js"
import type { NativeRuntimeOptions } from "./native.js"
import type { SessionSpec } from "./types.js"

export function childResourceFactory(opts: NativeRuntimeOptions, spec: SessionSpec): (() => ResourceHost) | undefined {
  if (!opts.skills && !opts.memoryDeps) return undefined
  return () => {
    const skills = opts.skills
    // 旧子进程在本机运行；不得把远端目录当成本机同名项目目录。
    const workspace = spec.remote ? undefined : spec.workspace
    const enable = opts.memoryEnable?.()
    const memory = enable && !enable.off && enable.read ? opts.memoryDeps?.() : undefined
    return createResourceHost({
      workspace,
      roots: [
        ...(workspace && skills?.项目目录名 ? [{path: join(workspace, skills.项目目录名), scope: "project" as const}] : []),
        ...(skills?.全局目录 ? [{path: skills.全局目录, scope: "global" as const}] : []),
        ...(skills?.自带目录 ? [{path: skills.自带目录, scope: "builtin" as const}] : []),
      ],
      builtinMode: skills?.自带档,
      ...(memory ? {memory: {store: new MemoryStore(memory.memoriesDir), enabled: true, branch: gitBranch(workspace)}} : {}),
      authorize: (tool, params) => {
        const decision = opts.gate?.(tool, params, {workspace: spec.workspace, sessionId: spec.sessionId})
        return decision && decision.kind !== "allow" ? `${decision.reason}${decision.kind === "ask" ? "（请在主会话配置允许的资源读取后重试）" : ""}` : undefined
      },
    })
  }
}
