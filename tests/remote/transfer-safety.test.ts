import { afterEach, beforeEach, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { RemoteExecutor } from "../../src/remote/ssh.js"
import { 造一台假服务器, 重置假机器, 假口令, 假家目录 } from "../../src/remote/fake-ssh.js"
let dir: string
beforeEach(() => { 重置假机器(); dir = mkdtempSync(join(tmpdir(), "dawn-safe-")) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))
function remote(mutate: (s: any) => void) {
  return new RemoteExecutor({ config: { host: "h", username: "u", password: 假口令 }, metadataTimeoutMs: 40, idleTimeoutMs: 40,
    createClient: () => { const c = 造一台假服务器(); const original = c.sftp.bind(c); c.sftp = cb => original((e, s) => { if (s) mutate(s); cb(e, s) }); return c } })
}
it("覆盖提交失败时保留旧文件", async () => {
  const r = remote(s => { s.ext_openssh_rename = (_a: string, _b: string, cb: Function) => cb(new Error("commit rejected")); s.rename = s.ext_openssh_rename })
  await r.connect(); const from = join(dir, "new"); writeFileSync(from, "new")
  const path = `${假家目录}/数据/样本.csv`; const old = await r.readFile(path)
  try { await expect(r.upload(from, path, { 覆盖: true })).rejects.toThrow(); expect(await r.readFile(path)).toEqual(old) } finally { r.close() }
})
it("短读不能提交为完整下载", async () => {
  const r = remote(s => { s.createReadStream = () => Readable.from([Buffer.from("short")]) }); await r.connect()
  const path = join(dir, "result")
  try { await expect(r.download(`${假家目录}/数据/大文件.bin`, path)).rejects.toThrow(/大小|字节/); expect(existsSync(path)).toBe(false) } finally { r.close() }
})
it("无进展的流超时失败并清理", async () => {
  const r = remote(s => { s.createReadStream = () => new Readable({ read() {} }) }); await r.connect()
  try { await expect(r.download(`${假家目录}/数据/大文件.bin`, join(dir, "stuck"))).rejects.toThrow(/进展|超时/) } finally { r.close() }
}, 1000)
it("元数据不回应时有界失败", async () => {
  const r = remote(s => { s.stat = () => {} }); await r.connect()
  try { await expect(r.stat("/stuck")).rejects.toThrow(/超时/) } finally { r.close() }
}, 1000)
it("下载期间目标刚出现时保留新文件", async () => {
  const target = join(dir,"raced")
  const r = remote(s => { const original = s.createReadStream.bind(s); s.createReadStream = (p: string) => { writeFileSync(target,"user-created"); return original(p) } }); await r.connect()
  try { await expect(r.download(`${假家目录}/数据/大文件.bin`, target, { noReplace: true })).rejects.toThrow(); expect(readFileSync(target,"utf8")).toBe("user-created") } finally {r.close()}
})
