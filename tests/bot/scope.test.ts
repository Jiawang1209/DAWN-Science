import { afterEach, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { scopeKey } from "../../src/store/bots.js"

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
it("canonicalizes real local paths while preserving project, remote and scratch isolation", () => {
  const root = mkdtempSync(join(tmpdir(), "dawn-scope-")); dirs.push(root)
  mkdirSync(join(root, "real")); symlinkSync(join(root, "real"), join(root, "alias"))
  const base = { workspace: join(root, "real"), projectId: "p" }
  expect(scopeKey(base)).toBe(scopeKey({ ...base, workspace: join(root, "alias", ".") }))
  expect(scopeKey(base)).not.toBe(scopeKey({ ...base, projectId: "q" }))
  const remote = { ...base, connectionId: "ssh1", remoteCwd: "/data/a/../b/" }
  expect(scopeKey(base)).not.toBe(scopeKey(remote))
  expect(scopeKey(remote)).toBe(scopeKey({ ...remote, remoteCwd: "/data/b" }))
  expect(scopeKey(remote)).not.toBe(scopeKey({ ...remote, connectionId: "ssh2" }))
  expect(scopeKey(remote)).not.toBe(scopeKey({ ...remote, remoteCwd: "/data/c" }))
  expect(scopeKey({ workspace: join(root, "scratch1") })).not.toBe(scopeKey({ workspace: join(root, "scratch2") }))
  expect(() => scopeKey({ ...base, connectionId: "ssh1" })).toThrow()
  expect(() => scopeKey({ ...base, remoteCwd: "/data" })).toThrow()
  expect(() => scopeKey({ workspace: "" })).toThrow()
})
