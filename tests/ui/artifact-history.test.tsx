import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { ArtifactHistoryPanel } from "../../src/ui/artifact-history.js"
import type { WorkbenchClient } from "../../src/ui/client.js"

const observation = {
  id: "o",
  projectId: "p",
  workspace: "/w",
  sessionId: "s",
  fileId: "f",
  path: "a.csv",
  sha256: "a".repeat(64),
  bytes: 4,
  createdAt: "2026-10-27T18:00:00Z",
  relation: "changed",
  attribution: "observed",
  gaps: [],
}
const execution = {
  tool: "notebook",
  language: "python",
  code: "print(1)",
  gaps: ["变量状态未捕获"],
  dispatch: "completed",
}
const saved = {
  id: "g",
  projectId: "p",
  requestId: "r",
  name: "a.csv · 第一版",
  note: "",
  createdAt: "2026-10-27T18:01:00Z",
  state: "ready",
  members: [
    {
      id: "m",
      observation,
      execution,
      inputs: [],
      sha256: observation.sha256,
      bytes: 4,
    },
  ],
}
function fixture() {
  let groups: unknown[] = []
  const get = vi.fn(async (op: string, _args?: unknown): Promise<any> => {
    if (op === "getArtifactHistory")
      return { supported: true, observations: [observation] }
    if (op === "getArtifactSource")
      return { observation, execution, inputs: [] }
    if (op === "listRetainedResults")
      return {
        supported: true,
        results: groups,
        limits: {
          fileBytes: 50 * 1024 * 1024,
          groupBytes: 200 * 1024 * 1024,
          projectBytes: 1024 * 1024 * 1024,
        },
      }
    if (op === "retainArtifactResults") {
      groups = [saved]
      return saved
    }
    if (op === "readRetainedArtifact")
      return {
        path: "a.csv",
        content: {
          kind: "table",
          mediaType: "text/csv",
          bytes: 4,
          table: {
            columns: [{ name: "n", inferred: "整数", missing: 0 }],
            rows: [["4"]],
            rowsRead: 1,
            totalRows: 1,
            delimiter: ",",
          },
        },
      }
    if (op === "deleteRetainedResult") {
      groups = []
      return { deleted: true }
    }
    return { state: "matched", note: "matching" }
  })
  const props = {
    sessionId: "s",
    client: { get } as unknown as WorkbenchClient,
    paths: ["a.csv"],
    path: "a.csv",
    onClose: vi.fn(),
  }
  return {
    get,
    props,
    setGroups: (g: unknown[]) => {
      groups = g
    },
  }
}
describe("simple artifact retention", () => {
  it("defaults to one-click retention without a form or technical details", async () => {
    const f = fixture()
    render(<ArtifactHistoryPanel {...f.props} />)
    const keep = await screen.findByRole("button", {
      name: "保留当前结果",
    })
    await waitFor(() => expect(keep.hasAttribute("disabled")).toBe(false))
    expect(screen.queryByRole("textbox", { name: "留存名称" })).toBeNull()
    expect(screen.queryByText("print(1)")).toBeNull()
    expect(screen.queryByText(observation.sha256)).toBeNull()
    fireEvent.click(keep)
    await waitFor(() =>
      expect(f.get).toHaveBeenCalledWith(
        "retainArtifactResults",
        expect.objectContaining({
          sessionId: "s",
          name: expect.stringContaining("a.csv"),
          members: [{ observationId: "o", sha256: observation.sha256 }],
        }),
      ),
    )
    await screen.findByText("已保留", { exact: true })
    expect(
      f.get.mock.calls.some(([op]) => op === "captureAndRetainCurrent"),
    ).toBe(false)
  })
  it("reveals source and optional group fields only on request", async () => {
    const f = fixture()
    render(<ArtifactHistoryPanel {...f.props} />)
    await screen.findByRole("button", { name: "保留当前结果" })
    fireEvent.click(screen.getByText("详细来源", { exact: true }))
    await screen.findByText("print(1)")
    expect(screen.getByText("变量状态未捕获")).toBeTruthy()
    fireEvent.click(screen.getByText("更多保留选项", { exact: true }))
    await screen.findByRole("textbox", { name: "留存名称" })
  })
  it("lists only saved versions and opens old bytes directly without raw JSON", async () => {
    const f = fixture()
    f.setGroups([saved])
    render(<ArtifactHistoryPanel {...f.props} path={undefined} />)
    await screen.findByText(saved.name)
    expect(screen.queryByText("print(1)")).toBeNull()
    expect(screen.queryByText(observation.sha256)).toBeNull()
    fireEvent.click(
      screen.getByRole("button", { name: "打开已保留文件 a.csv" }),
    )
    await screen.findByText("正在查看留存副本，工作区当前文件可能不同")
    expect(screen.getByRole("cell", { name: "4" })).toBeTruthy()
    expect(f.get.mock.calls.some(([op]) => op === "getArtifactHistory")).toBe(
      false,
    )
  })
  it("does not replace a drifted historical version with a late capture", async () => {
    const f = fixture(),
      base = f.get.getMockImplementation()!
    f.get.mockImplementation(async (op, args) => {
      if (op === "retainArtifactResults") throw Error("当前文件已变化：a.csv")
      return base(op, args)
    })
    render(<ArtifactHistoryPanel {...f.props} />)
    const keep = await screen.findByRole("button", {
      name: "保留当前结果",
    })
    await waitFor(() => expect(keep.hasAttribute("disabled")).toBe(false))
    fireEvent.click(keep)
    await screen.findByRole("alert")
    expect(
      f.get.mock.calls.some(([op]) => op === "captureAndRetainCurrent"),
    ).toBe(false)
    expect(screen.queryByText("已保留", { exact: true })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "保留更新内容" }))
    await waitFor(() =>
      expect(f.get).toHaveBeenCalledWith(
        "captureAndRetainCurrent",
        expect.objectContaining({ sessionId: "s", path: "a.csv" }),
      ),
    )
  })
  it("ignores the previous scope's late source error", async () => {
    const f = fixture(),
      base = f.get.getMockImplementation()!
    let rejectOld: (e: Error) => void = () => {}
    f.get.mockImplementation(async (op, args) => {
      if (
        op === "getArtifactSource" &&
        (args as { sessionId: string }).sessionId === "s"
      )
        return new Promise((_resolve, reject) => {
          rejectOld = reject
        })
      return base(op, args)
    })
    const screenView = render(<ArtifactHistoryPanel {...f.props} />)
    await waitFor(() =>
      expect(f.get.mock.calls.some(([op]) => op === "getArtifactSource")).toBe(
        true,
      ),
    )
    screenView.rerender(<ArtifactHistoryPanel {...f.props} sessionId="next" />)
    fireEvent.click(screen.getByText("详细来源", { exact: true }))
    await screen.findByText("print(1)")
    await act(async () => rejectOld(Error("stale error")))
    expect(screen.queryByRole("alert")).toBeNull()
  })
  it("does not label externally changed bytes as already saved", async () => {
    const f = fixture()
    f.setGroups([saved])
    const base = f.get.getMockImplementation()!
    f.get.mockImplementation(async (op, args) =>
      op === "checkArtifactCurrent"
        ? { state: "changed", note: "changed" }
        : base(op, args),
    )
    render(<ArtifactHistoryPanel {...f.props} />)
    const keep = await screen.findByRole("button", { name: "保留当前结果" })
    await waitFor(() => expect(keep.hasAttribute("disabled")).toBe(false))
    expect(screen.queryByText("已保留", { exact: true })).toBeNull()
    fireEvent.click(keep)
    await waitFor(() =>
      expect(f.get).toHaveBeenCalledWith(
        "captureAndRetainCurrent",
        expect.objectContaining({ path: "a.csv" }),
      ),
    )
    expect(
      f.get.mock.calls.some(([op]) => op === "retainArtifactResults"),
    ).toBe(false)
  })
  it("keeps unsupported and read-only modes honest", async () => {
    const f = fixture()
    f.get.mockResolvedValue({
      supported: false,
      reason: "此执行位置尚未接入自动来源记录",
      observations: [],
      results: [],
    })
    render(<ArtifactHistoryPanel {...f.props} readOnly />)
    await screen.findByText("此执行位置尚未接入自动来源记录")
    expect(screen.queryByRole("button", { name: "保留当前结果" })).toBeNull()
  })
})
