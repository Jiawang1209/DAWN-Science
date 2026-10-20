import { expect, it, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { TransferBatchesPanel } from "../../src/ui/transfer-batches.js"
import { $lang } from "../../src/ui/i18n/index.js"
$lang.set("zh")
it("展示逐文件错误，冲突覆盖需要明确确认", async () => {
 const batch = {id:"b",server:"服务器甲",direction:"upload",source:"/data",target:"/remote/data",state:"partial",total:10,transferred:3,counts:{files:2,directories:0,completed:0,failed:1,conflict:1,skipped:0,cancelled:0}}
 const get = vi.fn(async (op: string) => op === "listTransferBatches" ? [batch] : op === "getTransferBatch" ? {batch,entryCount:2,entries:[{id:"e",path:"broken.csv",kind:"file",state:"failed",size:5,transferred:0,error:"Permission denied"},{id:"c",path:"existing.csv",kind:"file",state:"conflict",size:5,transferred:0}]} : {})
 render(<TransferBatchesPanel client={{get: get as never}} onCompleted={() => {}} />)
 await screen.findByRole("button",{name:"传输任务"}); expect(screen.queryByText("服务器甲")).toBeNull(); expect(screen.queryByText("/remote/data")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"传输任务"})); await screen.findByText(/服务器甲/); fireEvent.click(screen.getByRole("button",{name:"查看传输：data"}))
 await screen.findByText("broken.csv"); expect(screen.getByText("Permission denied")).toBeTruthy()
 fireEvent.click(screen.getByRole("button",{name:"覆盖"})); expect(get.mock.calls.some(c => c[0] === "resolveTransferConflict")).toBe(false)
 fireEvent.click(screen.getByRole("button",{name:"确认替换"})); await waitFor(() => expect(get.mock.calls.some(c => c[0] === "resolveTransferConflict")).toBe(true))
})
