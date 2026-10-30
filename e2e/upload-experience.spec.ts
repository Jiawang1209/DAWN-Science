import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test, expect, 进坞 } from "./fixtures.js"
const input=mkdtempSync(join(tmpdir(),"dawn-upload-ui-"))
const textPayload="科研数据\n"
const binaryPayload=Buffer.from([0,1,128,255])
const paths=[join(input,"生态样本.txt"),join(input,"二进制.bin"),join(input,"progress.bin")]
test.use({dawnOptions:{fakeSsh:true,pickFiles:paths}})
test.beforeAll(()=>{writeFileSync(paths[0]!,textPayload);writeFileSync(paths[1]!,binaryPayload);writeFileSync(paths[2]!,Buffer.alloc(16*1024*1024,3))})
test.afterAll(()=>rmSync(input,{recursive:true,force:true}))
async function call(page:import("@playwright/test").Page,op:string,request:unknown={}) {return page.evaluate(async({op,request})=>{const r=await (window as any).dawn.invoke(op,request);if(!r.ok)throw new Error(JSON.stringify(r));return r.data},{op,request})}
async function setTransferExpanded(page:import("@playwright/test").Page,expanded:boolean) {
 const button=page.getByRole("button",{name:"传输任务",exact:true})
 if(await button.getAttribute("aria-expanded")!==String(expanded))await button.click()
 await expect(button).toHaveAttribute("aria-expanded",String(expanded))
}
async function expectTransferFooter(page:import("@playwright/test").Page,mode:"normal"|"wide"|"reading"|"closed"="normal") {
 if(mode!=="reading")await expect.poll(async()=>page.locator(".file-tree").evaluate(el=>{
  const css=getComputedStyle(el),row=el.querySelector(".tree-row")
  const contentHeight=el.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom)
  return contentHeight >= (row?.getBoundingClientRect().height ?? 24)-1
 }),{message:"目录视口至少容纳一整行文件，不能只剩边框和内边距"}).toBe(true)
 const layout=await page.locator(".files-view").evaluate(el=>{
  const rect=(selector:string)=>{const r=el.querySelector(selector)?.getBoundingClientRect();return r ? {top:r.top,bottom:r.bottom,height:r.height,left:r.left,right:r.right} : undefined}
  return {panel:{bottom:el.getBoundingClientRect().bottom,height:el.clientHeight},tree:rect(".file-tree-box"),preview:rect(".file-preview"),footer:rect(".files-transfers")}
 })
 if(mode==="wide")expect(layout.tree!.right).toBeLessThanOrEqual(layout.preview!.left+1)
 if(mode==="normal")expect(layout.tree!.bottom).toBeLessThanOrEqual(layout.preview!.top+1)
 if(mode==="closed")expect(layout.tree!.bottom).toBeLessThanOrEqual(layout.footer!.top+1)
 else {
  expect(layout.preview!.bottom).toBeLessThanOrEqual(layout.footer!.top+1)
  expect(layout.preview!.height).toBeGreaterThan(60)
 }
 expect(Math.abs(layout.footer!.bottom-layout.panel.bottom)).toBeLessThanOrEqual(1)
 expect(layout.footer!.height).toBeLessThanOrEqual(layout.panel.height/2+1)
 const bars=await page.locator('.transfer-batches[aria-label] .transfer-scroll').evaluateAll(nodes=>nodes.map(el=>{
  const bar=el.querySelector('.transfer-job > .transfer-progress')?.getBoundingClientRect(),viewport=el.getBoundingClientRect()
  return bar ? {height:bar.height,visible:Math.max(0,Math.min(bar.bottom,viewport.bottom)-Math.max(bar.top,viewport.top)),scrollTop:el.scrollTop} : undefined
 }))
 const summaryHeight=await page.getByRole('progressbar',{name:'总体传输进度',exact:true}).evaluate(el=>el.getBoundingClientRect().height)
 for(const bar of bars)if(bar&&bar.scrollTop===0){
  expect(bar.height,'总进度与任务进度同粗细').toBeCloseTo(summaryHeight,1)
  expect(bar.visible,'展开后首条任务进度线完整可见').toBeCloseTo(bar.height,1)
 }
}
async function expectAlignedColumns(job:import("@playwright/test").Locator) {
 const columns=await job.locator(".transfer-entry-line").evaluateAll(rows=>rows.map(row=>
  [".transfer-entry-name", ".transfer-file-meter progress", ".transfer-file-meter span", ".transfer-entry-bytes", ".transfer-state"].map(selector=>{
   const rect=row.querySelector(selector)!.getBoundingClientRect()
   return {x:rect.x,right:rect.right,width:rect.width}
  })))
 for(let column=0;column<columns[0]!.length;column++) {
  const visible=columns.map(row=>row[column]!).filter(cell=>cell.width>0)
  if(!visible.length)continue
  expect(Math.max(...visible.map(cell=>cell.x))-Math.min(...visible.map(cell=>cell.x)),`column ${column} left edges`).toBeLessThanOrEqual(1)
  expect(Math.max(...visible.map(cell=>cell.right))-Math.min(...visible.map(cell=>cell.right)),`column ${column} right edges`).toBeLessThanOrEqual(1)
 }
}
test("多文件确认可取消，统一任务保留每个文件与源文件，窄窗亮暗可读",async({dawn},info)=>{
 const {page}=dawn
 const head=page.getByRole("button",{name:/^服务器/});if(await head.getAttribute("aria-expanded")!=="true")await head.click()
 await page.getByRole("button",{name:/添加服务器/}).click();await page.locator("#conn-host").fill("fake.example");await page.locator("#conn-user").fill("dawn");await page.locator("#conn-label").fill("上传体验演示");await page.locator("#conn-secret").fill("dawn");await page.getByRole("button",{name:"保存并连接",exact:true}).click()
 await expect(page.getByRole("dialog",{name:"添加服务器",exact:true})).toHaveCount(0)
 await page.locator(".remote-row").first().getByRole("button",{name:"新建远端任务",exact:true}).click();await 进坞(page,"文件")
 const choose=async()=>{await page.locator(".files-view").getByRole("button",{name:"上传",exact:true}).click();await page.getByRole("menuitem",{name:"上传文件",exact:true}).click()}
 await choose();const dialog=page.getByRole("dialog",{name:"上传到服务器",exact:true});await expect(dialog).toContainText("已选择 3 个文件");await expect(dialog).toContainText("/home/dawn");await expect(dialog).toContainText("上传是复制")
 await page.screenshot({path:info.outputPath("upload-confirmation-light.png")})
 await dialog.getByRole("button",{name:"取消",exact:true}).click();expect(await call(page,"listTransferBatches")).toHaveLength(0)
 expect(await page.locator(".files-transfers").evaluate(el=>el.getBoundingClientRect().height)).toBe(0)
 await dawn.app.evaluate(()=>{process.env.DAWN_FAKE_SSH_TRANSFER_DELAY_MS="20"})
 await choose();await dialog.getByRole("button",{name:"开始上传",exact:true}).click()
 const totalProgress=page.getByRole("progressbar",{name:"总体传输进度",exact:true})
 await expect.poll(async()=>Number(await totalProgress.getAttribute("aria-valuenow"))).toBeGreaterThan(0)
 expect(Number(await totalProgress.getAttribute("aria-valuenow"))).toBeLessThan(100)
 await page.screenshot({path:info.outputPath("upload-in-progress.png")})
 await 进坞(page,"笔记本");await expect.poll(async()=>(await call(page,"listTransferBatches"))[0]?.state).toBe("completed");await 进坞(page,"文件")
 await page.locator(".file-tree").getByRole("button",{name:/^生态样本.txt/}).click();await expect(page.locator(".file-preview")).toContainText("科研数据")
 await expectTransferFooter(page)
 await page.getByRole("button",{name:"传输任务",exact:true}).click();const job=page.locator(".transfer-job").first();await job.getByRole("button").first().click();await expect(job.locator(".transfer-entry-line")).toHaveCount(3)
 await expectTransferFooter(page)
 expect(await page.locator(".transfer-scroll").evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
 await expect(job.getByRole("progressbar",{name:"文件进度：生态样本.txt",exact:true})).toHaveAttribute("value","100")
 const batch=(await call(page,"listTransferBatches"))[0];expect(batch.target).toBe("/home/dawn");expect(batch.counts.completedFiles).toBe(3)
 const content=await call(page,"readFile",{connectionId:batch.connectionId,path:"/home/dawn/生态样本.txt"});expect(content.text).toBe(textPayload)
 const downloaded=await call(page,"startDownload",{connectionId:batch.connectionId,path:"/home/dawn/二进制.bin"});await expect.poll(async()=>(await call(page,"transferStatus",{transferId:downloaded.transferId})).state).toBe("done");expect(readFileSync(downloaded.target)).toEqual(binaryPayload);expect(readFileSync(paths[0]!,"utf8")).toBe(textPayload)
 const heights=await job.locator(".transfer-entry-line").evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));expect(heights.every(n=>n<=36)).toBe(true)
 await expectAlignedColumns(job)
 await job.getByRole("button",{name:"仅异常",exact:true}).click();await expect(job).toContainText("没有需要处理的文件");await job.getByRole("button",{name:"完整列表",exact:true}).click()
 await page.screenshot({path:info.outputPath("upload-tasks-light.png")})
 const fullBounds=await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.getBounds())
 await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setSize(1100,720))
 await page.locator(".files-view").evaluate(async()=>{await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())))})
 await expectTransferFooter(page)
 await dawn.app.evaluate(({BrowserWindow},bounds)=>BrowserWindow.getAllWindows()[0]!.setBounds(bounds),fullBounds)
 await page.locator(".files-view").getByRole("button",{name:"加宽",exact:true}).click();await expect(page.locator(".files-view")).toHaveClass(/files-wide/)
 await expectTransferFooter(page,"wide")
 await page.locator(".file-preview").getByRole("button",{name:"展开阅读",exact:true}).click();await expect(page.locator(".file-tree-box")).toBeHidden();await expectTransferFooter(page,"reading")
 await page.locator(".file-preview").getByRole("button",{name:"收起预览",exact:true}).click();await expect(page.locator(".file-preview")).toHaveCount(0);await expectTransferFooter(page,"closed")
 await page.locator(".file-tree").getByRole("button",{name:/^生态样本.txt/}).click();await expect(page.locator(".file-preview")).toContainText("科研数据");await expectTransferFooter(page,"wide")
 await page.locator(".files-view").getByRole("button",{name:"收窄",exact:true}).click();await expect(page.locator(".files-view")).not.toHaveClass(/files-wide/);await expectTransferFooter(page)
 await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setSize(900,720));await page.evaluate(()=>{document.documentElement.classList.remove("dawn-light");document.documentElement.classList.add("dawn-dark")});await setTransferExpanded(page,false)
 await expect.poll(async()=>page.locator(".transfer-batches").evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true)
 expect(await page.locator(".transfer-batches").evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(90)
 await expectTransferFooter(page)
 await page.screenshot({path:info.outputPath("upload-summary-narrow.png")})
 await setTransferExpanded(page,true)
 await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))))
 if(await job.getByRole("button").first().getAttribute("aria-expanded")!=="true")await job.getByRole("button").first().click()
 await expect(job.locator(".transfer-entry-line")).toHaveCount(3)
 await expectAlignedColumns(job)
 expect(await job.locator(".transfer-entry-line").evaluateAll(rows=>rows.every(row=>row.scrollWidth<=row.clientWidth+1))).toBe(true)
 await page.getByRole("button",{name:"传输任务",exact:true}).click()
 await page.getByRole("button",{name:"收起侧边栏",exact:true}).click();
 await page.locator(".body").evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())))})
 await page.getByRole("button",{name:"传输任务",exact:true}).click();await expect(job.locator(".transfer-entry-line")).toHaveCount(3)
 await expectAlignedColumns(job)
 await expectTransferFooter(page)
 await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setSize(1000,620))
 await expect.poll(async()=>page.locator(".files-view").evaluate(el=>{
  const footer=el.querySelector(".files-transfers")!.getBoundingClientRect(),preview=el.querySelector(".file-preview")!.getBoundingClientRect()
  return Math.abs(footer.bottom-el.getBoundingClientRect().bottom)<=1&&footer.height<=el.clientHeight/2+1&&preview.height>60
 })).toBe(true)
 await expectTransferFooter(page)
 await page.screenshot({path:info.outputPath("upload-tasks-dark-narrow.png")});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 const rootUpload=await call(page,"startFileUploadBatch",{connectionId:batch.connectionId,sources:[paths[0]],targetParent:"/"})
 await expect.poll(async()=>(await call(page,"getTransferBatch",{batchId:rootUpload.id})).batch.state).toBe("completed")
 expect((await call(page,"readFile",{connectionId:batch.connectionId,path:"/生态样本.txt"})).text).toBe(textPayload)
 expect(readFileSync(paths[0]!,"utf8")).toBe(textPayload)
})
