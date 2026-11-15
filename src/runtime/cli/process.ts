import type { ChildProcess } from "node:child_process"
import { killOwnedProcessTree } from "../process-tree.js"

/** CLI roots must be detached on POSIX: never signal the workbench's process group. */
export function trackCliProcess(child: ChildProcess): { stop(): Promise<void> } {
  let closed = false
  const done = new Promise<void>(resolve => child.once("close", () => { closed = true; resolve() }))
  let stopping: Promise<void> | undefined
  return {
    stop() {
      if (closed) return Promise.resolve()
      return stopping ??= (async () => {
        // Snapshot descendants while their parent still exists; inherited pipes belong to them too.
        if (child.exitCode === null && child.signalCode === null) killOwnedProcessTree(child)
        else if (process.platform !== "win32" && child.pid) {
          // A job can retain this detached group and its pipes after the leader exits.
          // Never address the exited leader's positive PID, which may be reused.
          try { process.kill(-child.pid, "SIGKILL") } catch { /* Group already drained. */ }
        }
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([done, new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`外部 CLI ${child.pid ?? ""} 退出未在限时内完成`)), 1000)
          })])
        } finally { clearTimeout(timer) }
      })()
    },
  }
}
