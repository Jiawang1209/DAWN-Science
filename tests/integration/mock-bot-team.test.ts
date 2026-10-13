import {afterAll,beforeAll,expect,it}from"vitest"
// @ts-expect-error -- shared JavaScript fake inference module
import{startMockInferenceServer}from"../../scripts/mock-inference-server.mjs"
let server:{url:string;close():Promise<void>}
beforeAll(async()=>{server=await startMockInferenceServer()});afterAll(async()=>{await server.close()})
async function ask(messages:unknown[]){const response=await fetch(server.url+"/chat/completions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model:"m",stream:false,messages})});return await response.json() as {choices:{message:{tool_calls?:{function:{name:string;arguments:string}}[]}}[]}}
it("假模型先查真实 Bot 名册，组队 ID 来自名册并声明依赖和产物",async()=>{
 const first=await ask([{role:"user",content:"Bot协作验收"}]);expect(first.choices[0]?.message.tool_calls?.[0]?.function.name).toBe("bot_list")
 const next=await ask([{role:"user",content:"Bot协作验收"},{role:"assistant",tool_calls:[{function:{name:"bot_list"}}]},{role:"tool",content:JSON.stringify([{id:"a",role:"数据"},{id:"b",role:"统计"},{id:"c",role:"绘图"}])}]);const call=next.choices[0]?.message.tool_calls?.[0]?.function;expect(call?.name).toBe("team_create");const args=JSON.parse(call!.arguments);expect(args.members.map((m:{botId:string})=>m.botId)).toEqual(["a","b","c"]);expect(args.tasks[2].dependencies).toEqual(["t2"]);expect(args.tasks[1].outputs).toContain("scripts/model.py")
})
