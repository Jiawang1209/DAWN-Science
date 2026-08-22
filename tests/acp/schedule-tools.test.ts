/** 对话里建定时任务（第二档）：三件工具；「拦危险的」档建成暂停的并让模型把这一点说给人 */
import { describe, expect, it } from "vitest"
import { 工具清单, 建调用, type 工具装配 } from "../../src/acp/tools.js"

function 装配(档: "allow-all" | "deny-risky"): { 装: 工具装配; 建过: unknown[]; 删过: string[] } {
  const 建过: unknown[] = []
  const 删过: string[] = []
  const 装: 工具装配 = {
    项目of: () => "p",
    列技能: async () => [],
    查溯源: () => undefined,
    记一笔: () => {},
    定时: {
      建: async (_sid, req) => {
        建过.push(req)
        return { id: "sch-1", name: req.name, status: 档 === "deny-risky" ? "paused" : "active", where: "/w", nextAt: "2026-08-23T01:00:00.000Z" }
      },
      列: async () => [{ id: "sch-1", name: "早报", status: "active", schedule: { kind: "daily", time: "09:00" }, lastRun: { status: "succeeded", summary: "都好" } }],
      删: async (id) => { 删过.push(id) },
    },
  }
  return { 装, 建过, 删过 }
}

describe("dawn_schedule_*", () => {
  it("清单里有三件", () => {
    expect(工具清单(false).map((t) => t.name)).toEqual(expect.arrayContaining(["dawn_schedule_create", "dawn_schedule_list", "dawn_schedule_delete"]))
  })
  it("建：按 kind 组计划、带本机时区；「拦危险的」档回话里说清是暂停的、要人去恢复", async () => {
    const { 装, 建过 } = 装配("deny-risky")
    const 调 = 建调用(装)
    const r = await 调("s1", "dawn_schedule_create", { name: "早报", prompt: "看数据", kind: "daily", time: "09:00" })
    expect(建过[0]).toMatchObject({ name: "早报", schedule: { kind: "daily", time: "09:00", timeZone: expect.any(String) } })
    expect(r.文本).toContain("暂停")
    expect(r.文本).toContain("恢复")
    const r2 = await 建调用(装配("allow-all").装)("s1", "dawn_schedule_create", { name: "x", prompt: "y", kind: "weekly", weekdays: ["MO"], time: "08:00" })
    expect(r2.文本).not.toContain("暂停")
    expect(r2.文本).toContain("下一次")
  })
  it("列与删", async () => {
    const { 装, 删过 } = 装配("allow-all")
    const 调 = 建调用(装)
    expect((await 调("s1", "dawn_schedule_list", {})).文本).toContain("早报")
    expect((await 调("s1", "dawn_schedule_list", {})).文本).toContain("都好")
    await 调("s1", "dawn_schedule_delete", { id: "sch-1" })
    expect(删过).toEqual(["sch-1"])
  })
  it("没装配定时：如实说，不假装", async () => {
    const 装 = 装配("allow-all").装
    delete 装.定时
    const r = await 建调用(装)("s1", "dawn_schedule_list", {})
    expect(r).toMatchObject({ 出错: true, 文本: expect.stringContaining("没有装配") })
  })
})
