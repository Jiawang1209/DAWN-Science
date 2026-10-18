import { afterEach, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CredentialStore } from "@earendil-works/pi-ai"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { AgentEvent, SessionSpec } from "../../src/runtime/types.js"

const dirs: string[] = []
afterEach(() => {for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})})
const credentials: CredentialStore = {read: async () => ({type: "api_key", key: "offline-test"}), list: async () => [], modify: async () => undefined, delete: async () => {}}
it("NativeRuntime 续问实际把项目技能资源接到子进程，父侧拒绝读取也生效", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dawn-native-resource-")); dirs.push(dir)
  const skills = join(dir, ".dawn", "skills", "local-skill"); mkdirSync(skills, {recursive: true})
  writeFileSync(join(skills, "SKILL.md"), "---\nname: local-skill\ndescription: 项目专属说明\n---\n真实技能正文")
  const agents = join(dir, ".dawn", "agents"); mkdirSync(agents, {recursive: true})
  writeFileSync(join(agents, "reader.md"), "---\nname: reader\ndescription: reader\n---\n只读")
  const entry = join(dir, "child.cjs")
  writeFileSync(entry, `let buf='',spec,phase=0;const emit=v=>process.stdout.write(JSON.stringify(v)+'\\n');function line(t){if(!t.trim())return;const m=JSON.parse(t);if(!spec){spec=m;if(!m.resources){emit({type:'done',ok:true,output:'missing resources'});process.exit(0)}emit({type:'call',id:'q',name:'resource_search',params:{kind:'skill'}})}else if(m.type==='reply'){if(!m.ok){emit({type:'event',event:{kind:'output',data:m.result}});emit({type:'done',ok:true,output:m.result});process.exit(0)}if(!phase++){const item=JSON.parse(m.result).items[0];emit({type:'call',id:'r',name:'resource_read',params:{id:item.id}})}else{emit({type:'event',event:{kind:'output',data:m.result}});emit({type:'done',ok:true,output:m.result});process.exit(0)}}}process.stdin.setEncoding('utf8');process.stdin.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\\n'))>=0){line(buf.slice(0,i));buf=buf.slice(i+1)}});process.stdin.on('end',()=>line(buf));`)
  for (const denied of [false, true]) {
    const rt = new NativeRuntime({credentials, subagentChildEntry: entry, skills: {项目目录名: ".dawn/skills"}, gate: () => denied ? {kind: "deny", reason: "资源读取测试拒绝"} : {kind: "allow"}})
    const spec: SessionSpec = {sessionId: `s-${denied}`, workspace: dir, sessionDir: join(dir, `session-${denied}`), native: {provider: "deepseek", model: "deepseek-flash"}}
    const events: AgentEvent[] = []
    try {
      await rt.start(spec); rt.attach(spec.sessionId, e => events.push(e))
      await rt.askSubagent(spec.sessionId, "resource-test", 0, "reader", "查询项目技能")
      const until = Date.now() + 5000
      while (!events.some(e => e.kind === "subagent_event" && e.event.kind === "settled")) {
        if (Date.now() > until) throw new Error("子任务未收尾")
        await new Promise(r => setTimeout(r, 10))
      }
      expect(JSON.stringify(events)).toContain(denied ? "资源读取测试拒绝" : "真实技能正文")
      expect(JSON.stringify(events)).not.toContain("missing resources")
    } finally {await rt.stop(spec.sessionId)}
  }
})
