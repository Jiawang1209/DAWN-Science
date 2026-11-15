import { expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CliRuntime } from "../../../src/runtime/cli/runtime.js"
import type { AgentEvent } from "../../../src/runtime/types.js"

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
function fixture(family: "claude" | "codex") {
  const dir = mkdtempSync(join(tmpdir(), "dawn-cli-queue-"))
  const script = join(dir, "cli.mjs"), log = join(dir, "turns.jsonl")
  writeFileSync(script, `
import {appendFileSync} from 'node:fs';
const say=o=>process.stdout.write(JSON.stringify(o)+'\\n');
function turn(text) {
 appendFileSync(${JSON.stringify(log)},JSON.stringify({text,pid:process.pid})+'\\n');
 ${family === "codex" ? `say({type:'thread.started',thread_id:'thread1'});` : ""}
 setTimeout(()=>{
 ${family === "codex" ? `say({type:'item.completed',item:{id:'i',type:'agent_message',text}});say({type:'turn.completed',usage:{}});` : `say({type:'assistant',message:{content:[{type:'text',text}]}});say({type:'result',is_error:false,session_id:'thread1'});`}
 },150);
}
${family === "codex" ? `turn(process.argv.at(-1));` : `let buf='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{buf+=chunk;let i;while((i=buf.indexOf('\\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);turn(JSON.parse(line).message.content);}});`}
`)
  const rt = new CliRuntime({ commandOf: () => ({ command: process.execPath, args: [script], family }) })
  const events: AgentEvent[] = []
  rt.attach("s1", event => events.push(event))
  const turns = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { text: string; pid: number }) : []
  return {
    rt, events, turns,
    start: () => rt.start({ sessionId: "s1", workspace: dir, sessionDir: join(dir, "session") }),
    async cleanup() {
      await rt.stop("s1")
      for (const {pid} of turns()) { try { process.kill(pid, "SIGKILL") } catch {} }
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

for (const family of ["codex", "claude"] as const) {
  it(`${family} serializes rapid follow-ups without losing a pending turn`, async () => {
    const f = fixture(family)
    try {
      await f.start()
      f.rt.write("s1", "first")
      f.rt.write("s1", "second")
      const result = await Promise.race([f.rt.waitForIdle("s1").then(() => "done"), delay(1500).then(() => "timeout")])
      expect(result).toBe("done")
      expect(f.events.filter(event => event.kind === "output").map(event => event.data)).toEqual(["first", "second"])
      expect(f.turns().map(turn => turn.text)).toEqual(["first", "second"])
    } finally { await f.cleanup() }
  })

  it(`${family} stop discards a queued follow-up`, async () => {
    const f = fixture(family)
    try {
      await f.start()
      f.rt.write("s1", "first")
      f.rt.write("s1", "second")
      await expect.poll(() => f.turns().length, { timeout: 2000 }).toBeGreaterThan(0)
      await f.rt.stop("s1")
      expect(f.turns().map(turn => turn.text)).toEqual(["first"])
    } finally { await f.cleanup() }
  })
}

it("Codex abort discards queued turns and the next explicit write can run", async () => {
  const f = fixture("codex")
  try {
    await f.start()
    f.rt.write("s1", "first")
    f.rt.write("s1", "second")
    await expect.poll(() => f.turns().length, { timeout: 2000 }).toBeGreaterThan(0)
    await f.rt.abort("s1")
    f.rt.write("s1", "third")
    await f.rt.waitForIdle("s1")
    expect(f.turns().map(turn => turn.text)).toEqual(["first", "third"])
    expect(f.events.filter(event => event.kind === "output").map(event => event.data)).toEqual(["third"])
  } finally { await f.cleanup() }
})
