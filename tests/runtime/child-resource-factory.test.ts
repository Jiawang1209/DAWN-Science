import { afterEach, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { serializeEntries } from "../../src/memory/store.js"
import { childResourceFactory } from "../../src/runtime/child-resources.js"
import type { NativeRuntimeOptions } from "../../src/runtime/native.js"
import type { SessionSpec } from "../../src/runtime/types.js"
const dirs: string[] = []
afterEach(() => {for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})})
it("每轮重新读取记忆开关；远端会话不读取本机同名项目资源", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "dawn-resource-factory-")); dirs.push(workspace)
  const memories = join(workspace, "memories"); mkdirSync(memories)
  writeFileSync(join(memories, "MEMORY.md"), serializeEntries(["全局参数"]))
  mkdirSync(join(workspace, ".dawn/memory"), {recursive: true})
  writeFileSync(join(workspace, ".dawn/memory/KEY.md"), serializeEntries(["本机项目专属"]))
  const skill = join(workspace, ".dawn/skills/local"); mkdirSync(skill, {recursive: true})
  writeFileSync(join(skill, "SKILL.md"), "---\nname: local\ndescription: 本机技能\n---\n正文")
  let enabled = true
  const opts: NativeRuntimeOptions = {skills: {项目目录名: ".dawn/skills"}, memoryEnable: () => ({off: !enabled, read: enabled, propose: false, skill: false}), memoryDeps: () => ({memoriesDir: memories, skillsDir: join(workspace, "skills")})}
  const spec: SessionSpec = {sessionId: "test", workspace, sessionDir: join(workspace, "session")}
  const factory = childResourceFactory(opts, spec)!
  expect(JSON.parse(await factory().call("resource_search", {kind: "memory"})).total).toBe(2)
  enabled = false
  expect(JSON.parse(await factory().call("resource_search", {kind: "memory"}))).toMatchObject({available: false, total: 0})
  enabled = true
  const remote = childResourceFactory(opts, {...spec, remote: {} as NonNullable<SessionSpec["remote"]>})!()
  expect(JSON.parse(await remote.call("resource_search", {kind: "memory"})).total).toBe(1)
  expect(JSON.parse(await remote.call("resource_search", {kind: "skill"})).total).toBe(0)
})
