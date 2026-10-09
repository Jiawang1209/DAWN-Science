import { spawn } from "node:child_process"
import { join, resolve } from "node:path"
import { test, expect, type DawnFixture } from "./fixtures.js"
import type { Page } from "@playwright/test"
import electron from "electron"

test.use({ dawnOptions: { fakeSsh: true } })

async function invoke(page: Page, op: string, req: unknown = {}) {
  return page.evaluate(async ({op,req}) => {
    const r = await window.dawn!.invoke(op, req)
    if (!r.ok) throw new Error(r.error?.message ?? op)
    return r.data
  }, {op,req}) as Promise<any>
}

async function remoteChat(dawn: DawnFixture) {
  const {page}=dawn
  const head=page.getByRole("button",{name:/远端服务器/})
  if (await head.getAttribute("aria-expanded") !== "true") await head.click()
  await page.getByRole("button",{name:/添加服务器/}).click()
  await page.locator("#conn-host").fill("fake.example")
  await page.locator("#conn-user").fill("dawn")
  await page.locator("#conn-label").fill("恢复测试服务器")
  await page.locator("#conn-secret").fill("dawn")
  await page.getByRole("button",{name:"保存",exact:true}).click()
  await page.locator(".remote-row").first().getByRole("button",{name:/新对话/}).click()
  await expect(page.locator(".conv-remote")).toBeVisible()
  await page.getByPlaceholder(/今天帮你做些什么/).fill("保留在原对话里的话")
  await page.getByRole("button",{name:"发送",exact:true}).click()
  await expect(page.locator(".turns")).toContainText("假模型已应答")
  const sessions=await invoke(page,"listTemporarySessions")
  return sessions.find((s:any)=>s.remote) as {sessionId:string;remote:{connectionId:string}}
}

test("同库第二实例被拒绝，正在聊的远端会话仍 alive 且可发送",async({dawn})=>{
  const s=await remoteChat(dawn)
  const child=spawn(electron as unknown as string,[resolve("dist/electron/main.js"),`--user-data-dir=${join(dawn.dir,"second-profile")}`],{
    env:{...process.env,ELECTRON_RUN_AS_NODE:undefined,DAWN_DB:dawn.dbPath,DAWN_CONFIG:join(dawn.dir,"second.yaml"),DAWN_HIDE_WINDOW:"1"},stdio:"ignore",
  })
  try {
    const code=await new Promise<number|null>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("第二实例未退出")),15000)
      child.once("exit",code=>{clearTimeout(timer);resolve(code)})
      child.once("error",e=>{clearTimeout(timer);reject(e)})
    })
    expect(code).toBe(0)
    const sessions=await invoke(dawn.page,"listTemporarySessions")
    expect(sessions.find((x:any)=>x.sessionId===s.sessionId).state).toBe("alive")
    const box=dawn.page.getByPlaceholder(/今天帮你做些什么/)
    await expect(box).toBeEnabled()
    await box.fill("第二实例退出后继续")
    await dawn.page.getByRole("button",{name:"发送",exact:true}).click()
    await expect(dawn.page.locator(".turns")).toContainText("第二实例退出后继续")
  } finally { if(child.exitCode===null) child.kill("SIGKILL") }
})

test("远端恢复失败显示真原因，服务器 ready 后原对话自动恢复并保留草稿",async({dawn})=>{
  const {page}=dawn
  const s=await remoteChat(dawn)
  const box=page.getByPlaceholder(/今天帮你做些什么/)
  await box.fill("还没有发送的草稿")
  await invoke(page,"stopSession",{sessionId:s.sessionId})
  await invoke(page,"disconnectRemote",{id:s.remote.connectionId})
  const conn={id:s.remote.connectionId,label:"恢复测试服务器",host:"fake.example",username:"dawn"}
  await invoke(page,"saveConnection",{...conn,secret:"wrong"})
  await page.getByRole("button",{name:"重新连接并继续"}).click()
  await expect(page.locator(".session-recovery")).toContainText(/认证|auth/i)
  await expect(page.getByRole("button",{name:"重新连接并继续"})).toBeEnabled()
  await invoke(page,"saveConnection",{...conn,secret:"dawn"})
  await invoke(page,"connectRemote",{id:s.remote.connectionId})
  await expect(box).toBeEnabled()
  await expect(box).toHaveValue("还没有发送的草稿")
  await expect(page.locator(".turns")).toContainText("保留在原对话里的话")
  expect((await invoke(page,"listTemporarySessions")).filter((x:any)=>x.remote).map((x:any)=>x.sessionId)).toEqual([s.sessionId])
  await page.getByRole("button",{name:"发送",exact:true}).click()
  await expect(page.locator(".turns")).toContainText("还没有发送的草稿")
})
