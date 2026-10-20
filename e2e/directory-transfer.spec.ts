import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { join, basename } from "node:path"
import { tmpdir } from "node:os"
import { test, expect, 进坞 } from "./fixtures.js"
const input = mkdtempSync(join(tmpdir(),"dawn-directory-fixture-"))
const name = basename(input)
test.use({ dawnOptions: { fakeSsh: true, pickDirectory: input } })
test.beforeAll(() => { mkdirSync(join(input,"nested")); mkdirSync(join(input,"empty")); writeFileSync(join(input,"nested","说明.txt"),"科研数据\n"); writeFileSync(join(input,"zero"),""); writeFileSync(join(input,"binary.bin"),Buffer.from([0,1,128,255])) })
test.afterAll(() => rmSync(input,{recursive:true,force:true}))
async function remote(page: import("@playwright/test").Page) {
 const head=page.getByRole("button",{name:/^服务器/}); if(await head.getAttribute("aria-expanded")!=="true")await head.click()
 await page.getByRole("button",{name:/添加服务器/}).click(); await page.locator("#conn-host").fill("fake.example");await page.locator("#conn-user").fill("dawn");await page.locator("#conn-label").fill("目录传输验收");await page.locator("#conn-secret").fill("dawn");await page.getByRole("button",{name:"保存并连接",exact:true}).click()
 await expect(page.getByRole("dialog",{name:"添加服务器",exact:true})).toHaveCount(0)
 await page.locator(".remote-row").first().getByRole("button",{name:"新建远端任务",exact:true}).click();await expect(page.locator(".conv-remote")).toBeVisible();await 进坞(page,"文件")
}
async function call(page: import("@playwright/test").Page, op:string, request:unknown={}) {return page.evaluate(async({op,request})=>{const r=await (window as any).dawn.invoke(op,request);if(!r.ok)throw new Error(JSON.stringify(r));return r.data},{op,request})}
test("文件夹通过真实界面往返，保留空目录和二进制，批次跨面板可见",async({dawn},testInfo)=>{
 const {page}=dawn;await remote(page)
 const files=page.locator(".right-dock .files-view")
 await files.getByRole("button",{name:"传到这里",exact:true}).click();await page.getByRole("menuitem",{name:"上传文件夹",exact:true}).click();await page.getByRole("button",{name:"开始传输",exact:true}).click()
 await page.getByRole("button",{name:"传输任务",exact:true}).click();
 const upload=page.locator(".transfer-job").first();await expect(upload.locator(".transfer-state").first()).toHaveText("已完成")
 await upload.getByRole("button",{name:`查看传输：${name}`,exact:true}).click();await expect(upload).toContainText("nested/说明.txt");await expect(upload).toContainText("empty")
 await 进坞(page,"笔记本");await 进坞(page,"文件");await page.getByRole("button",{name:"传输任务",exact:true}).click();await expect(page.locator(".transfer-job").first()).toContainText("已完成")
 await files.getByRole("button",{name:`目录操作：${name}`,exact:true}).click();await page.getByRole("menuitem",{name:"下载文件夹",exact:true}).click();await page.getByRole("button",{name:"开始传输",exact:true}).click()
 const download=page.locator('.transfer-job[data-direction="download"]').first();await expect(download.locator(".transfer-state").first()).toHaveText("已完成")
 const jobs=await call(page,"listTransferBatches");const target=jobs[0].target
 expect(readFileSync(join(target,"nested","说明.txt"),"utf8")).toBe("科研数据\n");expect(existsSync(join(target,"empty"))).toBe(true);expect(readFileSync(join(target,"binary.bin"))).toEqual(Buffer.from([0,1,128,255]));expect(readFileSync(join(target,"zero"))).toHaveLength(0)
 await download.getByRole("button",{name:`查看传输：${name}`,exact:true}).click(); await expect(download.locator(".transfer-entry")).toHaveCount(5)
 await page.getByRole("button",{name:"传输任务",exact:true}).click();
 await expect(page.locator(".transfer-job")).toHaveCount(0);
 const summaryHeight=await page.locator(".transfer-batches").evaluate(el=>el.getBoundingClientRect().height);expect(summaryHeight).toBeLessThan(90);
 await page.screenshot({path:testInfo.outputPath("directory-transfer-compact.png")});
 await page.getByRole("button",{name:"传输任务",exact:true}).click();
 await expect(page.locator(".transfer-entry")).toHaveCount(5);
 await page.screenshot({path:testInfo.outputPath("directory-transfer-light.png")})
 await page.evaluate(()=>{localStorage.setItem("dawn.global.theme","dark");document.documentElement.classList.remove("dawn-light");document.documentElement.classList.add("dawn-dark")})
 await page.screenshot({path:testInfo.outputPath("directory-transfer-dark.png")})
 await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setSize(900,720))
 await page.screenshot({path:testInfo.outputPath("directory-transfer-narrow.png")})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test("权限失败清单与手动重试可见，取消保留已完成文件",async({dawn})=>{
 const {page,app}=dawn;await remote(page);const files=page.locator(".files-view")
 await files.getByLabel("跳到路径",{exact:true}).fill("/home/dawn/只读");await files.getByLabel("跳到路径",{exact:true}).press("Enter")
 await files.getByRole("button",{name:"传到这里",exact:true}).click();await page.getByRole("menuitem",{name:"上传文件夹",exact:true}).click();await page.getByRole("button",{name:"开始传输",exact:true}).click()
 await page.getByRole("button",{name:"传输任务",exact:true}).click();
 const failed=page.locator(".transfer-job").first();await expect(failed.locator(".transfer-state").first()).toHaveText("失败");await expect(failed).toContainText("Permission denied")
 await failed.getByRole("button",{name:"再传未完成项",exact:true}).click();await expect(failed).toContainText("Permission denied")
 await files.getByLabel("跳到路径",{exact:true}).fill("/home/dawn");await files.getByLabel("跳到路径",{exact:true}).press("Enter")
 writeFileSync(join(input,"slow.bin"),Buffer.alloc(4*1024*1024,3))
 await app.evaluate(()=>{process.env.DAWN_FAKE_SSH_TRANSFER_DELAY_MS="40"})
 await files.getByRole("button",{name:"传到这里",exact:true}).click();await page.getByRole("menuitem",{name:"上传文件夹",exact:true}).click();await page.getByRole("button",{name:"开始传输",exact:true}).click()
 const current=page.locator(".transfer-job").first();await current.getByRole("button",{name:"结束本批",exact:true}).click();await expect(current.locator(".transfer-state").first()).toHaveText("已取消")
 await current.getByRole("button",{name:`查看传输：${name}`,exact:true}).click();await expect(current).toContainText("已取消")
 const d=await call(page,"getTransferBatch",{batchId:await current.getAttribute("data-batch-id")});expect(d.entries.some((e:any)=>e.state==="cancelled")).toBe(true)
 expect(d.entries.filter((e:any)=>e.kind==="file"&&e.state==="completed").every((e:any)=>e.transferred===e.size)).toBe(true)
})
