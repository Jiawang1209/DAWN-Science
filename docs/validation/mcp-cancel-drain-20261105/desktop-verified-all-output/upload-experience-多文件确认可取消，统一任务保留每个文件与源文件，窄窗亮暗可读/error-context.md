# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: upload-experience.spec.ts >> 多文件确认可取消，统一任务保留每个文件与源文件，窄窗亮暗可读
- Location: e2e/upload-experience.spec.ts:60:1

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.files-view').getByRole('button', { name: '加宽', exact: true })

```

# Test source

```ts
  1   | import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs"
  2   | import { tmpdir } from "node:os"
  3   | import { join } from "node:path"
  4   | import { test, expect, 进坞 } from "./fixtures.js"
  5   | const input=mkdtempSync(join(tmpdir(),"dawn-upload-ui-"))
  6   | const textPayload="科研数据\n"
  7   | const binaryPayload=Buffer.from([0,1,128,255])
  8   | const paths=[join(input,"生态样本.txt"),join(input,"二进制.bin"),join(input,"progress.bin")]
  9   | test.use({dawnOptions:{fakeSsh:true,pickFiles:paths}})
  10  | test.beforeAll(()=>{writeFileSync(paths[0]!,textPayload);writeFileSync(paths[1]!,binaryPayload);writeFileSync(paths[2]!,Buffer.alloc(16*1024*1024,3))})
  11  | test.afterAll(()=>rmSync(input,{recursive:true,force:true}))
  12  | async function call(page:import("@playwright/test").Page,op:string,request:unknown={}) {return page.evaluate(async({op,request})=>{const r=await (window as any).dawn.invoke(op,request);if(!r.ok)throw new Error(JSON.stringify(r));return r.data},{op,request})}
  13  | async function setTransferExpanded(page:import("@playwright/test").Page,expanded:boolean) {
  14  |  const button=page.getByRole("button",{name:"传输任务",exact:true})
  15  |  if(await button.getAttribute("aria-expanded")!==String(expanded))await button.click()
  16  |  await expect(button).toHaveAttribute("aria-expanded",String(expanded))
  17  | }
  18  | async function expectTransferFooter(page:import("@playwright/test").Page,mode:"normal"|"wide"|"reading"|"closed"="normal") {
  19  |  if(mode!=="reading")await expect.poll(async()=>page.locator(".file-tree").evaluate(el=>{
  20  |   const css=getComputedStyle(el),row=el.querySelector(".tree-row")
  21  |   const contentHeight=el.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom)
  22  |   return contentHeight >= (row?.getBoundingClientRect().height ?? 24)-1
  23  |  }),{message:"目录视口至少容纳一整行文件，不能只剩边框和内边距"}).toBe(true)
  24  |  const layout=await page.locator(".files-view").evaluate(el=>{
  25  |   const rect=(selector:string)=>{const r=el.querySelector(selector)?.getBoundingClientRect();return r ? {top:r.top,bottom:r.bottom,height:r.height,left:r.left,right:r.right} : undefined}
  26  |   return {panel:{bottom:el.getBoundingClientRect().bottom,height:el.clientHeight},tree:rect(".file-tree-box"),preview:rect(".file-preview"),footer:rect(".files-transfers")}
  27  |  })
  28  |  if(mode==="wide")expect(layout.tree!.right).toBeLessThanOrEqual(layout.preview!.left+1)
  29  |  if(mode==="normal")expect(layout.tree!.bottom).toBeLessThanOrEqual(layout.preview!.top+1)
  30  |  if(mode==="closed")expect(layout.tree!.bottom).toBeLessThanOrEqual(layout.footer!.top+1)
  31  |  else {
  32  |   expect(layout.preview!.bottom).toBeLessThanOrEqual(layout.footer!.top+1)
  33  |   expect(layout.preview!.height).toBeGreaterThan(60)
  34  |  }
  35  |  expect(Math.abs(layout.footer!.bottom-layout.panel.bottom)).toBeLessThanOrEqual(1)
  36  |  expect(layout.footer!.height).toBeLessThanOrEqual(layout.panel.height/2+1)
  37  |  const bars=await page.locator('.transfer-batches[aria-label] .transfer-scroll').evaluateAll(nodes=>nodes.map(el=>{
  38  |   const bar=el.querySelector('.transfer-job > .transfer-progress')?.getBoundingClientRect(),viewport=el.getBoundingClientRect()
  39  |   return bar ? {height:bar.height,visible:Math.max(0,Math.min(bar.bottom,viewport.bottom)-Math.max(bar.top,viewport.top)),scrollTop:el.scrollTop} : undefined
  40  |  }))
  41  |  const summaryHeight=await page.getByRole('progressbar',{name:'总体传输进度',exact:true}).evaluate(el=>el.getBoundingClientRect().height)
  42  |  for(const bar of bars)if(bar&&bar.scrollTop===0){
  43  |   expect(bar.height,'总进度与任务进度同粗细').toBeCloseTo(summaryHeight,1)
  44  |   expect(bar.visible,'展开后首条任务进度线完整可见').toBeCloseTo(bar.height,1)
  45  |  }
  46  | }
  47  | async function expectAlignedColumns(job:import("@playwright/test").Locator) {
  48  |  const columns=await job.locator(".transfer-entry-line").evaluateAll(rows=>rows.map(row=>
  49  |   [".transfer-entry-name", ".transfer-file-meter progress", ".transfer-file-meter span", ".transfer-entry-bytes", ".transfer-state"].map(selector=>{
  50  |    const rect=row.querySelector(selector)!.getBoundingClientRect()
  51  |    return {x:rect.x,right:rect.right,width:rect.width}
  52  |   })))
  53  |  for(let column=0;column<columns[0]!.length;column++) {
  54  |   const visible=columns.map(row=>row[column]!).filter(cell=>cell.width>0)
  55  |   if(!visible.length)continue
  56  |   expect(Math.max(...visible.map(cell=>cell.x))-Math.min(...visible.map(cell=>cell.x)),`column ${column} left edges`).toBeLessThanOrEqual(1)
  57  |   expect(Math.max(...visible.map(cell=>cell.right))-Math.min(...visible.map(cell=>cell.right)),`column ${column} right edges`).toBeLessThanOrEqual(1)
  58  |  }
  59  | }
  60  | test("多文件确认可取消，统一任务保留每个文件与源文件，窄窗亮暗可读",async({dawn},info)=>{
  61  |  const {page}=dawn
  62  |  const head=page.getByRole("button",{name:/^服务器/});if(await head.getAttribute("aria-expanded")!=="true")await head.click()
  63  |  await page.getByRole("button",{name:/添加服务器/}).click();await page.locator("#conn-host").fill("fake.example");await page.locator("#conn-user").fill("dawn");await page.locator("#conn-label").fill("上传体验演示");await page.locator("#conn-secret").fill("dawn");await page.getByRole("button",{name:"保存并连接",exact:true}).click()
  64  |  await expect(page.getByRole("dialog",{name:"添加服务器",exact:true})).toHaveCount(0)
  65  |  await page.locator(".remote-row").first().getByRole("button",{name:"新建远端任务",exact:true}).click();await 进坞(page,"文件")
  66  |  const choose=async()=>{await page.locator(".files-view").getByRole("button",{name:"上传",exact:true}).click();await page.getByRole("menuitem",{name:"上传文件",exact:true}).click()}
  67  |  await choose();const dialog=page.getByRole("dialog",{name:"上传到服务器",exact:true});await expect(dialog).toContainText("已选择 3 个文件");await expect(dialog).toContainText("/home/dawn");await expect(dialog).toContainText("上传是复制")
  68  |  await page.screenshot({path:info.outputPath("upload-confirmation-light.png")})
  69  |  await dialog.getByRole("button",{name:"取消",exact:true}).click();expect(await call(page,"listTransferBatches")).toHaveLength(0)
  70  |  expect(await page.locator(".files-transfers").evaluate(el=>el.getBoundingClientRect().height)).toBe(0)
  71  |  await dawn.app.evaluate(()=>{process.env.DAWN_FAKE_SSH_TRANSFER_DELAY_MS="20"})
  72  |  await choose();await dialog.getByRole("button",{name:"开始上传",exact:true}).click()
  73  |  const totalProgress=page.getByRole("progressbar",{name:"总体传输进度",exact:true})
  74  |  await expect.poll(async()=>Number(await totalProgress.getAttribute("aria-valuenow"))).toBeGreaterThan(0)
  75  |  expect(Number(await totalProgress.getAttribute("aria-valuenow"))).toBeLessThan(100)
  76  |  await page.screenshot({path:info.outputPath("upload-in-progress.png")})
  77  |  await 进坞(page,"笔记本");await expect.poll(async()=>(await call(page,"listTransferBatches"))[0]?.state).toBe("completed");await 进坞(page,"文件")
  78  |  await page.locator(".file-tree").getByRole("button",{name:/^生态样本.txt/}).click();await expect(page.locator(".file-preview")).toContainText("科研数据")
  79  |  await expectTransferFooter(page)
  80  |  await page.getByRole("button",{name:"传输任务",exact:true}).click();const job=page.locator(".transfer-job").first();await job.getByRole("button").first().click();await expect(job.locator(".transfer-entry-line")).toHaveCount(3)
  81  |  await expectTransferFooter(page)
  82  |  expect(await page.locator(".transfer-scroll").evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
  83  |  await expect(job.getByRole("progressbar",{name:"文件进度：生态样本.txt",exact:true})).toHaveAttribute("value","100")
  84  |  const batch=(await call(page,"listTransferBatches"))[0];expect(batch.target).toBe("/home/dawn");expect(batch.counts.completedFiles).toBe(3)
  85  |  const content=await call(page,"readFile",{connectionId:batch.connectionId,path:"/home/dawn/生态样本.txt"});expect(content.text).toBe(textPayload)
  86  |  const downloaded=await call(page,"startDownload",{connectionId:batch.connectionId,path:"/home/dawn/二进制.bin"});await expect.poll(async()=>(await call(page,"transferStatus",{transferId:downloaded.transferId})).state).toBe("done");expect(readFileSync(downloaded.target)).toEqual(binaryPayload);expect(readFileSync(paths[0]!,"utf8")).toBe(textPayload)
  87  |  const heights=await job.locator(".transfer-entry-line").evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));expect(heights.every(n=>n<=36)).toBe(true)
  88  |  await expectAlignedColumns(job)
  89  |  await job.getByRole("button",{name:"仅异常",exact:true}).click();await expect(job).toContainText("没有需要处理的文件");await job.getByRole("button",{name:"完整列表",exact:true}).click()
  90  |  await page.screenshot({path:info.outputPath("upload-tasks-light.png")})
  91  |  const fullBounds=await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.getBounds())
  92  |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setSize(1100,720))
  93  |  await page.locator(".files-view").evaluate(async()=>{await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())))})
  94  |  await expectTransferFooter(page)
  95  |  await dawn.app.evaluate(({BrowserWindow},bounds)=>BrowserWindow.getAllWindows()[0]!.setBounds(bounds),fullBounds)
