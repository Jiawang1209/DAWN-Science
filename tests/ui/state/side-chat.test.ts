/**
 * 坞里那段对话挂的是谁，按「地方」记住（2026-09-24，侧边对话）。
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  $侧边会话id, $侧边地方, $侧边能读主, 侧槽, 挂进坞, 从坞拿下, 载入侧边, 侧边地方键, 能进坞, SIDE_SESSION_KEY,
  从坞表抹掉, 放进坞的做法, 换到主区的做法, 临时地方, 同处的会话, 在会话那一组,
} from "../../../src/ui/state/side-chat.js"
import { 是散的任务 } from "../../../src/ui/state/catalog.js"

/** 模块级 atom 不随用例清：不重置的话，用例的结果取决于排在它前面的是谁（Task 6 审查 M7） */
beforeEach(() => {
  localStorage.clear()
  $侧边会话id.set(undefined)
  $侧边地方.set(undefined)
  $侧边能读主.set(undefined)
  侧槽.reset()
})

describe("侧边会话按地方记住", () => {
  it("挂上、换地方、回来还在", () => {
    挂进坞("p:1", "s1")
    expect($侧边会话id.get()).toBe("s1")
    载入侧边("p:2")
    expect($侧边会话id.get()).toBeUndefined()
    载入侧边("p:1")
    expect($侧边会话id.get()).toBe("s1")
    从坞拿下("p:1")
    载入侧边("p:1")
    expect($侧边会话id.get()).toBeUndefined()
  })
  it("地方键：项目按 id、远端按连接", () => {
    expect(侧边地方键({ projectId: "P" })).toBe("p:P")
    expect(侧边地方键({ projectId: "T", remote: { connectionId: "C" } })).toBe("r:C")
  })
  it("表里值不是字符串的那几格不认", () => {
    localStorage.setItem(SIDE_SESSION_KEY, JSON.stringify({ "p:1": 42, "p:2": "s2", "p:3": { id: "x" } }))
    载入侧边("p:1")
    expect($侧边会话id.get()).toBeUndefined()
    载入侧边("p:2")
    expect($侧边会话id.get()).toBe("s2")
    载入侧边("p:3")
    expect($侧边会话id.get()).toBeUndefined()
  })
  it("localStorage 抛错也不塌", () => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error("quota") }
    expect(() => 挂进坞("p:1", "s1")).not.toThrow()
    Storage.prototype.setItem = orig
  })
  it("记住挂在哪个地方；拿下不给地方时用它", () => {
    挂进坞("p:1", "s1")
    expect($侧边地方.get()).toBe("p:1")
    从坞拿下()
    expect($侧边会话id.get()).toBeUndefined()
    // 表里那一格也删了：回到这个地方不会再挂回来
    载入侧边("p:1")
    expect($侧边会话id.get()).toBeUndefined()
  })
  it("侧栏「会话」那一组的会话落在共用的地方 `t:`（2026-09-25 作者定的；判据与侧栏同一个，审查 I1）", () => {
    // 与界面手上的形状一致：SessionSummary.projectId 必填，临时会话的是它那个宿主项目；分组看的是任务
    const 任务们 = [
      { sessionId: "t1" },
      { sessionId: "t2" },
      { sessionId: "p1", workspace: "/proj" },
      { sessionId: "r1", connectionId: "C" },
    ]
    expect(临时地方).toBe("t:")
    expect(侧边地方键({ sessionId: "t1", projectId: "TMP" }, 任务们)).toBe("t:")
    // 宿主不止一个也是同一处：「会话」那一组不按宿主劈开
    expect(侧边地方键({ sessionId: "t2", projectId: "TMP2" }, 任务们)).toBe("t:")
    expect(侧边地方键({ sessionId: "p1", projectId: "P" }, 任务们)).toBe("p:P")
    // 远端的仍按连接算——远端的地方是那台机器，不是那个宿主项目
    expect(侧边地方键({ sessionId: "r1", projectId: "TMP", remote: { connectionId: "C" } }, 任务们)).toBe("r:C")
    // 任务单里还没有它：按项目算（侧栏那边同样还没把它列进「会话」）
    expect(侧边地方键({ sessionId: "t1", projectId: "TMP" }, [])).toBe("p:TMP")
    // 只选了项目、没选会话：按项目
    expect(侧边地方键({ projectId: "P" }, 任务们)).toBe("p:P")
    // 什么都没有：仍然没有地方（坞格说「还没选项目」）
    expect(侧边地方键({}, 任务们)).toBeUndefined()
  })
  it("占着临时根的普通项目当宿主（ensureTemporary 复用它、不改标记）：散的会话是 `t:`，它自己的项目会话是 `p:`（审查 I1）", () => {
    // X 不是 temporary——旧版按 `temporary` 判，把 x-散 算成 `p:X`，另开一段就拿临时根本身建了一段项目会话
    const 任务们 = [{ sessionId: "x-散" }, { sessionId: "x-项目", workspace: "/home/u/DAWN/scratch" }]
    expect(侧边地方键({ sessionId: "x-散", projectId: "X" }, 任务们)).toBe("t:")
    expect(侧边地方键({ sessionId: "x-项目", projectId: "X" }, 任务们)).toBe("p:X")
    expect(在会话那一组({ sessionId: "x-散" }, 任务们)).toBe(true)
    expect(在会话那一组({ sessionId: "x-项目" }, 任务们)).toBe(false)
    // 判据就是侧栏分组那一个
    expect(是散的任务({})).toBe(true)
    expect(是散的任务({ workspace: "/a" })).toBe(false)
    expect(是散的任务({ connectionId: "C" })).toBe(false)
  })
  it("临时会话那一处挂的那段，换到项目再换回来还在；与项目那一处互不相干", () => {
    挂进坞("p:1", "s1")
    挂进坞(临时地方, "t1")
    expect($侧边会话id.get()).toBe("t1")
    expect($侧边地方.get()).toBe("t:")
    载入侧边("p:1")
    expect($侧边会话id.get()).toBe("s1")
    载入侧边(侧边地方键({ sessionId: "t1", projectId: "TMP" }, [{ sessionId: "t1" }]))
    expect($侧边会话id.get()).toBe("t1")
  })
  it("不知道地方也照清槽与两个 atom", () => {
    挂进坞("p:1", "s1")
    $侧边能读主.set(true)
    侧槽.setItems([{ type: "turn", id: "t1", who: "user", text: "你好", final: true } as never])
    $侧边地方.set(undefined)
    从坞拿下()
    expect($侧边会话id.get()).toBeUndefined()
    expect($侧边能读主.get()).toBeUndefined()
    expect(侧槽.$items.get()).toEqual([])
    // 表没动（不知道是哪一格），换回去仍在——这是「不知道地方」唯一能诚实做到的
    载入侧边("p:1")
    expect($侧边会话id.get()).toBe("s1")
  })
})

