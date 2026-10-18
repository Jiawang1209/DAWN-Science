import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SubagentExecutor, type SubagentContext } from "../../src/subagent/executor.js"
import { 跑一轮 } from "../../src/team/runner.js"

const dirs: string[] = []
afterEach(() => {for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})})
const definition = {name: "reader", description: "reader", systemPrompt: "只读资源", filePath: "/fake/reader.md"}
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dawn-resource-rpc-")); dirs.push(dir)
  const script = join(dir, "child.cjs")
  writeFileSync(script, `let buf='',spec,done=false;function emit(v){process.stdout.write(JSON.stringify(v)+'\\n')}
function line(t){if(done||!t.trim())return;const v=JSON.parse(t);if(!spec){spec=v;if(!spec.resources){done=true;emit({type:'done',ok:true,output:'missing resources'});process.exit(0)}
emit({type:'call',id:'r1',name:spec.task.includes('unknown')?'resource_write':spec.task.includes('team')?'team_status':'resource_search',params:{kind:'skill',query:spec.task}})
}else if(v.type==='reply'){done=true;emit({type:'done',ok:true,output:JSON.stringify(v)});process.exit(0)}}
process.stdin.setEncoding('utf8');process.stdin.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\\n'))>=0){line(buf.slice(0,i));buf=buf.slice(i+1)}});process.stdin.on('end',()=>line(buf));`)
  const calls: string[] = []; let factories = 0
  const context: SubagentContext = {provider: "p", model: "m", cwd: dir, agentDirOf: i => join(dir, String(i)),
    resources: () => {factories++; return {call: async (name, args) => {calls.push(name); return JSON.stringify({name,args,round: factories})}}}}
  const childOf = () => ({command: process.execPath, args: [script]})
  const executor = new SubagentExecutor({childOf, context})
  return {dir, calls, context, childOf, executor, factories: () => factories}
}
describe("子任务资源双向管道", () => {
  it("single 收到真实子进程的资源请求并回传", async () => {
    const s = setup(), r = await s.executor.run({mode: "single", agent: "reader", task: "查技能"}, [definition])
    expect(r.results[0]?.ok).toBe(true)
    expect(JSON.parse(r.results[0]!.output)).toMatchObject({type: "reply", id: "r1", ok: true})
    expect(s.calls).toEqual(["resource_search"])
  })
  it("parallel 每个子进程独立访问器，chain 保留上游结果，续问重新建目录", async () => {
    const s = setup()
    const tasks = [{agent: "reader", task: "a"}, {agent: "reader", task: "b"}]
    const parallel = await s.executor.run({mode: "parallel", tasks}, [definition])
    expect(parallel.results.every(r => r.ok && r.output.includes("resource_search"))).toBe(true)
    const chain = await s.executor.run({mode: "chain", chain: [tasks[0]!, {agent: "reader", task: "使用 {previous}"}]}, [definition])
    expect(chain.results[1]!.task).toContain('"type":"reply"')
    expect((await s.executor.续问(0, "reader", "再查", [definition])).output).toContain("resource_search")
    expect(s.factories()).toBe(5)
  })
  it("普通子任务未知调用明确拒绝，不把写调用交给资源服务", async () => {
    const s = setup(), r = await s.executor.run({mode: "single", agent: "reader", task: "unknown"}, [definition])
    expect(JSON.parse(r.results[0]!.output)).toMatchObject({ok: false})
    expect(s.calls).toEqual([])
  })
  it("旧 Team 的资源与原成员工具分别路由", async () => {
    const s = setup(); const memberCalls: string[] = []
    const opts = {childOf: s.childOf, context: s.context, onCall: async (name: string) => {memberCalls.push(name); return "成员状态"}, timeoutMs: 3000}
    const spec = {definition, memberName: "甲", teamId: "t", prompt: "查技能", systemPrompt: "只读", sessionDir: join(s.dir, "session"), agentDir: join(s.dir, "agent"), resume: false}
    mkdirSync(spec.agentDir)
    const result = await 跑一轮(spec, opts)
    expect(JSON.parse(result.output)).toMatchObject({ok: true})
    expect(s.calls).toEqual(["resource_search"]); expect(memberCalls).toEqual([])
    expect((await 跑一轮({...spec, prompt: "team"}, opts)).output).toContain("成员状态")
    expect(memberCalls).toEqual(["team_status"])
  })
})