> 96  |  await page.locator(".files-view").getByRole("button",{name:"加宽",exact:true}).click();await expect(page.locator(".files-view")).toHaveClass(/files-wide/)
      |                                                                               ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  97  |  await expectTransferFooter(page,"wide")
  98  |  await page.locator(".file-preview").getByRole("button",{name:"展开阅读",exact:true}).click();await expect(page.locator(".file-tree-box")).toBeHidden();await expectTransferFooter(page,"reading")
  99  |  await page.locator(".file-preview").getByRole("button",{name:"收起预览",exact:true}).click();await expect(page.locator(".file-preview")).toHaveCount(0);await expectTransferFooter(page,"closed")
  100 |  await page.locator(".file-tree").getByRole("button",{name:/^生态样本.txt/}).click();await expect(page.locator(".file-preview")).toContainText("科研数据");await expectTransferFooter(page,"wide")
  101 |  await page.locator(".files-view").getByRole("button",{name:"收窄",exact:true}).click();await expect(page.locator(".files-view")).not.toHaveClass(/files-wide/);await expectTransferFooter(page)
  102 |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setSize(900,720));await page.evaluate(()=>{document.documentElement.classList.remove("dawn-light");document.documentElement.classList.add("dawn-dark")});await setTransferExpanded(page,false)
  103 |  await expect.poll(async()=>page.locator(".transfer-batches").evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true)
  104 |  expect(await page.locator(".transfer-batches").evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(90)
  105 |  await expectTransferFooter(page)
  106 |  await page.screenshot({path:info.outputPath("upload-summary-narrow.png")})
  107 |  await setTransferExpanded(page,true)
  108 |  await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))))
  109 |  if(await job.getByRole("button").first().getAttribute("aria-expanded")!=="true")await job.getByRole("button").first().click()
  110 |  await expect(job.locator(".transfer-entry-line")).toHaveCount(3)
  111 |  await expectAlignedColumns(job)
  112 |  expect(await job.locator(".transfer-entry-line").evaluateAll(rows=>rows.every(row=>row.scrollWidth<=row.clientWidth+1))).toBe(true)
  113 |  await page.getByRole("button",{name:"传输任务",exact:true}).click()
  114 |  await page.getByRole("button",{name:"收起侧边栏",exact:true}).click();
  115 |  await page.locator(".body").evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())))})
  116 |  await page.getByRole("button",{name:"传输任务",exact:true}).click();await expect(job.locator(".transfer-entry-line")).toHaveCount(3)
  117 |  await expectAlignedColumns(job)
  118 |  await expectTransferFooter(page)
  119 |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setSize(1000,620))
  120 |  await expect.poll(async()=>page.locator(".files-view").evaluate(el=>{
  121 |   const footer=el.querySelector(".files-transfers")!.getBoundingClientRect(),preview=el.querySelector(".file-preview")!.getBoundingClientRect()
  122 |   return Math.abs(footer.bottom-el.getBoundingClientRect().bottom)<=1&&footer.height<=el.clientHeight/2+1&&preview.height>60
  123 |  })).toBe(true)
  124 |  await expectTransferFooter(page)
  125 |  await page.screenshot({path:info.outputPath("upload-tasks-dark-narrow.png")});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  126 |  const rootUpload=await call(page,"startFileUploadBatch",{connectionId:batch.connectionId,sources:[paths[0]],targetParent:"/"})
  127 |  await expect.poll(async()=>(await call(page,"getTransferBatch",{batchId:rootUpload.id})).batch.state).toBe("completed")
  128 |  expect((await call(page,"readFile",{connectionId:batch.connectionId,path:"/生态样本.txt"})).text).toBe(textPayload)
  129 |  expect(readFileSync(paths[0]!,"utf8")).toBe(textPayload)
  130 | })
  131 | 
```