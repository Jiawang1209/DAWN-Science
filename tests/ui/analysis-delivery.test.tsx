import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AnalysisDeliveryPanel } from "../../src/ui/analysis-delivery.js";
import {
  $deliveryViews,
  setDeliveryView,
} from "../../src/ui/state/delivery.js";
import type { WorkbenchClient } from "../../src/ui/client.js";
import type { DeliveryRecord } from "../../src/protocol/delivery.js";
afterEach(() => {
  cleanup();
  $deliveryViews.set(new Map());
});
const record: DeliveryRecord = {
  id: "d",
  sessionId: "s",
  workspace: "/w",
  name: "草地结果",
  directory: "outputs/delivery/test",
  createdAt: "2026-10-18",
  updatedAt: "2026-10-18",
  mode: "organize",
  state: "organized",
  gaps: [],
  evidence: [],
  files: [
    { path: "outputs/delivery/test/结果解读.md", role: "interpretation" },
  ],
  verification: { state: "not_run", note: "未运行" },
};
function props() {
  const invoke = vi.fn(async (op: string, _r: unknown): Promise<unknown> =>
    op === "listAnalysisDeliveries" ? { supported: true, records: [] } : record,
  );
  return {
    sessionId: "s",
    scopeKey: "s:/w",
    client: { get: invoke } as unknown as WorkbenchClient,
    data: {
      artifacts: [
        {
          path: "results/model.csv",
          kind: "table" as const,
          bornRunId: "r",
          bornAt: "2026",
          exists: true,
        },
      ],
      unknown: [],
    },
    readFile: vi.fn(async () => ({
      kind: "text" as const,
      text: "# 真实结果解读",
      bytes: 20,
      mediaType: "text/markdown",
    })),
    onOpenInFiles: vi.fn(),
    onOpenExternally: vi.fn(),
    invoke,
  };
}
describe("analysis delivery in artifacts", () => {
  it("requires explicit file choice and defaults to organize without execution", async () => {
    const p = props();
    render(<AnalysisDeliveryPanel {...p} />);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "整理交付" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "整理交付" }));
    expect(
      screen.getByRole("button", { name: "下一步" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /model.csv/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(
      (screen.getByRole("radio", { name: /仅整理/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("交付名称"), {
      target: { value: "草地结果" },
    });
    p.invoke.mockImplementation(async (op) =>
      op === "listAnalysisDeliveries"
        ? { supported: true, records: [record] }
        : record,
    );
    fireEvent.click(screen.getByRole("button", { name: "开始整理" }));
    await waitFor(() =>
      expect(p.invoke).toHaveBeenCalledWith(
        "createAnalysisDelivery",
        expect.objectContaining({
          sessionId: "s",
          mode: "organize",
          paths: ["results/model.csv"],
        }),
      ),
    );
    expect(await screen.findByText("草地结果")).toBeTruthy();
    expect(screen.getByText("未运行验证")).toBeTruthy();
  });
  it("opens the interpretation below the record list and closes back to the record", async () => {
    const p = props();
    p.invoke.mockImplementation(async (op) =>
      op === "listAnalysisDeliveries"
        ? { supported: true, records: [record] }
        : record,
    );
    render(<AnalysisDeliveryPanel {...p} />);
    fireEvent.click(await screen.findByRole("button", { name: /交付记录/ }));
    fireEvent.click(await screen.findByRole("button", { name: /草地结果/ }));
    fireEvent.click(screen.getByRole("button", { name: "阅读结果解读" }));
    expect(await screen.findByText("真实结果解读")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "收起预览" }));
    expect(screen.getByRole("button", { name: "阅读结果解读" })).toBeTruthy();
  });
  it("does not let a late response from the old scope replace the current view", async () => {
    let finish: (v: unknown) => void = () => {};
    const p = props();
    p.invoke.mockImplementation(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    const { rerender } = render(<AnalysisDeliveryPanel {...p} />);
    const next = props();
    rerender(
      <AnalysisDeliveryPanel {...next} sessionId="other" scopeKey="other:/w" />,
    );
    await screen.findByRole("button", { name: "整理交付" });
    finish({ supported: true, records: [record] });
    await Promise.resolve();
    fireEvent.click(screen.getByRole("button", { name: /交付记录/ }));
    expect(screen.queryByText("草地结果")).toBeNull();
  });
  it("keeps a selected route or Bot handoff in the same scoped selection flow", async () => {
    const p = props();
    setDeliveryView(p.scopeKey, {
      page: "select",
      selected: ["figures/chart.png"],
      candidates: ["figures/chart.png"],
    });
    render(<AnalysisDeliveryPanel {...p} />);
    expect(
      (screen.getByRole("checkbox", { name: /chart.png/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "下一步" }).hasAttribute("disabled"),
      ).toBe(false),
    );
  });
  it("preserves edited validation arguments when reviewing a script and never preserves run approval", async () => {
    const p = props(),
      withPlan = {
        ...record,
        plan: {
          language: "python",
          script: "scripts/run.py",
          args: ["{workspace}", "{output}"],
          comparisons: [],
          note: "initial",
        },
      };
    p.invoke.mockImplementation(async () => ({
      supported: true,
      records: [withPlan],
    }));
    setDeliveryView(p.scopeKey, { page: "verify", recordId: "d" });
    render(<AnalysisDeliveryPanel {...p} />);
    const editor = await screen.findByLabelText("脚本、参数与比较范围");
    fireEvent.change(editor, {
      target: {
        value: JSON.stringify({
          ...withPlan.plan,
          note: "edited validation arguments",
        }),
      },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /已核对脚本/ }));
    fireEvent.click(screen.getByRole("button", { name: "核对整理脚本" }));
    fireEvent.click(await screen.findByRole("button", { name: "收起预览" }));
    expect(
      (screen.getByLabelText("脚本、参数与比较范围") as HTMLTextAreaElement)
        .value,
    ).toContain("edited validation arguments");
    expect(
      (screen.getByRole("checkbox", { name: /已核对脚本/ }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });
});

it("keeps the validation approval and action outside the scrolling body", async () => {
  const p = props();
  p.invoke.mockImplementation(async () => ({
    supported: true,
    records: [
      {
        ...record,
        plan: {
          language: "python",
          script: "scripts/run.py",
          args: ["{output}"],
          comparisons: [],
          note: "test",
        },
      },
    ],
  }));
  setDeliveryView(p.scopeKey, { page: "verify", recordId: "d" });
  render(<AnalysisDeliveryPanel {...p} />);
  const button = await screen.findByRole("button", { name: "启动独立验证" });
  expect(button.closest(".delivery-body")).toBeNull();
  expect(
    screen
      .getByRole("checkbox", { name: /已核对脚本/ })
      .closest(".delivery-body"),
  ).toBeNull();
});

it("normalizes workspace-owned Bot absolute paths while keeping route paths and rejecting other workspaces", async () => {
  const { deliverySelectionPaths } =
    await import("../../src/ui/state/delivery.js");
  expect(
    deliverySelectionPaths(
      ["/workspace/results/a.csv", "figures/a.png"],
      "/workspace",
    ),
  ).toEqual(["results/a.csv", "figures/a.png"]);
  expect(() =>
    deliverySelectionPaths(["/workspace-other/secrets.csv"], "/workspace"),
  ).toThrow();
});

it("recovers a stale pending request without an endless spinner when no backend record exists", async () => {
  const p = props();
  setDeliveryView(p.scopeKey, {
    page: "detail",
    recordId: "missing",
    pendingId: "missing",
  });
  render(<AnalysisDeliveryPanel {...p} />);
  await screen.findByText("还没有交付记录");
  expect(screen.getByRole("alert").textContent).toContain("未找到本次交付记录");
});
