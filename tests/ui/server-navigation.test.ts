import { expect, it } from "vitest"
import type { RemoteConnection } from "../../src/protocol/index.js"
import { buildServerGroups } from "../../src/ui/server-navigation.js"
const connection = (id: string, sortOrder = 0): RemoteConnection => ({
  id, label: id, host: "example.org", port: 22, username: "researcher",
  hasSecret: false, sortOrder, createdAt: "2026-10-11T00:00:00.000Z", state: { kind: "idle" },
})
it("无会话连接也常驻；孤立远端历史保留；本机会话不进入服务器", () => {
  const groups = buildServerGroups([connection("s1")], [{}, { connectionId: "s2" }])
  expect(groups.map(g => g.id)).toEqual(["s1", "s2"])
  expect(groups[0]?.tasks).toEqual([])
  expect(groups[1]?.connection).toBeUndefined()
  expect(groups[1]?.tasks).toEqual([{ connectionId: "s2" }])
})
it("按连接排序，多会话合并在一台服务器下", () => {
  const groups = buildServerGroups([connection("s1", 2), connection("s2", 1)], [{ connectionId: "s1" }, { connectionId: "s1" }])
  expect(groups.map(g => g.id)).toEqual(["s2", "s1"])
  expect(groups[1]?.tasks).toHaveLength(2)
})