describe("能进坞：终端不是对话", () => {
  it("pty 不进；原生 / acp / 没写 kind 的都进", () => {
    expect(能进坞({ kind: "pty" })).toBe(false)
    expect(能进坞({ kind: "native" })).toBe(true)
    expect(能进坞({ kind: "acp" })).toBe(true)
    expect(能进坞({})).toBe(true)
  })
})

describe("删掉 / 归档：表里所有指向它的都抹掉（审查 M6）", () => {
  it("别处挂着的那段也抹；整个删掉的地方不论挂着谁都抹；别的不动", () => {
    挂进坞("p:1", "s1")
    挂进坞("p:2", "s2")
    挂进坞("r:C", "s3")
    挂进坞("p:9", "s9")
    // 此刻载着的是 p:9；删 s1（挂在 p:1）、删掉整个项目 p:2
    从坞表抹掉(["s1", undefined], ["p:2"])
    const 表 = JSON.parse(localStorage.getItem(SIDE_SESSION_KEY) ?? "{}") as Record<string, string>
    expect(表).toEqual({ "r:C": "s3", "p:9": "s9" })
    载入侧边("p:1")
    expect($侧边会话id.get()).toBeUndefined()
  })
  it("临时会话那一处也按 id 抹（归档 / 删了坞里那段临时会话）", () => {
    挂进坞(临时地方, "t1")
    挂进坞("p:1", "s1")
    从坞表抹掉(["t1"])
    const 表 = JSON.parse(localStorage.getItem(SIDE_SESSION_KEY) ?? "{}") as Record<string, string>
    expect(表).toEqual({ "p:1": "s1" })
  })
})

describe("放进坞的做法（从 App 拆出来的判定，审查 M7）", () => {
  const 同处 = [{ sessionId: "a" }, { sessionId: "b" }, { sessionId: "t", kind: "pty" }]
  it("没地方 / 终端：说一句，不做", () => {
    expect(放进坞的做法({ id: "b", 地方: undefined, 主区: "a", 在坞: undefined, 同处 })).toEqual({ 做: "说", 因为: "没地方" })
    expect(放进坞的做法({ id: "t", 地方: "p:1", 主区: "a", 在坞: undefined, 同处 })).toEqual({ 做: "说", 因为: "终端" })
  })
  it("放别的页签：直接挂，主区不动", () => {
    expect(放进坞的做法({ id: "b", 地方: "p:1", 主区: "a", 在坞: undefined, 同处 })).toEqual({ 做: "挂", 地方: "p:1", id: "b" })
  })
  it("放主区这段：主区先切到同处另一段，优先不在坞里的那段", () => {
    expect(放进坞的做法({ id: "a", 地方: "p:1", 主区: "a", 在坞: "b", 同处 })).toEqual({ 做: "挂", 地方: "p:1", id: "a", 然后主区切到: "t" })
    // 同处只剩坞里那段：两段对调
    expect(放进坞的做法({ id: "a", 地方: "p:1", 主区: "a", 在坞: "b", 同处: [{ sessionId: "a" }, { sessionId: "b" }] })).toEqual({
      做: "挂", 地方: "p:1", id: "a", 然后主区切到: "b",
    })
  })
  it("只有这一段：说一句，不做", () => {
    expect(放进坞的做法({ id: "a", 地方: "p:1", 主区: "a", 在坞: undefined, 同处: [{ sessionId: "a" }] })).toEqual({ 做: "说", 因为: "只有这一段" })
  })
})

