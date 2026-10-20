import type { TransferBatch } from "../../src/remote/transfer-types.js"
import { afterEach, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { RemoteExecutor } from "../../src/remote/ssh.js"
import { 造一台假服务器, 假口令, 重置假机器 } from "../../src/remote/fake-ssh.js"
import { memoryCredentials } from "../helpers/credentials.js"
const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).forEach(f => f()) })
it("目录操作贯穿真实服务并保留上传记账", async () => {
 重置假机器(); const dir = mkdtempSync(join(tmpdir(), "dawn-dir-backend-")); const source = join(dir,"inputs"); mkdirSync(source); writeFileSync(join(source,"one.txt"),"one")
 const r = new RemoteExecutor({ config: { host: "h", username: "u", password: 假口令 }, createClient: 造一台假服务器 }); await r.connect()
 const logged: unknown[] = []; const dispose: (() => void)[] = []
 const backend = createWorkbenchBackend({ projects: {} as never, projectStore: {} as never, runs: {} as never, sessions: {} as never, registry: { agents: {} }, credentials: memoryCredentials(), events: { onAnyUpdate: () => () => {}, on回合收尾: () => () => {} } as never,
  transferDirectory: join(dir,"jobs"), downloadsDir: join(dir,"downloads"), 注册收摊: f => { dispose.push(f as () => void) }, 记一次上传: (...args) => logged.push(args),
  remote: { store: { get: () => ({ label: "服务器", host: "h", port:22, username:"u" }) } as never, manager: { executorOf: () => r } as never } })
 cleanups.push(() => { dispose.forEach(f => f()); r.close(); rmSync(dir,{recursive:true,force:true}) })
 const b = await backend.startDirectoryTransfer({ connectionId:"c",direction:"upload",source,targetParent:"/home/dawn" }) as TransferBatch
 await expect.poll(async () => (await backend.getTransferBatch({ batchId:b.id }) as { batch: TransferBatch }).batch.state).toBe("completed")
 expect(logged).toHaveLength(1); expect((await backend.listTransferBatches({}) as TransferBatch[])[0]?.id).toBe(b.id)
 const down = await backend.startDirectoryTransfer({connectionId:"c",direction:"download",source:"/home/dawn/inputs"}) as TransferBatch
 await expect.poll(async () => (await backend.getTransferBatch({batchId:down.id}) as { batch: TransferBatch }).batch.state).toBe("completed")
 expect((await backend.getTransferBatch({batchId:down.id}) as { batch: TransferBatch }).batch.target).toContain(join(dir,"downloads"))
})
