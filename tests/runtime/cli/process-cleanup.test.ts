import { describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CodexDriver } from "../../../src/runtime/cli/codex.js"
import { ClaudeDriver } from "../../../src/runtime/cli/claude.js"
import type { AgentEvent } from "../../../src/runtime/types.js"

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true } catch { return false } }

/** Inherited output pipes keep a dead CLI's close event pending until its job exits. */
function fixture(family: "codex" | "claude", detachedJob = false, parentExits = false) {
  const dir = mkdtempSync(join(tmpdir(), "dawn-cli-cleanup-"))
  const script = join(dir, "cli.mjs")
  const ready = join(dir, "ready.json")
  writeFileSync(script, `
import {spawn} from 'node:child_process'; import {writeFileSync} from 'node:fs';
const job = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {stdio:'inherit', detached:${detachedJob}});
writeFileSync(${JSON.stringify(ready)}, JSON.stringify([process.pid, job.pid]));
${parentExits ? "process.exit(0);" : ""}
const say = o => process.stdout.write(JSON.stringify(o)+'\\n');
${family === "claude" ? `
process.stdin.setEncoding('utf8'); let buf=''; process.stdin.on('data', chunk => {
 buf+=chunk; let i; while((i=buf.indexOf('\\n'))>=0) { const req=JSON.parse(buf.slice(0,i));buf=buf.slice(i+1);
 if(req.message.content==='complete') {say({type:'assistant',message:{content:[{type:'text',text:'done'}]}});say({type:'result',is_error:false,session_id:'resume-test'});}
 }
});` : ""}
setInterval(()=>{},1000);
`)
  const events: AgentEvent[] = []
  const common = { sessionId: "s1", command: process.execPath, args: [script], cwd: dir, emit: (event: AgentEvent) => events.push(event) }
  const driver = family === "codex" ? new CodexDriver({ ...common, onThreadId: () => {} }) : new ClaudeDriver(common)
  const recorded: number[] = []
  return {
    driver, events,
    async pids() {
      await expect.poll(() => existsSync(ready), { timeout: 2000 }).toBe(true)
      const pids = JSON.parse(readFileSync(ready, "utf8")) as number[]
      recorded.push(...pids)
      return pids
    },
    async cleanup() {
      // Only explicitly recorded fixture PIDs are ever touched, even on assertion failure.
      for (const pid of [...recorded].reverse()) { try { process.kill(pid, "SIGKILL") } catch {} }
      await driver.close()
      await delay(20)
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

describe("CLI-owned process cleanup", () => {
  for (const family of ["codex", "claude"] as const) {
    it.each(["close", "abortTurn"] as const)(`${family} %s drains inherited pipes and kills the job`, async action => {
      const f = fixture(family)
      let settled = false
      const turn = f.driver.startTurn("hang").then(() => { settled = true })
      try {
        const pids = await f.pids()
        await f.driver[action]()
        await expect.poll(() => pids.some(alive), { timeout: 1000 }).toBe(false)
        await expect.poll(() => settled, { timeout: 1000 }).toBe(true)
        await turn
      } finally { await f.cleanup() }
    })
  }

  for (const family of ["codex", "claude"] as const) {
    it.skipIf(process.platform === "win32")(`${family} closes the retained group when its parent already exited`, async () => {
      const f = fixture(family, false, true)
      const turn = f.driver.startTurn("hang")
      try {
        const pids = await f.pids()
        await expect.poll(() => alive(pids[0]!), { timeout: 2000 }).toBe(false)
        expect(alive(pids[1]!)).toBe(true)
        await f.driver.close()
        await expect.poll(() => pids.some(alive), { timeout: 1000 }).toBe(false)
        await turn
      } finally { await f.cleanup() }
    })
  }

  it.skipIf(process.platform === "win32")("also kills a job in its own process group", async () => {
    const f = fixture("codex", true)
    const turn = f.driver.startTurn("hang")
    try {
      const pids = await f.pids()
      await f.driver.close()
      await expect.poll(() => pids.some(alive), { timeout: 1000 }).toBe(false)
      await turn
    } finally { await f.cleanup() }
  })

  it("Claude model replacement drains the old job before accepting the next turn", async () => {
    const f = fixture("claude")
    try {
      await f.driver.startTurn("complete")
      const oldPids = await f.pids()
      const replacing = f.driver.setModel("haiku")
      const next = f.driver.startTurn("complete")
      await Promise.all([replacing, next])
      await expect.poll(() => oldPids.some(alive), { timeout: 1000 }).toBe(false)
      await f.pids()
      expect(f.events.filter(event => event.kind === "output")).toHaveLength(2)
      expect(f.events.some(event => event.kind === "exited")).toBe(false)
    } finally { await f.cleanup() }
  })
})