describe("同处的会话：按地方从哪拨里挑", () => {
  const sessions = [
    { sessionId: "p1", projectId: "P" },
    { sessionId: "q1", projectId: "Q" },
  ]
  const tempSessions = [
    { sessionId: "t1", projectId: "TMP" },
    { sessionId: "t2", projectId: "TMP2" },
    { sessionId: "r1", projectId: "TMP", remote: { connectionId: "C" } },
    { sessionId: "r2", projectId: "TMP", remote: { connectionId: "D" } },
  ]
  const tasks = [{ sessionId: "t1" }, { sessionId: "t2" }, { sessionId: "p1", workspace: "/p" }, { sessionId: "r1", connectionId: "C" }]
  const ids = (地方: string) => 同处的会话(地方, { sessions, tempSessions, tasks }).map((x) => x.sessionId)
  it("项目：只要这个项目的；远端：只要这条连接的", () => {
    expect(ids("p:P")).toEqual(["p1"])
    expect(ids("r:C")).toEqual(["r1"])
  })
  it("临时会话那一处：本机的临时会话全列（不分宿主），远端的一段不列", () => {
    expect(ids(临时地方)).toEqual(["t1", "t2"])
  })
  it("占着临时根的普通项目 X：`t:` 恰好列侧栏「会话」那一组，`p:X` 只列它的项目会话（审查 I1）", () => {
    // `listTemporarySessions` 经 `temporaryHosts` 把 X 名下**全部**会话都放进 tempSessions；X 是当前项目时 sessions 也有它们
    const X的 = [
      { sessionId: "x-散", projectId: "X" },
      { sessionId: "x-项目", projectId: "X" },
    ]
    const 任务们 = [{ sessionId: "x-散" }, { sessionId: "x-项目", workspace: "/home/u/DAWN/scratch" }]
    const 列 = (地方: string) =>
      同处的会话(地方, { sessions: X的, tempSessions: X的, tasks: 任务们 }).map((x) => x.sessionId)
    expect(列(临时地方)).toEqual(["x-散"])
    expect(列("p:X")).toEqual(["x-项目"])
    // 同一个判据两头对得上：列在 `t:` 的每一段，自己的地方键也是 `t:`
    for (const x of 同处的会话(临时地方, { sessions: X的, tempSessions: X的, tasks: 任务们 })) expect(侧边地方键(x, 任务们)).toBe("t:")
    // 没有任务的（任务单还没到手）哪边都不算「会话」那一组
    expect(同处的会话(临时地方, { sessions: [], tempSessions: X的, tasks: [] })).toEqual([])
  })
})

describe("临时会话那一处：放进坞 / 换到主区与项目一样走", () => {
  it("放进坞：别的临时会话直接挂；放主区这段先切到另一段", () => {
    const 同处 = [{ sessionId: "t1" }, { sessionId: "t2" }]
    expect(放进坞的做法({ id: "t2", 地方: 临时地方, 主区: "t1", 在坞: undefined, 同处 })).toEqual({ 做: "挂", 地方: "t:", id: "t2" })
    expect(放进坞的做法({ id: "t1", 地方: 临时地方, 主区: "t1", 在坞: undefined, 同处 })).toEqual({
      做: "挂", 地方: "t:", id: "t1", 然后主区切到: "t2",
    })
  })
  it("换到主区：两段临时会话对调", () => {
    expect(换到主区的做法({ 地方: 临时地方, 在坞: "t2", 原主: "t1", 原主那段: { kind: "native" } })).toEqual({
      做: "对调", 地方: "t:", 上主区: "t2", 进坞: "t1", 说终端: false,
    })
  })
})

describe("换到主区的做法（审查 M7）", () => {
  it("没挂着 / 没地方：不做", () => {
    expect(换到主区的做法({ 地方: "p:1", 在坞: undefined, 原主: "a", 原主那段: {} })).toEqual({ 做: "不做" })
    expect(换到主区的做法({ 地方: undefined, 在坞: "b", 原主: "a", 原主那段: {} })).toEqual({ 做: "不做" })
  })
  it("原主是对话：对调", () => {
    expect(换到主区的做法({ 地方: "p:1", 在坞: "b", 原主: "a", 原主那段: { kind: "native" } })).toEqual({
      做: "对调", 地方: "p:1", 上主区: "b", 进坞: "a", 说终端: false,
    })
  })
  it("原主是终端：不进坞，坞空出来并说一句", () => {
    expect(换到主区的做法({ 地方: "p:1", 在坞: "b", 原主: "t", 原主那段: { kind: "pty" } })).toEqual({
      做: "对调", 地方: "p:1", 上主区: "b", 进坞: undefined, 说终端: true,
    })
  })
  it("主区原来空着：坞空出来，不说终端", () => {
    expect(换到主区的做法({ 地方: "p:1", 在坞: "b", 原主: undefined, 原主那段: undefined })).toEqual({
      做: "对调", 地方: "p:1", 上主区: "b", 进坞: undefined, 说终端: false,
    })
  })
})
