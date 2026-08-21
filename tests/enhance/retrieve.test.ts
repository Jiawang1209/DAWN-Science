import { describe, expect, it, vi } from "vitest"
import { 取窗, 找相关的对话, 有开发意图, 抽关键词, 按关键词排文件, 取片段, 挑文档, 读JSON, 该跳过, type 一句 } from "../../src/enhance/retrieve.js"

const 历史: 一句[] = [
  { who: "user", text: "第1轮问" },
  { who: "agent", text: "第1轮答" },
  { who: "user", text: "第2轮问" },
  { who: "agent", text: "第2轮答" },
  { who: "agent", text: "第2轮补" },
  { who: "user", text: "第3轮问" },
  { who: "agent", text: "第3轮答" },
]

describe("切窗", () => {
  it("1 = 最近一轮；一轮 = 一句用户 + 之后的回答；按时间正序输出", () => {
    expect(取窗(历史, 1, 1)).toBe("[用户] 第3轮问\n[助手] 第3轮答")
    expect(取窗(历史, 2, 3)).toBe("[用户] 第1轮问\n[助手] 第1轮答\n[用户] 第2轮问\n[助手] 第2轮答\n[助手] 第2轮补")
  })
  it("越界回空串，不夹成别的数据", () => {
    expect(取窗(历史, 6, 10)).toBe("")
    expect(取窗(历史, 3, 5)).toBe("[用户] 第1轮问\n[助手] 第1轮答")
  })
})

describe("逐窗判定，命中即止", () => {
  it("第二窗命中就停，不问第三窗；判定失败 / 解析不出当不相关", async () => {
    const 问 = vi.fn(async ({ user }: { user: string }) => (user.includes("第2轮") ? '{"related": true}' : "胡说八道"))
    const r = await 找相关的对话(历史, "当前", 问, { 窗口: [[1, 1], [2, 3], [4, 5]] })
    expect(r?.窗).toEqual([2, 3])
    expect(问).toHaveBeenCalledTimes(2)
  })
  it("全没命中 → undefined；空窗不问", async () => {
    const 问 = vi.fn(async () => '{"related": false}')
    expect(await 找相关的对话(历史, "当前", 问)).toBeUndefined()
    // 三个标准窗里 [6,10] 是空的，不该问
    expect(问).toHaveBeenCalledTimes(2)
  })
  it("判定抛错按不相关", async () => {
    expect(await 找相关的对话(历史, "当前", async () => { throw new Error("网断了") })).toBeUndefined()
    expect(await 有开发意图("x", "", async () => { throw new Error("x") })).toBe(false)
    expect(await 有开发意图("x", "", async () => '{"isDevIntent": true}')).toBe(true)
  })
  it("读JSON：从一段话里抠出对象；不合法回 undefined", () => {
    expect(读JSON('好的：{"a":1} 就这样')).toEqual({ a: 1 })
    expect(读JSON("没有")).toBeUndefined()
  })
})

describe("关键词：中英混排都抽", () => {
  it("路径整个留、CamelCase / snake_case 拆、中文按虚词切、停词去掉、最多 8 个", () => {
    const k = 抽关键词("帮我看看 src/remote/ssh.ts 里的 RemoteExecutor 和 login_env 为什么断线重连之后继不上")
    expect(k).toContain("src/remote/ssh.ts")
    expect(k).toContain("remote")
    expect(k).toContain("executor")
    expect(k).toContain("login")
    expect(k).toContain("env")
    expect(k.some((x) => x.includes("断线重连"))).toBe(true)
    expect(k).not.toContain("the")
    expect(k.length).toBeLessThanOrEqual(8)
  })
  it("英文句子也抽得出", () => {
    const k = 抽关键词("make the scatter plot in plotting.py look nicer")
    expect(k).toContain("plotting.py")
    expect(k).toContain("scatter")
    expect(k).not.toContain("the")
  })
})

describe("工作区：打不中就不带", () => {
  const 文件 = ["README.md", "docs/远端文件与右侧坞-design.md", "src/remote/ssh.ts", "src/ui/files.tsx", "node_modules/x/ssh.md", "secrets/token.md", "notes.log"]
  it("文件名命中 +3、路径命中 +2；忽略目录与敏感文件跳过；一个都没命中回空", () => {
    expect(按关键词排文件(文件, ["ssh"], 5)).toEqual(["src/remote/ssh.ts"])
    expect(按关键词排文件(文件, ["remote"], 5)).toEqual(["src/remote/ssh.ts"])
    expect(按关键词排文件(文件, ["不存在的词"], 5)).toEqual([])
    expect(按关键词排文件(文件, [], 5)).toEqual([])
    expect(该跳过("secrets/token.md")).toBe(true)
    expect(该跳过(".env.local")).toBe(true)
    expect(该跳过("src/a.ts")).toBe(false)
  })
  it("片段 = 命中行 ±2 行；没命中回 undefined，不拿前 40 行充数", () => {
    const 内容 = Array.from({ length: 20 }, (_, i) => (i === 10 ? "这里提到 ssh 重连" : `第${i}行`)).join("\n")
    const p = 取片段(内容, ["ssh"])!
    expect(p.split("\n")).toEqual(["第8行", "第9行", "这里提到 ssh 重连", "第11行", "第12行"])
    expect(取片段(内容, ["没有的"])).toBeUndefined()
    expect(取片段(内容, ["ssh"], 10)!.endsWith("…")).toBe(true)
  })
  it("挑文档：按模型选的路径过滤；有项目地图才给代码目录；解析不出一个都不选", async () => {
    const 候选 = [
      { path: "README.md", 片段: "目录树 src/" },
      { path: "docs/a.md", 片段: "别的" },
    ]
    const r = await 挑文档(候选, "加个功能", async () => '{"relatedDocs":["README.md"],"hasProjectMap":true,"codePaths":["src/"]}')
    expect(r.选中.map((c) => c.path)).toEqual(["README.md"])
    expect(r.codePaths).toEqual(["src/"])
    const r2 = await 挑文档(候选, "x", async () => '{"relatedDocs":["docs/a.md"],"hasProjectMap":false,"codePaths":["src/"]}')
    expect(r2.codePaths).toEqual([])
    expect((await 挑文档(候选, "x", async () => "???")).选中).toEqual([])
  })
})
