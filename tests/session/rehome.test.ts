/**
 * 换工作目录（T3-b，2026-08-12）。
 *
 * 作者：*「我们可以在任务的对话框里面，设置工作路径。」*
 * 以及更早那句定调的：*「先聊起来，需要换地方再换。」*
 *
 * ## 这份用例盯的是「换」这件事的两个隐蔽后果
 *
 * 1. **agent 的手真的要挪过去。** 本地工具的 cwd 是建会话那一刻焊死的
 *    （`createBashToolDefinition(cwd, …)` 收的是字符串，不是 getter），
 *    所以只改一个字段绝对不够。**记了字段而手还在原地，是最坏的一种失败**：
 *    界面说在 A，实际在 B，然后有人说一句「把这里的文件都删了」。
 *
 * 2. **历史不能丢，而且它藏在工作目录里面。**
 *    pi 的记录 jsonl 住在 `<workspace>/.dawn/sessions/<id>`。
 *    只改库不搬目录的话，`resume` 走 `continueRecent` 会在新目录里
 *    什么都找不到——症状是**它忘了刚才聊过什么，但界面上还显示着**，
 *    一种最难查的失忆。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { SessionStore } from "../../src/store/sessions.js"
import { SessionManager } from "../../src/session/manager.js"
import { ProjectStore } from "../../src/store/projects.js"
import type { ProviderRegistry } from "../../src/config/schema.js"
import type { AgentRuntime, SessionSpec } from "../../src/runtime/types.js"

const registry: ProviderRegistry = {
  agents: {
    "ds-agent": { kind: "native", provider: "deepseek", model: "deepseek-v4-flash", capabilities: ["exec"] },
  },
}

function 造() {
  const db = new Database(":memory:")
  migrate(db)
  const store = new SessionStore(db)
  /** 记下每次 start 拿到的 spec——**「手挪没挪过去」只能从这里看** */
  const 起过: SessionSpec[] = []
  const runtime: AgentRuntime = {
    start: async (s) => {
      起过.push(s)
      return { sessionId: s.sessionId, pid: 1 }
    },
    attach: () => () => {},
    write: () => {},
    stop: async () => {},
  }
  const mgr = new SessionManager({
    store,
    registry,
    runtimes: { native: runtime, pty: runtime },
    workspaceRoot: "/tmp/dawn-test",
  })
  return { mgr, store, 起过, db, projects: new ProjectStore(db) }
}

describe("换工作目录", () => {
  let 旧: string
  let 新: string
  beforeEach(() => {
    旧 = mkdtempSync(join(tmpdir(), "dawn-rehome-old-"))
    新 = mkdtempSync(join(tmpdir(), "dawn-rehome-new-"))
  })

  it("**运行时在新目录里重新起来** —— 只改字段的话 agent 的手还在原地", async () => {
    const ctx = 造()
    const s = await ctx.mgr.create("ds-agent", 旧)
    expect(ctx.起过).toHaveLength(1)
    expect(ctx.起过[0]!.workspace).toBe(旧)

    await ctx.mgr.rehome(s.id, 新)

    // **又起了一次，而且是在新地方**
    expect(ctx.起过).toHaveLength(2)
    expect(ctx.起过[1]!.workspace).toBe(新)
    // 而且是「接着上一次」，不是从头开一段
    expect(ctx.起过[1]!.resume).toBe(true)
  })

  it("**pi 的记录跟着搬** —— 不搬的话它会忘了刚才聊过什么", async () => {
    const ctx = 造()
    const s = await ctx.mgr.create("ds-agent", 旧)
    const 旧目录 = ctx.store.get(s.id)!.sessionDir

    // 假装 pi 在那儿写过一段历史
    mkdirSync(旧目录, { recursive: true })
    writeFileSync(join(旧目录, "session.jsonl"), '{"role":"user","content":"你好"}\n')

    await ctx.mgr.rehome(s.id, 新)

    const 新目录 = ctx.store.get(s.id)!.sessionDir
    expect(新目录.startsWith(新)).toBe(true)
    expect(existsSync(join(新目录, "session.jsonl"))).toBe(true)
    expect(readFileSync(join(新目录, "session.jsonl"), "utf8")).toContain("你好")
    // **旧地方不留副本**：留着的话下次搬回来会撞上一份过期的历史
    expect(existsSync(旧目录)).toBe(false)
  })

  it("库里三样一起改 —— 少一样就是一份互相矛盾的记录", async () => {
    const ctx = 造()
    // **真的项目行**：`sessions.project_id` 上有外键，塞一个不存在的 id
    // 会被库当场挡下——这一条是它自己在守「归属必须真的存在」
    const 造项目 = (id: string, ws: string) =>
      ctx.projects.insert({ projectId: id, name: id, workspace: ws, createdAt: "2026-08-12T00:00:00Z" })
    造项目("p-old", 旧)
    造项目("p-new", 新)

    const s = await ctx.mgr.create("ds-agent", 旧, { projectId: "p-old" })
    await ctx.mgr.rehome(s.id, 新, "p-new")

    const rec = ctx.store.get(s.id)!
    expect(rec.workspace).toBe(新)
    expect(rec.sessionDir.startsWith(新)).toBe(true)
    expect(rec.projectId).toBe("p-new")
  })

  it("**搬到原地就什么都不做** —— 白重启一次会平白丢掉运行时状态", async () => {
    const ctx = 造()
    const s = await ctx.mgr.create("ds-agent", 旧)
    await ctx.mgr.rehome(s.id, 旧)
    expect(ctx.起过).toHaveLength(1)
  })

  /**
   * **远端那条不走这里。**
   *
   * 它的当前目录是活的（`{get,set}`），换法是直接跟它说——
   * 那是作者定的：*「自然语言告诉我跳到哪个文件夹之类的不就好了？」*
   * 在这里悄悄不做等于「点了没反应」，所以要出声。
   */
  it("**远端会话明确拒绝，不静默不做**", async () => {
    const ctx = 造()
    const s = await ctx.mgr.create("ds-agent", 旧)
    ctx.db.prepare(`UPDATE sessions SET connection_id = ? WHERE id = ?`).run("conn-1", s.id)
    await expect(ctx.mgr.rehome(s.id, 新)).rejects.toThrow(/远端/)
  })

  it("没有这个会话就说没有，不是静静地成功", async () => {
    const ctx = 造()
    await expect(ctx.mgr.rehome("不存在", 新)).rejects.toThrow(/没有这个会话/)
  })

  afterEach(() => {
    rmSync(旧, { recursive: true, force: true })
    rmSync(新, { recursive: true, force: true })
  })
})
