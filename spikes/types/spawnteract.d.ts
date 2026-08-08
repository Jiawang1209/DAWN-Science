/**
 * spawnteract 是 CommonJS 且不带 .d.ts，故自行声明。
 * 字段依据实际 index.js 与 Jupyter 连接文件规范；若实测与此不符，以实测为准并回来修正。
 */
declare module "spawnteract" {
  import type { ChildProcess } from "node:child_process"

  export interface JupyterConnectionInfo {
    version: number
    iopub_port: number
    shell_port: number
    stdin_port: number
    control_port: number
    hb_port: number
    ip: string
    key: string
    signature_scheme: "hmac-sha256"
    transport: "tcp" | "ipc"
  }

  export interface KernelSpec {
    name?: string
    argv: string[]
    display_name: string
    language?: string
    /** "signal" → 向内核进程发 SIGINT；"message" → 走 control 通道发 interrupt_request */
    interrupt_mode?: "signal" | "message"
    env?: Record<string, string>
  }

  export interface LaunchedKernel {
    spawn: ChildProcess
    connectionFile: string
    config: JupyterConnectionInfo
    kernelSpec: KernelSpec
  }

  export function launch(
    kernelName: string,
    spawnOptions?: Record<string, unknown>,
    specs?: unknown,
  ): Promise<LaunchedKernel>

  export function launchSpec(
    kernelSpec: KernelSpec,
    spawnOptions?: Record<string, unknown>,
  ): Promise<LaunchedKernel>
}
