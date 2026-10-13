import {afterEach,expect,it}from"vitest"
import{mkdtempSync,rmSync,writeFileSync,existsSync,readFileSync}from"node:fs"
import{tmpdir,homedir}from"node:os"
import{join}from"node:path"
import{KernelRuntime}from"../../src/runtime/kernel.js"
import{NativeRuntime}from"../../src/runtime/native.js"
import{对话内核}from"../../src/kernel/挂载.js"
import type{AgentEvent}from"../../src/runtime/types.js"
// @ts-expect-error -- Shared deterministic JavaScript inference server.
import{startMockInferenceServer,mockModelsJson}from"../../scripts/mock-inference-server.mjs"
const dirs:string[]=[]
afterEach(()=>dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})))
const kernelConfig=join(homedir(),"Library/Jupyter/kernels/dawn-spike/kernel.json")
it.skipIf(!existsSync(kernelConfig))("Bot 的真实 run_code 内核在所属 scope 执行并与主会话隔离",{timeout:60000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),"bot-real-kernel-"));dirs.push(dir)
 const server=await startMockInferenceServer({toolCall:(body:{messages:Array<{role:string;content:unknown}>})=>{
  const last=body.messages.at(-1);if(last?.role!=="user")return undefined
  const bot=JSON.stringify(last.content).includes("BOT_KERNEL")
  return{toolName:"run_code",args:{language:"python",code:`import os,pathlib\npathlib.Path('${bot?"bot":"main"}-kernel.txt').write_text(os.getcwd())\nprint('${bot?"BOT":"MAIN"}_KERNEL_ACTUAL', 6*7)`}}
 }})
 const modelsPath=join(dir,"models.json");writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
 const kernelRuntime=new KernelRuntime(),forwards:Array<{owner:string;event:unknown}>=[]
 const kernels=new 对话内核({runtime:kernelRuntime,workspaceOf:()=>dir,sessionDirOf:id=>join(dir,id,"kernels"),interpreterOf:()=>JSON.parse(readFileSync(kernelConfig,"utf8")).argv[0],转发:(owner,_language,event)=>forwards.push({owner,event})})
 const rt=new NativeRuntime({modelsPath,kernels,gate:()=>({kind:"allow"})}),events:AgentEvent[]=[]
 try{
  for(const id of ["main","bot"]){rt.attach(id,event=>events.push(event));await rt.start({sessionId:id,workspace:dir,sessionDir:join(dir,id),native:{provider:"deepseek",model:"deepseek-flash"},...(id==="bot"?{bot:{instructions:"BOT_KERNEL_ROLE",member:true}}:{})})}
  rt.write("main","MAIN_KERNEL");rt.write("bot","BOT_KERNEL")
  await Promise.all([rt.waitForIdle("main"),rt.waitForIdle("bot")])
  expect(existsSync(join(dir,"bot-kernel.txt")),JSON.stringify({events,forwards})).toBe(true)
  expect(existsSync(join(dir,"main-kernel.txt")),JSON.stringify({events,forwards})).toBe(true)
  expect(readFileSync(join(dir,"bot-kernel.txt"),"utf8")).toBe(readFileSync(join(dir,"main-kernel.txt"),"utf8"))
  expect(readFileSync(join(dir,"bot-kernel.txt"),"utf8")).toMatch(/bot-real-kernel-/)
  expect(forwards.filter(e=>e.owner==="bot").some(e=>JSON.stringify(e.event).includes("BOT_KERNEL_ACTUAL"))).toBe(true)
  expect(forwards.filter(e=>e.owner==="main").some(e=>JSON.stringify(e.event).includes("BOT_KERNEL_ACTUAL"))).toBe(false)
  expect(events.some(e=>e.kind==="tool_start"&&e.sessionId==="bot"&&e.toolName==="run_code")).toBe(true)
 }finally{for(const id of ["main","bot"])await rt.stop(id);await kernels.收全部();await server.close()}
})
