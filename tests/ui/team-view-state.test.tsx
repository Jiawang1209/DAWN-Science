/**
 * 坞里「团队」格画哪一段的团队（2026-09-29）。修的是「坞里那段点团队 chip，打开的是主区那段的团队」（`$团队` 只载主区）。
 *
 * ①纯判定：只在记下的那一段此刻是坞里那段、且不同时是主区那段时读侧边那份；
 * ②放下：格子不在眼前、或那一段已不在主区也不在坞里 → 回到缺省；
 * ③侧边团队随坞里那段走：换段 / 拿下清掉；
 * ④格子真的画出那一份，并说一句出处；
 * ⑤`App` 的路由：团队 chip 记下它所属的那一段；坞里那段的 `team` 推送与快照写进侧边那份（源码扫描，同 `subagent-route.test.ts`）。
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { render, screen, cleanup, act } from "@testing-library/react"
import type { TeamSnapshot } from "../../src/protocol/index.js"
import { $团队格会话, $团队格团队, $团队格来源, 看团队, 团队格读哪份, 团队格该放下, 放下不该看的团队格 } from "../../src/ui/state/team-view.js"
import { $团队 } from "../../src/ui/state/transcript.js"
import { $侧边团队, $侧边会话id, 挂进坞, 从坞拿下 } from "../../src/ui/state/side-chat.js"
import { $activeSessionId } from "../../src/ui/state/view.js"
import { $rightDockOpen, $rightDockTenant } from "../../src/ui/state/right-dock.js"
import { TeamPanel } from "../../src/ui/team-panel.js"

const 队 = (id: string, name: string): TeamSnapshot => ({
  id,
  name,
  goal: "g",
  captainSessionId: "x",
  createdAt: 0,
  members: [],
  tasks: [],
  messages: [],
  taskSeq: 0,
})

afterEach(() => {
  cleanup()
  $团队格会话.set(undefined)
  $团队.set(undefined)
  $侧边团队.set(undefined)
  $侧边会话id.set(undefined)
  $activeSessionId.set(undefined)
  $rightDockOpen.set(false)
  try {
    localStorage.clear()
  } catch {
    /* 没有 localStorage 的环境 */
  }
})

describe("团队格读哪份", () => {
  it("没指定：主区那段", () => expect(团队格读哪份(undefined, "m", "s")).toBe("主"))
  it("指定的是坞里那段：侧边那份", () => expect(团队格读哪份("s", "m", "s")).toBe("侧"))
  it("指定的是主区那段：主区那份", () => expect(团队格读哪份("m", "m", "s")).toBe("主"))
  it("坞里那段同时也是主区那段（刚被点到主区）：主区赢", () => expect(团队格读哪份("s", "s", "s")).toBe("主"))
  it("指定的那段已经不在坞里：不读侧边那份（那份此刻是另一段的）", () => expect(团队格读哪份("s", "m", "s2")).toBe("主"))
})

describe("$团队格团队：跟着来源换份", () => {
  it("点了坞里那段的团队 chip → 画坞里那段的团队；放下 → 回到主区那段", () => {
    $activeSessionId.set("m")
    $侧边会话id.set("s")
    $团队.set(队("tm", "主区的队"))
    $侧边团队.set(队("ts", "坞里的队"))
    expect($团队格团队.get()?.name).toBe("主区的队")
    看团队("s")
    expect($团队格来源.get()).toBe("侧")
    expect($团队格团队.get()?.name).toBe("坞里的队")
    看团队(undefined)
    expect($团队格团队.get()?.name).toBe("主区的队")
  })
  it("坞里那段没有团队：画「没有」，不拿主区那段的顶上", () => {
    $activeSessionId.set("m")
    $侧边会话id.set("s")
    $团队.set(队("tm", "主区的队"))
    看团队("s")
    expect($团队格团队.get()).toBeUndefined()
  })
})

