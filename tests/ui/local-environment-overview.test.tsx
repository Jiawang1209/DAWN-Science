import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react"
import { LocalEnvironmentOverview } from "../../src/ui/local-environment-overview.js"
import type { WorkbenchClient } from "../../src/ui/client.js"

const candidates = {
 r: [{path:"/usr/local/bin/R",source:"PATH" as const,version:"4.6",kernelPackage:"present" as const}],
 python: [{path:"/env/bin/python",source:"PATH" as const,version:"3.12",kernelPackage:"present" as const}],
}
function fixture(save = vi.fn(async (_language: string,_path: string) => true)) {
 const get=vi.fn(async (op:string,req:any)=>op==="getLocalTools"?{paths:{uv:"/saved/uv"}}:op==="probeLocalTools"?{paths:{uv:"/saved/uv"},tools:[{id:"uv",candidates:[{path:"/other/uv",source:"PATH",version:"uv 1"}]}]}:{paths:{uv:req.path}})
 const props={client:{get} as unknown as WorkbenchClient,interpreters:{},candidates,probing:false,onProbe:vi.fn(),onSetInterpreter:save}
 return {props,get,save}
}
afterEach(()=>{cleanup();Reflect.deleteProperty(window,"dawn")})
describe("compact local environment overview",()=>{
 it("keeps R/Python first, detects readonly and opens only the requested editor",async()=>{
  const {props,get,save}=fixture();render(<LocalEnvironmentOverview {...props}/>);
  await screen.findByText("/saved/uv")
  const rows=screen.getByRole("table",{name:"本地环境路径"}).querySelectorAll("tbody tr")
  expect(rows[0]?.textContent).toContain("R");expect(rows[1]?.textContent).toContain("Python");expect(rows.length).toBe(9)
  expect(screen.queryByRole("radiogroup",{name:"Python 解释器候选"})).toBeNull()
  expect(get.mock.calls.map(([op])=>op)).toEqual(["getLocalTools","probeLocalTools"]);expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button",{name:"更换 Python 路径"}))
  const picker=screen.getByRole("dialog",{name:"选择 Python 环境"})
  fireEvent.click(within(picker).getByRole("radio"))
  await waitFor(()=>expect(screen.queryByRole("dialog",{name:"选择 Python 环境"})).toBeNull())
  expect(save).toHaveBeenCalledWith("python","/env/bin/python")
 })
 it("keeps a failed tool draft open and refresh does not overwrite it",async()=>{
  const {props,get}=fixture();get.mockImplementation(async(op:string)=>{
   if(op==="setLocalTool")throw new Error("路径不可用")
   return op==="getLocalTools"?{paths:{uv:"/saved/uv"}}:{paths:{uv:"/saved/uv"},tools:[]}
  })
  render(<LocalEnvironmentOverview {...props}/>);await screen.findByText("/saved/uv")
  fireEvent.click(screen.getByRole("button",{name:"更换 uv 路径"}));fireEvent.click(screen.getByRole("button",{name:"粘贴路径…"}))
  fireEvent.change(screen.getByRole("textbox",{name:"可执行文件的完整路径"}),{target:{value:"/invalid/uv"}})
  fireEvent.click(screen.getByRole("button",{name:"用这个"}))
  expect((await screen.findByRole("alert")).textContent).toContain("路径不可用")
  fireEvent.click(screen.getByRole("button",{name:"重新检测"}))
  await waitFor(()=>expect(get.mock.calls.filter(([op])=>op==="probeLocalTools")).toHaveLength(2))
  expect((screen.getByRole("textbox",{name:"可执行文件的完整路径"}) as HTMLInputElement).value).toBe("/invalid/uv")
  fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"})
  expect(screen.queryByRole("dialog")).toBeNull();expect(document.activeElement).toBe(screen.getByRole("button",{name:"更换 uv 路径"}))
 })
 it("native browse cancellation keeps the value and a chosen file uses the same save operation",async()=>{
  const pickFiles=vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(["/chosen/uv"])
  Object.defineProperty(window,"dawn",{configurable:true,value:{pickFiles}})
  const {props,get}=fixture();render(<LocalEnvironmentOverview {...props}/>);await screen.findByText("/saved/uv")
  fireEvent.click(screen.getByRole("button",{name:"更换 uv 路径"}));fireEvent.click(screen.getByRole("button",{name:"浏览本机文件…"}))
  await waitFor(()=>expect(pickFiles).toHaveBeenCalledTimes(1));expect(get.mock.calls.some(([op])=>op==="setLocalTool")).toBe(false)
  fireEvent.click(screen.getByRole("button",{name:"浏览本机文件…"}))
  await waitFor(()=>expect(get).toHaveBeenCalledWith("setLocalTool",{tool:"uv",path:"/chosen/uv"}))
  await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull())
 })
 it("ignores a file chooser result after its editor has been dismissed",async()=>{
  let resolveFile!: (files:string[])=>void
  Object.defineProperty(window,"dawn",{configurable:true,value:{pickFiles:()=>new Promise<string[]>(resolve=>{resolveFile=resolve})}})
  const {props,get}=fixture();render(<LocalEnvironmentOverview {...props}/>);await screen.findByText("/saved/uv")
  fireEvent.click(screen.getByRole("button",{name:"更换 uv 路径"}));fireEvent.click(screen.getByRole("button",{name:"浏览本机文件…"}))
  fireEvent.click(screen.getByRole("button",{name:"关闭路径选择"}));fireEvent.click(screen.getByRole("button",{name:"更换 R 路径"}))
  resolveFile(["/stale/uv"])
  await new Promise(resolve=>setTimeout(resolve,0))
  expect(get.mock.calls.some(([op])=>op==="setLocalTool")).toBe(false)
  expect(screen.getByRole("dialog",{name:"选择 R 环境"})).toBeTruthy()
 })
 it("moves keyboard focus into the opened editor and Escape also dismisses from its trigger",async()=>{
  const {props}=fixture();render(<LocalEnvironmentOverview {...props}/>);await screen.findByText("/saved/uv")
  const trigger=screen.getByRole("button",{name:"更换 Python 路径"});trigger.focus();fireEvent.click(trigger)
  expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true)
  trigger.focus();fireEvent.keyDown(trigger,{key:"Escape"})
  expect(screen.queryByRole("dialog")).toBeNull();expect(document.activeElement).toBe(trigger)
 })
 it("restores focus after an asynchronous successful save re-enables its trigger",async()=>{
  let finish!: (ok:boolean)=>void
  const save=vi.fn((_language:string,_path:string)=>new Promise<boolean>(resolve=>{finish=resolve}))
  const {props}=fixture(save);render(<LocalEnvironmentOverview {...props}/>);await screen.findByText("/saved/uv")
  const trigger=screen.getByRole("button",{name:"更换 Python 路径"});fireEvent.click(trigger)
  const radio=within(screen.getByRole("dialog")).getByRole("radio");radio.focus();fireEvent.click(radio)
  expect((trigger as HTMLButtonElement).disabled).toBe(true)
  finish(true)
  await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull())
  expect(document.activeElement).toBe(trigger)
 })
})
