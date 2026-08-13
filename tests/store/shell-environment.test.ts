/**
 * shell 环境快照：类型、指纹、迁移（②-B · R5，2026-08-13）。
 *
 * 这一批守三件事：
 *
 * 1. **kernel 那一支的指纹口径一个字节都不能动。** 它是主键，也是 Run 指过来的
 *    那个引用——改了口径，同一个环境会在老库里裂成两行，而旧行正是证据。
 * 2. **两种快照不可比**（计划 §3.4），而且「不可比」是一个答案，不是一次失败。
 * 3. **老库升得上来**：`language NOT NULL` 要放宽，老行补 `kernel`，
 *    而 id 一个字节不动。
 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { createHash } from "node:crypto"
import { migrate } from "../../src/store/schema.js"
import { EnvironmentStore } from "../../src/store/environments.js"
import { fingerprintOf, type EnvironmentSnapshot } from "../../src/kernel/environment.js"
import {
  compareEnvironments,
  shellFingerprint,
  type ShellEnvironment,
} from "../../src/env/snapshot.js"

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

const 内核样本 = (over: Partial<EnvironmentSnapshot> = {}): EnvironmentSnapshot => ({
  language: "python",
  version: "3.11.15",
  executable: "/x/bin/python",
  platform: "macOS-15",
  libraryPaths: ["/x/lib"],
  packages: [{ name: "numpy", version: "2.0.0" }],
  packagesTotal: 1,
  ...over,
})

const 机器样本 = (over: Partial<ShellEnvironment> = {}): ShellEnvironment => ({
  kind: "shell",
  where: "local",
  os: "Linux",
  osRelease: "6.8.0",
  distro: "Ubuntu 24.04.1 LTS",
  arch: "x86_64",
  cpus: 8,
  memoryKib: 16_000_000,
  tools: { git: { path: "/usr/bin/git", version: "2.43.0" } },
  workspace: "/home/u/proj",
  workspaceIsGitRepo: true,
  ...over,
})

describe("R5 · kernel 指纹的口径不许动", () => {
  /**
   * **这条是钉子，不是复述。**
   *
   * 它把 R5 之前那份规范化 JSON 的算法直接写在这里，再要求实现算出同一个值。
   * 有人往 `fingerprintOf` 里加一个字段（哪怕是 `kind`），这条当场红——
   * 而那正是「同一个环境在老库里裂成两行」的那一刻。
   */
  it("与 R5 之前逐字节一致 —— 改了它就是改写已入库的证据", () => {
    const snap = 内核样本()
    const 老口径 = createHash("sha256")
      .update(
        JSON.stringify({
          language: snap.language,
          version: snap.version,
          executable: snap.executable,
          platform: snap.platform,
          libraryPaths: snap.libraryPaths,
          packages: snap.packages.map((p) => [p.name, p.version]),
          packagesTotal: snap.packagesTotal,
        }),
      )
      .digest("hex")
    expect(fingerprintOf(snap)).toBe(老口径)
  })

  it("两支算不到一起去 —— 字段集本来就不同，不靠 kind 兜底", () => {
    expect(shellFingerprint(机器样本())).not.toBe(fingerprintOf(内核样本()))
  })
})

describe("R5 · shell 指纹", () => {
  it("同一台机器反复探测，指纹不变 —— 否则去重白做", () => {
    expect(shellFingerprint(机器样本())).toBe(shellFingerprint(机器样本()))
  })

  it("**不含时间戳**", () => {
    expect(shellFingerprint(机器样本())).toMatch(/^[0-9a-f]{64}$/)
  })

  /**
   * **同样一套软件装在两台机器上，是两个环境。**
   * ②-B 的判据要区分的正是这个：「同一段代码能在本地和一台 SSH 机器上跑」。
   */
  it("换一台机器就是另一个指纹 —— 软件一样也不算同一个环境", () => {
    const 本地 = 机器样本({ where: "local" })
    const 远端 = 机器样本({ where: { connectionId: "c1" } })
    expect(shellFingerprint(远端)).not.toBe(shellFingerprint(本地))
  })

  /**
   * `Object.keys` 的顺序取决于插入顺序。探测代码哪天换个顺序收集工具，
   * **同一台机器就会算出两个指纹**——症状是数据库里躺着两行一模一样的 JSON。
   */
  it("工具的收集顺序不影响指纹", () => {
    const a = 机器样本({
      tools: { git: { path: "/usr/bin/git" }, python: { path: "/usr/bin/python3" } },
    })
    const b = 机器样本({
      tools: { python: { path: "/usr/bin/python3" }, git: { path: "/usr/bin/git" } },
    })
    expect(shellFingerprint(a)).toBe(shellFingerprint(b))
  })

  /**
   * **「探不到」与「探到了一个空值」不是一回事。**
   * 前者该被读成「不知道」，后者会被当成一个真的值参与比对。
   */
  it("少一个字段就是另一个指纹 —— 探不到不等于探到了空", () => {
    const 全的 = 机器样本()
    const { distro: _丢掉, ...少一个 } = 机器样本()
    expect(shellFingerprint(少一个 as ShellEnvironment)).not.toBe(shellFingerprint(全的))
  })
})

