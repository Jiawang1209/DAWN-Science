/**
 * 环境快照的存储（②-B · S17）。
 *
 * 重心在**内容寻址**上：同一个环境反复开会话应当只有一行，
 * 否则「这两次运行的环境一样吗」还得靠比对内容来回答——
 * 而那正是主键该替我们回答的。
 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { EnvironmentStore } from "../../src/store/environments.js"
import { fingerprintOf, type EnvironmentSnapshot } from "../../src/kernel/environment.js"

const dbs: Database.Database[] = []
afterEach(() => {
  for (const d of dbs.splice(0)) d.close()
})

function store(): EnvironmentStore {
  const db = new Database(":memory:")
  dbs.push(db)
  migrate(db)
  return new EnvironmentStore(db)
}

const 样本 = (over: Partial<EnvironmentSnapshot> = {}): EnvironmentSnapshot => ({
  language: "python",
  version: "3.11.15",
  executable: "/x/.venv/bin/python",
  platform: "macOS-26.3.1-arm64",
  libraryPaths: ["/x/lib"],
  packages: [
    { name: "ipykernel", version: "7.3.0" },
    { name: "numpy", version: "2.1.0" },
  ],
  packagesTotal: 2,
  ...over,
})

describe("内容寻址", () => {
  it("**同一个环境存两次只有一行** —— 否则一天下来躺着几十份逐字节相同的 JSON", () => {
    const s = store()
    const a = s.put(样本(), "2026-08-10T00:00:00.000Z")
    const b = s.put(样本(), "2026-08-10T01:00:00.000Z")
    expect(a).toBe(b)
    expect(s.count()).toBe(1)
  })

  it("**已存在的不刷新时间** —— 刷成「现在」等于说这个环境是刚刚才有的，那是假话", () => {
    const s = store()
    s.put(样本(), "2026-08-10T00:00:00.000Z")
    s.put(样本(), "2026-08-10T09:00:00.000Z")
    expect(s.get(fingerprintOf(样本()))!.capturedAt).toBe("2026-08-10T00:00:00.000Z")
  })

  it("**装了一个新包就是另一个环境** —— 这正是要能分辨的那件事", () => {
    const s = store()
    const a = s.put(样本(), "t")
    const b = s.put(
      样本({ packages: [...样本().packages, { name: "pandas", version: "2.3.0" }], packagesTotal: 3 }),
      "t",
    )
    expect(a).not.toBe(b)
    expect(s.count()).toBe(2)
  })

  it("**版本一样但解释器不同 = 两个环境** —— 五个 kernelspec 里三个是 conda", () => {
    const s = store()
    const a = s.put(样本({ executable: "/env-a/bin/python" }), "t")
    const b = s.put(样本({ executable: "/env-b/bin/python" }), "t")
    expect(a).not.toBe(b)
  })

  it("指纹**不含时间戳** —— 含了的话每次都是新指纹，去重就白做了", () => {
    expect(fingerprintOf(样本())).toBe(fingerprintOf(样本()))
    expect(fingerprintOf(样本())).toMatch(/^[0-9a-f]{64}$/)
  })

  it("取回来的内容与存进去的一致，并带上 id 与时间", () => {
    const s = store()
    const id = s.put(样本(), "2026-08-10T00:00:00.000Z")
    const got = s.get(id)!
    expect(got.version).toBe("3.11.15")
    expect(got.packages).toHaveLength(2)
    expect(got.id).toBe(id)
    expect(got.capturedAt).toBe("2026-08-10T00:00:00.000Z")
  })

  it("**没有就是 undefined** —— 不造一个空快照顶上", () => {
    expect(store().get("并不存在")).toBeUndefined()
  })

  it("**库里那一行坏了也不炸** —— 界面说取不到，而不是整个面板消失", () => {
    const db = new Database(":memory:")
    dbs.push(db)
    migrate(db)
    db.prepare(
      `INSERT INTO environment_snapshots (id, language, captured_at, payload) VALUES ('坏', 'python', 't', '{不是 json')`,
    ).run()
    expect(new EnvironmentStore(db).get("坏")).toBeUndefined()
  })
})
