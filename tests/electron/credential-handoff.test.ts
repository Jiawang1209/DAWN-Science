import { afterEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { CredentialStore, type SafeStorageLike } from "../../src/electron/credentials.js"
import { 收凭证交接 } from "../../src/electron/credential-handoff.js"
import { 交接箱 } from "../../src/update/交接.js"
import { migrate } from "../../src/store/schema.js"
import { SettingsStore } from "../../src/store/settings.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const encryption = (version: string): SafeStorageLike => ({
  isEncryptionAvailable: () => true,
  encryptString: text => Buffer.from(`${version}:${text}`),
  decryptString: bytes => { const text = bytes.toString(); if (!text.startsWith(`${version}:`)) throw new Error("different system key"); return text.slice(version.length + 1) },
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "dawn-update-preferences-")); roots.push(root)
  const file = join(root, "credentials.json")
  const old = new CredentialStore({ file, safeStorage: encryption("old"), onInsecure: () => {} })
  const current = () => { const store = new CredentialStore({ file, safeStorage: encryption("new"), onInsecure: () => {} }); store.warm(); return store }
  const box = new 交接箱({ 文件: join(root, "handoff.json"), 盐文件: join(root, "salt"), 机器id: () => "fixture-machine", 出声: () => {} })
  const handoff = () => expect(box.写({ 条目: old.导出明文(), 从: "0.0.41", 到: "0.0.42" })).toBe(true)
  return { root, old, current, box, handoff }
}

describe("应用内更新继承 API Key 与解释器", () => {
  it("系统加密密钥改变后，多个模型及扩展 API Key 全部接续", () => {
    const f = fixture()
    const entries = { deepseek: "fixture-ds", openai: "fixture-oa", anthropic: "fixture-an", "vision:apiKey": "fixture-vision", "mcp:example:API_KEY": "fixture-mcp" }
    for (const [id, value] of Object.entries(entries)) f.old.set(id, value)
    f.handoff()
    const current = f.current()
    收凭证交接(current, f.box, () => {})
    for (const [id, value] of Object.entries(entries)) expect(current.get(id)).toBe(value)
    expect(existsSync(join(f.root, "handoff.json"))).toBe(false)
  })
  it("已有模型 Key 可读时，仍恢复无法读取的视觉和 MCP 密钥", () => {
    const f = fixture()
    f.old.set("deepseek", "old-ds")
    f.old.set("vision:apiKey", "old-vision")
    f.old.set("mcp:example:API_KEY", "old-mcp")
    f.handoff()
    const current = f.current()
    current.set("deepseek", "new-user-ds")
    expect(current.broken()).toEqual([])
    收凭证交接(current, f.box, () => {})
    expect(current.get("vision:apiKey")).toBe("old-vision")
    expect(current.get("mcp:example:API_KEY")).toBe("old-mcp")
    expect(current.get("deepseek")).toBe("new-user-ds")
  })
  it("恢复旧版缺失 Key 时，不覆盖用户刚更新的另一组有效 Key", () => {
    const f = fixture()
    f.old.set("deepseek", "old-ds")
    f.old.set("openai", "old-oa")
    f.handoff()
    const current = f.current()
    current.set("openai", "new-user-oa")
    收凭证交接(current, f.box, () => {})
    expect(current.get("deepseek")).toBe("old-ds")
    expect(current.get("openai")).toBe("new-user-oa")
  })
  it("全新用户没有凭证或解释器；同一用户库重新打开保留两种解释器路径", () => {
    const f = fixture()
    const current = f.current()
    收凭证交接(current, f.box, () => {})
    expect(current.configured()).toEqual([])
    const path = join(f.root, "dawn.db")
    let db = new Database(path); migrate(db)
    let settings = new SettingsStore(db)
    expect(settings.interpreters()).toEqual({})
    settings.set("interpreter.r", "/usr/local/bin/R", "2026-10-31")
    settings.set("interpreter.python", "/example/env/bin/python3", "2026-10-31")
    db.close()
    db = new Database(path); migrate(db); settings = new SettingsStore(db)
    expect(settings.interpreters()).toEqual({ r: "/usr/local/bin/R", python: "/example/env/bin/python3" })
    db.close()
  })

  it("换包期间用户删除的密钥，不会被此前的交接快照重新加回来", () => {
    const f = fixture()
    f.old.set("deepseek", "old-ds")
    f.old.set("openai", "old-oa")
    f.handoff()
    f.old.delete("deepseek")
    const current = f.current()
    收凭证交接(current, f.box, () => {})
    expect(current.get("deepseek")).toBeUndefined()
    expect(current.get("openai")).toBe("old-oa")
  })
})
