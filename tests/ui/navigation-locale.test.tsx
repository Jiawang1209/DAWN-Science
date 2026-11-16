import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TranscriptRow } from "../../src/ui/views.js"
import { TurnNavigator } from "../../src/ui/turn-navigator.js"
import { setLang } from "../../src/ui/i18n/index.js"
import { EN } from "../../src/ui/i18n/en.js"
const item={type:"turn" as const,id:"1",final:true,who:"user" as const,text:"Original research question"}
describe("guide locale updates without remounting the workbench",()=>{
 it("updates memoized conversation controls and retains an open message edit",()=>{
  render(<TranscriptRow item={item} agentId="agent" onResend={()=>{}} />)
  fireEvent.click(screen.getByRole("button",{name:"修改"}))
  fireEvent.change(screen.getByRole("textbox",{name:"修改这段话"}),{target:{value:"Unsent edit"}})
  act(()=>setLang("en"))
  expect((screen.getByRole("textbox",{name:EN["修改这段话"]!}) as HTMLTextAreaElement).value).toBe("Unsent edit")
 })
 it("updates memoized conversation navigation when language changes",()=>{
  render(<TurnNavigator items={[item,{...item,id:"2"},{...item,id:"3"}]} />)
  expect(screen.getByLabelText("轮次导航")).toBeTruthy()
  act(()=>setLang("en"))
  expect(screen.getByLabelText(EN["轮次导航"]!)).toBeTruthy()
 })
})