describe("团队格该放下", () => {
  const 此刻 = { dockOpen: true, tenant: "team", 主: "m", 侧: "s" }
  it("没记下：不动", () => expect(团队格该放下(undefined, { ...此刻, dockOpen: false })).toBe(false))
  it("在眼前、且还是坞里那段：留着", () => expect(团队格该放下("s", 此刻)).toBe(false))
  it("坞收起 / 切到别的格：放下", () => {
    expect(团队格该放下("s", { ...此刻, dockOpen: false })).toBe(true)
    expect(团队格该放下("s", { ...此刻, tenant: "chat" })).toBe(true)
  })
  it("那一段已不在主区也不在坞里：放下", () => expect(团队格该放下("s", { ...此刻, 侧: "s2" })).toBe(true))
  it("放下不该看的团队格读此刻的状态", () => {
    $activeSessionId.set("m")
    $侧边会话id.set("s")
    $rightDockOpen.set(true)
    $rightDockTenant.set("team")
    看团队("s")
    放下不该看的团队格()
    expect($团队格会话.get()).toBe("s")
    $rightDockTenant.set("chat")
    放下不该看的团队格()
    expect($团队格会话.get()).toBeUndefined()
  })
})

describe("侧边团队随坞里那段走", () => {
  it("换一段挂进坞：清掉上一段的团队", () => {
    挂进坞("p:1", "s")
    $侧边团队.set(队("ts", "坞里的队"))
    挂进坞("p:1", "s2")
    expect($侧边团队.get()).toBeUndefined()
  })
  it("从坞拿下：清掉", () => {
    挂进坞("p:1", "s")
    $侧边团队.set(队("ts", "坞里的队"))
    从坞拿下()
    expect($侧边团队.get()).toBeUndefined()
  })
})

describe("团队格画的是那一份", () => {
  it("坞里那段的团队：画它的名字，并说一句出处", () => {
    $activeSessionId.set("m")
    $侧边会话id.set("s")
    $团队.set(队("tm", "主区的队"))
    $侧边团队.set(队("ts", "坞里的队"))
    看团队("s")
    const { container } = render(<TeamPanel />)
    expect(container.querySelector(".team-panel")?.getAttribute("data-team")).toBe("ts")
    expect(container.querySelector('[data-team-source="side"]')).not.toBeNull()
    act(() => 看团队(undefined))
    expect(container.querySelector(".team-panel")?.getAttribute("data-team")).toBe("tm")
    expect(container.querySelector('[data-team-source="side"]')).toBeNull()
  })
  it("坞里那段没有团队：说没有、也说是坞里那段", () => {
    $activeSessionId.set("m")
    $侧边会话id.set("s")
    $团队.set(队("tm", "主区的队"))
    看团队("s")
    render(<TeamPanel />)
    expect(screen.getByText(/这段会话没有团队/)).toBeDefined()
    expect(screen.getByText("坞里那段对话的团队")).toBeDefined()
  })
})

describe("App 的路由（源码扫描）", () => {
  const app = readFileSync(join(__dirname, "../../src/ui/App.tsx"), "utf8")
  it("放下团队格那段 effect 跟着坞开合、坞格、主区与坞里那段一起变", () => {
    const m = app.match(/放下不该看的团队格\(\)\s*\}, \[([^\]]*)\]\)/)
    expect(m, "放下那段 effect 不在了——这条扫描要跟着改").not.toBeNull()
    const deps = m![1]!.split(",").map((x) => x.trim())
    for (const d of ["sessionId", "侧边id", "rightDockOpen", "rightDockTenant"]) expect(deps).toContain(d)
  })
  it("团队 chip：记下它所属的那一段再切到「团队」格", () => {
    const 段 = app.slice(app.indexOf("const 打开子agent = useCallback"))
    const 体 = 段.slice(0, 段.indexOf("}, [])"))
    expect(体).toMatch(/看团队\(拆\.会话\)[\s\S]*setRightDockTenant\("team"\)/)
  })
  it("坞里那段的推送：快照与 team 更新写进侧边那份", () => {
    const 起 = app.indexOf("if (u.sessionId === $侧边会话id.get() && u.sessionId !== $activeSessionId.get())")
    expect(起).toBeGreaterThan(0)
    const 体 = app.slice(起, app.indexOf("return", 起))
    expect(体).toContain("$侧边团队.set(u.snapshot.team)")
    expect(体).toContain('if (u.type === "team") $侧边团队.set(u.team)')
  })
  it("跳号自愈那一路（resyncSide）也带上团队", () => {
    const sync = readFileSync(join(__dirname, "../../src/ui/state/sync.ts"), "utf8")
    const 体 = sync.slice(sync.indexOf("export function resyncSide"))
    expect(体.slice(0, 体.indexOf("\n}\n"))).toContain("$侧边团队.set(snap.team)")
  })
})
