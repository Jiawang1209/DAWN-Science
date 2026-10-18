import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { AnalysisRoutePanel, AnalysisRouteSummary } from "../../src/ui/analysis-route.js"
import { route } from "./analysis-route-fixture.js"
afterEach(cleanup)
const props = () => ({
  result: { supported: true, route: route() },
  onReload: vi.fn(async () => {}),
  onAction: vi.fn(async () => {}),
  onCreate: vi.fn(async () => {}),
  readFile: vi.fn(async () => ({ kind: "text" as const, text: "# Report", bytes: 8, mediaType: "text/markdown" })),
  loadGalleryRoots: vi.fn(async () => ({ mlai: "http://127.0.0.1:8765" })),
  onOpenWeb: vi.fn(),
  onOpenExternally: vi.fn(),
})
describe("session analysis route", () => {
  it("summary is compact and only opens the dock on click", () => {
    const open = vi.fn()
    render(<AnalysisRouteSummary route={route()} onOpen={open} />)
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button"))
    expect(open).toHaveBeenCalledOnce()
    expect(screen.getByRole("button").textContent).toContain("0 / 1")
  })
  it("empty route requests planning only and unsupported sessions explain why", async () => {
    const p = props()
    const { rerender } = render(<AnalysisRoutePanel {...p} result={{ supported: true }} />)
    fireEvent.click(screen.getByRole("button", { name: "建立分析路线" }))
    await waitFor(() => expect(p.onCreate).toHaveBeenCalledOnce())
    rerender(<AnalysisRoutePanel {...p} result={{ supported: false, reason: "ACP 暂不支持" }} />)
    expect(screen.getByText("ACP 暂不支持")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "建立分析路线" })).toBeNull()
  })
  it("expands step inputs and keeps metadata selection separate from view/search/continue", async () => {
    const p = props()
    const r = route()
    r.steps[0]!.cases = [
      { server: "mlai", caseId: "full-case-id", title: "真实案例", coverage: "仅输入核对", evidence: "metadata" },
    ]
    render(<AnalysisRoutePanel {...p} result={{ supported: true, route: r }} />)
    expect(screen.getByText("核对")).toBeTruthy()
    expect(screen.getByText("仅元数据")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "选为参考" }))
    await waitFor(() =>
      expect(p.onAction).toHaveBeenCalledWith("S1", "select", { server: "mlai", caseId: "full-case-id" }),
    )
    fireEvent.click(screen.getByRole("button", { name: "查看步骤" }))
    await waitFor(() => expect(p.onAction).toHaveBeenCalledWith("S1", "view", undefined))
    fireEvent.click(screen.getByRole("button", { name: "补找案例" }))
    await waitFor(() => expect(p.onAction).toHaveBeenCalledWith("S1", "search", undefined))
    fireEvent.click(screen.getByRole("button", { name: "继续这一步" }))
    await waitFor(() => expect(p.onAction).toHaveBeenCalledWith("S1", "continue", undefined))
    fireEvent.click(screen.getByRole("button", { name: "看案例详情" }))
    expect(p.onOpenWeb).toHaveBeenCalledWith("http://127.0.0.1:8765/gallery/case/full-case-id")
  })
  it("busy and blocked explain disabled continue while local disclosure remains accessible", () => {
    const p = props()
    const r = route()
    r.steps[0]!.blockers = ["缺少样本表"]
    const { rerender } = render(<AnalysisRoutePanel {...p} result={{ supported: true, route: r }} />)
    expect(screen.getByText("缺少样本表")).toBeTruthy()
    expect((screen.getByRole("button", { name: "继续这一步" }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<AnalysisRoutePanel {...p} busy />)
    expect(screen.getByText("会话忙碌，请等当前回合结束")).toBeTruthy()
    expect((screen.getByRole("button", { name: /S1/ }) as HTMLButtonElement).disabled).toBe(false)
  })
  it("stale mutation reports error, refreshes but never automatically replays", async () => {
    const p = props()
    p.onAction = vi.fn(async () => {
      throw Object.assign(Error("版本过期"), { details: { code: "STALE_ROUTE" } })
    })
    render(<AnalysisRoutePanel {...p} />)
    fireEvent.click(screen.getByRole("button", { name: "跳过此步" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("版本过期"))
    expect(p.onAction).toHaveBeenCalledOnce()
    expect(p.onReload).toHaveBeenCalledOnce()
  })
  it("agent completed is distinct from unobserved/cross-step execution and actual file facts", () => {
    const p = props()
    const r = route()
    r.steps[0]!.execution = { state: "completed", note: "Agent 自报完成", toolCallIds: ["tool-other", "denied"] }
    r.steps[0]!.deliverables = [{ path: "results/report.md" }]
    render(
      <AnalysisRoutePanel
        {...p}
        result={{
          supported: true,
          route: r,
          evidence: {
            tools: [
              { toolCallId: "tool-other", name: "bash", status: "done", stepId: "S2", execution: "ran" },
              { toolCallId: "denied", name: "bash", status: "done", stepId: "S1", execution: "not_observed" },
            ],
            deliverables: [{ stepId: "S1", path: "results/report.md", state: "missing" }],
          },
        }}
      />,
    )
    fireEvent.click(screen.getByText("证据详情"))
    expect(screen.getByText(/Agent 自报完成/)).toBeTruthy()
    expect(screen.getByText("未观察到本步运行")).toBeTruthy()
    expect(screen.getByText("文件缺失")).toBeTruthy()
    expect(screen.queryByText("已观察到本步运行")).toBeNull()
  })
  it("a failed real execution is observed and historical versions never borrow current tool observations", () => {
    const p = props()
    const r = route(2)
    render(
      <AnalysisRoutePanel
        {...p}
        result={{
          supported: true,
          route: r,
          history: [route(1)],
          evidence: {
            tools: [{ toolCallId: "failed", name: "bash", status: "error", stepId: "S1", execution: "failed" }],
            deliverables: [],
          },
        }}
      />,
    )
    fireEvent.click(screen.getByText("证据详情"))
    expect(screen.getByText("已观察到本步运行")).toBeTruthy()
    fireEvent.change(screen.getByRole("combobox", { name: "路线版本" }), { target: { value: "1" } })
    expect(screen.queryByText("已观察到本步运行")).toBeNull()
  })
  it("does not present current metadata as a missing selected history revision", () => {
    const p = props()
    const { rerender } = render(
      <AnalysisRoutePanel {...p} result={{ supported: true, route: route(2), history: [route(1)] }} />,
    )
    fireEvent.change(screen.getByRole("combobox", { name: "路线版本" }), { target: { value: "1" } })
    rerender(<AnalysisRoutePanel {...p} result={{ supported: true, route: route(3), history: [] }} />)
    expect(screen.queryByText("历史版本暂不可用，请刷新或查看当前路线")).toBeTruthy()
  })
  it("pins the operated step when its progress changes", async () => {
    const p = props()
    const r = route()
    r.steps.push({ ...r.steps[0]!, id: "S2", title: "下一步" })
    const { rerender } = render(<AnalysisRoutePanel {...p} result={{ supported: true, route: r }} />)
    fireEvent.click(screen.getByRole("button", { name: "跳过此步" }))
    await waitFor(() => expect(p.onAction).toHaveBeenCalledOnce())
    const next = structuredClone(r)
    next.revision++
    next.steps[0]!.status = "skipped"
    rerender(<AnalysisRoutePanel {...p} result={{ supported: true, route: next }} />)
    expect(screen.getByRole("button", { name: "恢复此步" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /S2/ }).getAttribute("aria-expanded")).toBe("false")
  })
  it("ignores late file content after a different path was chosen", async () => {
    const p = props()
    const r = route()
    r.steps[0]!.deliverables = [{ path: "results/old.md" }, { path: "results/new.md" }]
    let resolveOld!: (value: Awaited<ReturnType<typeof p.readFile>>) => void
    const old = new Promise<Awaited<ReturnType<typeof p.readFile>>>((resolve) => {
      resolveOld = resolve
    })
    const readFile = vi
      .fn()
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce({ kind: "text", text: "New content", mediaType: "text/markdown", bytes: 11 })
    render(<AnalysisRoutePanel {...p} readFile={readFile} result={{ supported: true, route: r }} />)
    fireEvent.click(screen.getByRole("button", { name: "results/old.md" }))
    await waitFor(() => expect(readFile).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: "results/new.md" }))
    await waitFor(() => expect(screen.getByText("New content")).toBeTruthy())
    resolveOld({ kind: "text", text: "Old content", mediaType: "text/markdown", bytes: 11 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText("Old content")).toBeNull()
  })
  it("missing files fail visibly and can be retried without a model action", async () => {
    const p = props()
    const r = route()
    r.steps[0]!.deliverables = [{ path: "results/report.md" }]
    const readFile = vi
      .fn()
      .mockRejectedValueOnce(Error("File not found"))
      .mockResolvedValueOnce({ kind: "text", text: "Recovered", mediaType: "text/markdown", bytes: 9 })
    render(<AnalysisRoutePanel {...p} readOnly readFile={readFile} result={{ supported: true, route: r }} />)
    fireEvent.click(screen.getByRole("button", { name: "results/report.md" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("File not found"))
    fireEvent.click(screen.getByRole("button", { name: /^重试$/ }))
    await waitFor(() => expect(screen.getByText("Recovered")).toBeTruthy())
    expect(p.onAction).not.toHaveBeenCalled()
  })
  it("file preview keeps the list above it and closes locally even in read-only history", async () => {
    const p = props()
    const r = route()
    r.steps[0]!.deliverables = [{ path: "results/report.md" }]
    render(<AnalysisRoutePanel {...p} result={{ supported: true, route: r, history: [r] }} />)
    fireEvent.click(screen.getByRole("button", { name: "results/report.md" }))
    await waitFor(() => expect(p.readFile).toHaveBeenCalledWith("results/report.md"))
    await waitFor(() => expect(screen.getByRole("button", { name: "展开阅读" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "收起预览" }))
    expect(screen.queryByRole("button", { name: "展开阅读" })).toBeNull()
    fireEvent.change(screen.getByRole("combobox", { name: "路线版本" }), { target: { value: "1" } })
    expect(screen.getByText(/历史文件预览读取当前路径/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "继续这一步" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "results/report.md" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "展开阅读" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "展开阅读" }))
    expect(screen.getByText("历史预览：此处读取当前文件").closest("[hidden]")).toBeNull()
  })
})
