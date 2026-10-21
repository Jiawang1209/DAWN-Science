import { afterEach, beforeEach, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { TransferBatches } from "../../src/remote/transfer-batches.js"
import { RemoteExecutor } from "../../src/remote/ssh.js"
import { 造一台假服务器, 重置假机器, 假口令 } from "../../src/remote/fake-ssh.js"
let dir: string; let r: RemoteExecutor; let service: TransferBatches
beforeEach(async () => { 重置假机器(); dir = mkdtempSync(join(tmpdir(), "dawn-batches-")); r = new RemoteExecutor({ config: { host: "h", username: "u", password: 假口令 }, createClient: 造一台假服务器 }); await r.connect(); service = make() })
afterEach(async () => { await service.dispose(); r.close(); rmSync(dir, { recursive: true, force: true }) })
function make() { return new TransferBatches({ connection: () => ({ label: "测试服务器", key: "h:22:u", remote: r }), persistDir: join(dir, "jobs") }) }
function source() { const p = join(dir, "样本集"); mkdirSync(join(p, "空目录"), { recursive: true }); mkdirSync(join(p, "nested")); writeFileSync(join(p, "nested", "中文.txt"), "数据\n"); writeFileSync(join(p, "zero"), ""); return p }
it("选中文件直接上传到目标目录且保留源，同名选项不静默覆盖", async () => {
 const a=join(dir,"a");const b=join(dir,"b");mkdirSync(a);mkdirSync(b)
 writeFileSync(join(a,"same.txt"),"first");writeFileSync(join(b,"same.txt"),"second")
 const batch=service.startFiles({connectionId:"c",sources:[join(a,"same.txt"),join(b,"same.txt")],targetParent:"/home/dawn"})
 const d=await done(batch.id);expect(d.batch.target).toBe("/home/dawn");expect(d.batch.counts.completedFiles).toBe(1)
 expect(d.entries.filter(e=>e.state==="conflict")).toHaveLength(1)
 expect((await r.readFile("/home/dawn/same.txt")).toString()).toBe("first")
 expect(readFileSync(join(a,"same.txt"),"utf8")).toBe("first")
 const entry=d.entries.find(e=>e.state==="conflict")!;service.resolveConflict(batch.id,entry.id,"keepBoth")
 expect((await done(batch.id)).batch.counts.completedFiles).toBe(2)
})
it("异常筛选先过滤再分页，失败项可重试且不重复成功文件", async()=>{
 const p=source();const original=r.upload.bind(r);let fail=true
 r.upload=async(a,b,o)=>{if(fail&&b.endsWith("zero"))throw new Error("injected");return original(a,b,o)}
 const batch=service.startFiles({connectionId:"c",sources:[join(p,"nested","中文.txt"),join(p,"zero")],targetParent:"/home/dawn"})
 await done(batch.id);const errors=service.get(batch.id,0,1,"attention");expect(errors.entryCount).toBe(1);expect(errors.entries[0]?.path).toBe("zero")
 fail=false;service.retry(batch.id);await done(batch.id);expect(service.get(batch.id,0,1,"attention").entryCount).toBe(0)
})
it("选中文件可上传到服务器根目录，仍保留本机来源", async()=>{
 const file=join(dir,"root-upload.txt");writeFileSync(file,"root payload")
 const batch=service.startFiles({connectionId:"c",sources:[file],targetParent:"/"})
 const detail=await done(batch.id);expect(detail.batch.state).toBe("completed")
 expect((await r.readFile("/root-upload.txt")).toString()).toBe("root payload")
 expect(readFileSync(file,"utf8")).toBe("root payload")
})
async function done(id: string) { await expect.poll(() => service.get(id).batch.state).not.toMatch(/^(scanning|running)$/); return service.get(id) }
it("选中远端文件直接下载到本机目录，内容与字节进度完整", async()=>{
 const b=service.startFiles({connectionId:"c",direction:"download",sources:["/home/dawn/数据/大文件.bin"],targetParent:join(dir,"downloads")})
 const d=await done(b.id);expect(d.batch.direction).toBe("download");expect(d.batch.state).toBe("completed")
 expect(d.batch.counts.files).toBe(1);expect(d.batch.counts.completedFiles).toBe(1)
 expect(d.entries[0]?.path).toBe("大文件.bin");expect(d.entries[0]?.transferred).toBe(4096)
 expect(readFileSync(d.entries[0]!.target!,"utf8")).toBe("x".repeat(4096))
 expect(d.entries[0]!.target).toBe(join(d.batch.target,"大文件.bin"))
})
it("选中远端空文件完成后计为一个成功文件",async()=>{
 await r.writeFile("/home/dawn/空 文件.txt","")
 const b=service.startFiles({connectionId:"c",direction:"download",sources:["/home/dawn/空 文件.txt"],targetParent:join(dir,"downloads")})
 const d=await done(b.id);expect(d.batch.state).toBe("completed");expect(d.batch.total).toBe(0)
 expect(d.batch.counts.completedFiles).toBe(1);expect(readFileSync(d.entries[0]!.target!)).toHaveLength(0)
})
it("单文件下载失败在原批次重试，且重启后仍能恢复",async()=>{
 const download=r.download.bind(r);let failing=true;let calls=0
 r.download=async(a,b,o)=>{calls++;if(failing)throw new Error("Permission denied");return download(a,b,o)}
 const b=service.startFiles({connectionId:"c",direction:"download",sources:["/home/dawn/读我.md"],targetParent:join(dir,"downloads")})
 const failed=await done(b.id);expect(failed.batch.state).toBe("failed");expect(failed.entries[0]?.error).toBe("Permission denied")
 await service.dispose();service=make();failing=false;service.retry(b.id)
 const d=await done(b.id);expect(d.batch.id).toBe(b.id);expect(d.batch.state).toBe("completed");expect(calls).toBe(2)
 expect(readFileSync(d.entries[0]!.target!,"utf8")).toContain("这是一台假服务器")
})
it("单文件下载同名先等待选择，另存保留旧文件",async()=>{
 const target=join(dir,"downloads");mkdirSync(target);writeFileSync(join(target,"读我.md"),"existing")
 const b=service.startFiles({connectionId:"c",direction:"download",sources:["/home/dawn/读我.md"],targetParent:target})
 const first=await done(b.id);expect(first.entries[0]?.state).toBe("conflict");expect(readFileSync(join(target,"读我.md"),"utf8")).toBe("existing")
 service.resolveConflict(b.id,first.entries[0]!.id,"keepBoth")
 const d=await done(b.id);expect(d.batch.state).toBe("completed");expect(d.entries[0]!.target).not.toBe(join(target,"读我.md"))
 expect(readFileSync(d.entries[0]!.target!,"utf8")).toContain("这是一台假服务器");expect(readFileSync(join(target,"读我.md"),"utf8")).toBe("existing")
})
it("单文件下载拒绝目录来源，不开始创建目标",async()=>{
 const b=service.startFiles({connectionId:"c",direction:"download",sources:["/home/dawn/数据"],targetParent:join(dir,"downloads")})
 const d=await done(b.id);expect(d.batch.state).toBe("failed");expect(d.batch.error).toContain("普通文件");expect(existsSync(join(dir,"downloads"))).toBe(false)
})
it("目录往返保留层级、空目录和字节", async () => {
 const up = service.start({ direction: "upload", connectionId: "c", source: source(), targetParent: "/home/dawn" });
 expect((await done(up.id)).batch.state).toBe("completed")
 expect((await r.lstat("/home/dawn/样本集/空目录")).kind).toBe("directory")
 const down = service.start({ direction: "download", connectionId: "c", source: "/home/dawn/样本集", targetParent: join(dir, "downloads") });
 const result = await done(down.id); expect(result.batch.state).toBe("completed")
 expect(readFileSync(join(result.batch.target, "nested", "中文.txt"), "utf8")).toBe("数据\n"); expect(existsSync(join(result.batch.target, "空目录"))).toBe(true)
})
it("跳过符号链接并明确报告", async () => { const p = source(); symlinkSync("/etc/passwd", join(p, "link")); const b = service.start({ direction: "upload", connectionId: "c", source: p, targetParent: "/home/dawn" }); const d = await done(b.id); expect(d.entries.find(e => e.path === "link")?.state).toBe("skipped"); expect(d.batch.counts.skipped).toBe(1) })
it("根目录撞名另存且不覆盖旧树", async () => { const p = source(); const a = service.start({ direction: "upload", connectionId: "c", source: p, targetParent: "/home/dawn" }); await done(a.id); const b = service.start({ direction: "upload", connectionId: "c", source: p, targetParent: "/home/dawn" }); expect((await done(b.id)).batch.target).toBe("/home/dawn/样本集 (1)") })
it("权限失败保留失败清单", async () => { const b = service.start({ direction: "upload", connectionId: "c", source: source(), targetParent: "/home/dawn/只读" }); const d = await done(b.id); expect(["failed", "partial"]).toContain(d.batch.state); expect(d.batch.error ?? d.entries.find(e => e.state === "failed")?.error).toMatch(/Permission/) })
it("扫描时取消不开始写入", async () => { const b = service.start({ direction: "upload", connectionId: "c", source: source(), targetParent: "/home/dawn" }); service.cancel(b.id); expect((await done(b.id)).batch.state).toBe("cancelled"); await expect(r.stat("/home/dawn/样本集")).rejects.toThrow() })
it("重启后运行任务标为 interrupted，结果不丢", async () => { const b = service.start({ direction: "upload", connectionId: "c", source: source(), targetParent: "/home/dawn" }); const restored = make(); expect(restored.get(b.id).batch.state).toBe("interrupted"); restored.dispose(); service.cancel(b.id); await done(b.id) })
it("失败项手动重试且不重复传成功项", async () => { const original = r.upload.bind(r); let fail = true; const sent: string[] = []; r.upload = async (a,b,o) => { if (b.endsWith("zero") && fail) throw new Error("injected"); sent.push(b); return original(a,b,o) }; const b = service.start({ direction: "upload", connectionId: "c", source: source(), targetParent: "/home/dawn" }); expect((await done(b.id)).batch.state).toBe("partial"); fail = false; service.retry(b.id); expect((await done(b.id)).batch.state).toBe("completed"); expect(sent.filter(p => p.endsWith("中文.txt"))).toHaveLength(1) })
it("分页明细不丢状态", async () => { const b = service.start({ direction: "upload", connectionId: "c", source: source(), targetParent: "/home/dawn" }); await done(b.id); expect(service.get(b.id, 0, 1).entries).toHaveLength(1); expect(service.get(b.id, 1, 1).entries[0]?.id).not.toBe(service.get(b.id, 0, 1).entries[0]?.id) })
it("跨批次文件并发最多三条", async () => {
 const p = source(); for (let i=0;i<8;i++) writeFileSync(join(p,`small-${i}`),"data")
 const original = r.upload.bind(r); let active = 0; let maximum = 0
 r.upload = async (a,b,o) => { active++; maximum = Math.max(maximum,active); try { await new Promise(resolve=>setTimeout(resolve,15)); await original(a,b,o) } finally {active--} }
 const a=service.start({direction:"upload",connectionId:"c",source:p,targetParent:"/home/dawn"}); const b=service.start({direction:"upload",connectionId:"c",source:p,targetParent:"/home/dawn"})
 await done(a.id); await done(b.id); expect(maximum).toBeGreaterThan(1); expect(maximum).toBeLessThanOrEqual(3)
})
it("源文件改变时失败重试不上传新的未知版本", async()=>{
 const p=source(); const original=r.upload.bind(r); let fail=true
 r.upload=async(a,b,o)=>{if(fail && b.endsWith("zero"))throw new Error("network"); await original(a,b,o)}
 const b=service.start({direction:"upload",connectionId:"c",source:p,targetParent:"/home/dawn"}); await done(b.id)
 writeFileSync(join(p,"zero"),"changed"); fail=false; service.retry(b.id); const d=await done(b.id); expect(d.entries.find(e=>e.path==="zero")?.error).toContain("源文件已改变")
})
it("重试遇到同名文件须逐项处理，不静默覆盖", async()=>{
 const p=source(); const original=r.upload.bind(r); let fail=true
 r.upload=async(a,b,o)=>{if(fail && b.endsWith("zero"))throw new Error("network");await original(a,b,o)}
 const b=service.start({direction:"upload",connectionId:"c",source:p,targetParent:"/home/dawn"}); const first=await done(b.id); await r.writeFile(`${first.batch.target}/zero`,"existing")
 fail=false;service.retry(b.id); const d=await done(b.id);const conflict=d.entries.find(e=>e.path==="zero")!;expect(conflict.state).toBe("conflict")
 service.resolveConflict(b.id,conflict.id,"keepBoth");expect((await done(b.id)).entries.find(e=>e.id===conflict.id)?.target).toContain("zero (1)");expect((await r.readFile(`${first.batch.target}/zero`)).toString()).toBe("existing")
})
