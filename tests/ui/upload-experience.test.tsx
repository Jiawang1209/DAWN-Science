import { expect, it, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { TransferConfirmationDetails } from "../../src/ui/transfer-confirmation.js"
import { ConfirmDialog } from "../../src/ui/confirm.js"
import { FileUploadMenu } from "../../src/ui/file-upload-menu.js"
import { TransferBatchesPanel } from "../../src/ui/transfer-batches.js"
import { $lang } from "../../src/ui/i18n/index.js"
$lang.set("zh")
it("上传确认按来源、服务器与目标目录展示，取消不上传，主按钮为普通动作",()=>{
 const start=vi.fn(),cancel=vi.fn()
 render(<ConfirmDialog request={{title:"上传到服务器",detail:<TransferConfirmationDetails sources={["/local/data.csv"]} server="科研服务器" target="/remote/input" />,confirmLabel:"开始上传",confirmVariant:"primary",onConfirm:start}} onCancel={cancel} />)
 expect(screen.getByText("data.csv")).toBeTruthy();expect(screen.getByText("科研服务器")).toBeTruthy();expect(screen.getByText("/remote/input")).toBeTruthy()
 expect(screen.getByText("上传是复制，本机文件会保留。" )).toBeTruthy()
 expect(screen.getByRole("button",{name:"开始上传"}).className).not.toContain("danger")
 fireEvent.click(screen.getByRole("button",{name:"取消"}));expect(cancel).toHaveBeenCalled();expect(start).not.toHaveBeenCalled()
})
it("上传入口可直接识别，菜单可选择文件夹",()=>{
 const folder=vi.fn();render(<FileUploadMenu onFile={()=>{}} onFolder={folder} />)
 fireEvent.click(screen.getByRole("button",{name:"上传"}));fireEvent.click(screen.getByRole("menuitem",{name:"上传文件夹"}));expect(folder).toHaveBeenCalled()
})
it("摘要按文件数显示进度，异常筛选请求后端全量过滤，每文件一行",async()=>{
 const batch={id:"b",server:"服务器",direction:"upload",source:"/data",state:"running",total:100,transferred:42,counts:{files:20,directories:9,completed:17,completedFiles:8,failed:1,conflict:0,skipped:0,cancelled:0}}
 const get=vi.fn(async(op:string)=>op==="listTransferBatches"?[batch]:{batch,entryCount:1,entries:[{id:"e",path:"bad.csv",kind:"file",state:"failed",size:10,transferred:0,error:"Permission denied"}]})
 const {container}=render(<TransferBatchesPanel client={{get:get as never}} onCompleted={()=>{}} />)
 await screen.findByText(/8\/20/);expect(screen.getByText(/42%/)).toBeTruthy()
 expect(screen.getByRole("progressbar",{name:"总体传输进度"}).getAttribute("aria-valuenow")).toBe("42")
 fireEvent.click(screen.getByRole("button",{name:"传输任务"}));fireEvent.click(await screen.findByRole("button",{name:"查看传输：data"}));fireEvent.click(await screen.findByRole("button",{name:"仅异常"}))
 await waitFor(()=>expect(get.mock.calls.some(c=>c[0]==="getTransferBatch" && (c as unknown[])[1] && ((c as unknown[])[1] as {filter:string}).filter==="attention")).toBe(true))
 expect(container.querySelector(".transfer-entry-line")).toBeTruthy()
 expect(screen.getByRole("progressbar",{name:"文件进度：bad.csv"}).getAttribute("value")).toBe("0")
})