describe("R5 · 不可比是一个答案，不是一次失败", () => {
  it("解释器快照与机器快照放一起 → 不可比，且说得出为什么", () => {
    const r = compareEnvironments({ kind: "kernel", id: "a" }, { kind: "shell", id: "b" })
    expect(r.comparable).toBe(false)
    if (!r.comparable) {
      expect(r.reason).toMatch(/解释器/)
      expect(r.reason).toMatch(/机器/)
    }
  })

  it("**同类才谈得上一样不一样**", () => {
    expect(compareEnvironments({ kind: "shell", id: "x" }, { kind: "shell", id: "x" }))
      .toEqual({ comparable: true, same: true })
    expect(compareEnvironments({ kind: "shell", id: "x" }, { kind: "shell", id: "y" }))
      .toEqual({ comparable: true, same: false })
  })

  /**
   * 老行没有 `kind`。**这里的默认值是可证的**：R5 之前这张表里
   * 只可能有内核快照——迁移也是照这条把老行补上的，两处必须一致。
   */
  it("没有 kind 的老行当作 kernel，与迁移的口径一致", () => {
    expect(compareEnvironments({ id: "a" }, { kind: "kernel", id: "a" }))
      .toEqual({ comparable: true, same: true })
  })
})

describe("R5 · 存两种", () => {
  it("shell 快照存得进、取得回，且 kind 说得清", () => {
    const s = store()
    const id = s.putShell(机器样本(), "2026-08-13T00:00:00.000Z")
    const got = s.get(id)!
    expect(got.kind).toBe("shell")
    if (got.kind !== "shell") throw new Error("存的是机器快照，取回来却不是")
    expect(got.distro).toBe("Ubuntu 24.04.1 LTS")
    expect(got.capturedAt).toBe("2026-08-13T00:00:00.000Z")
  })

  it("同一台机器存两次只有一行 —— 内容寻址对两种都成立", () => {
    const s = store()
    const a = s.putShell(机器样本(), "t1")
    const b = s.putShell(机器样本(), "t2")
    expect(a).toBe(b)
    expect(s.count()).toBe(1)
  })

  it("**已入库的不被覆盖**：capturedAt 仍是第一次见到它的时间", () => {
    const s = store()
    const id = s.putShell(机器样本(), "2026-08-13T00:00:00.000Z")
    s.putShell(机器样本(), "2026-08-14T00:00:00.000Z")
    expect(s.get(id)!.capturedAt).toBe("2026-08-13T00:00:00.000Z")
  })

  it("两种混在一张表里，各取各的", () => {
    const s = store()
    const k = s.put(内核样本(), "t")
    const sh = s.putShell(机器样本(), "t")
    expect(s.count()).toBe(2)
    expect(s.get(k)!.kind).toBe("kernel")
    expect(s.get(sh)!.kind).toBe("shell")
  })
})

describe("R5 · 老库升得上来", () => {
  /** 造一个 R5 之前形状的库：`language NOT NULL`，没有 `kind` */
  function 老库(): Database.Database {
    const db = new Database(":memory:")
    dbs.push(db)
    db.exec(`
      CREATE TABLE environment_snapshots (
        id          TEXT PRIMARY KEY,
        language    TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        payload     TEXT NOT NULL
      );
    `)
    return db
  }

  it("老行补成 kernel，且 **id 与 capturedAt 一个字节不动**", () => {
    const db = 老库()
    const snap = 内核样本()
    const 老id = fingerprintOf(snap)
    db.prepare(
      `INSERT INTO environment_snapshots (id, language, captured_at, payload) VALUES (?, 'python', '2026-08-10T00:00:00.000Z', ?)`,
    ).run(老id, JSON.stringify(snap))

    migrate(db)

    /**
     * **查那一列，不查 `get()` 的返回值**（2026-08-13 变异验证抓到的）。
     *
     * 上一版这条只断言 `get(老id).kind === "kernel"`——而 `get()` 自己有一句
     * 「没有 kind 就当 kernel」的兜底，于是**把迁移整段摘掉它照样绿**。
     * 它验的是读取兜底，不是迁移。
     *
     * 列里的值只有迁移写得进去，所以这一句才是那条判据。
     */
    const 列 = db
      .prepare(`SELECT kind FROM environment_snapshots WHERE id = ?`)
      .get(老id) as { kind: string } | undefined
    expect(列?.kind, "迁移没有把老行标成 kernel").toBe("kernel")

    const got = new EnvironmentStore(db).get(老id)!
    expect(got, "老快照升级之后必须还在——它是证据").toBeDefined()
    expect(got.kind).toBe("kernel")
    expect(got.capturedAt).toBe("2026-08-10T00:00:00.000Z")
    if (got.kind !== "kernel") throw new Error("老行应当是内核快照")
    expect(got.version).toBe("3.11.15")
  })

  it("升完之后 shell 快照才存得进去 —— 那条 NOT NULL 真的放宽了", () => {
    const db = 老库()
    migrate(db)
    const s = new EnvironmentStore(db)
    expect(() => s.putShell(机器样本(), "t")).not.toThrow()
    expect(s.get(shellFingerprint(机器样本()))!.kind).toBe("shell")
  })

  it("**跑第二遍不出事** —— 迁移每次启动都会走一遍", () => {
    const db = 老库()
    const id = fingerprintOf(内核样本())
    db.prepare(
      `INSERT INTO environment_snapshots (id, language, captured_at, payload) VALUES (?, 'python', 't', ?)`,
    ).run(id, JSON.stringify(内核样本()))
    migrate(db)
    migrate(db)
    const s = new EnvironmentStore(db)
    expect(s.count(), "重复迁移把证据复制了一份").toBe(1)
    expect(s.get(id)).toBeDefined()
  })
})
