import { expect, it } from "vitest";
import { OPERATIONS, 只读模式该拦 } from "../../src/protocol/operations.js";
it("separates read-only records from generation and execution, refuses hidden paths and unreviewed runs", () => {
  expect(只读模式该拦("listAnalysisDeliveries")).toBe(false);
  for (const op of [
    "createAnalysisDelivery",
    "verifyAnalysisDelivery",
    "cancelAnalysisDelivery",
  ] as const)
    expect(只读模式该拦(op)).toBe(true);
  expect(
    OPERATIONS.createAnalysisDelivery.request.safeParse({
      sessionId: "s",
      requestId: "r",
      name: "delivery",
      paths: [".env"],
      references: [],
      mode: "organize",
    }).success,
  ).toBe(false);
  expect(
    OPERATIONS.verifyAnalysisDelivery.request.safeParse({
      sessionId: "s",
      id: "r",
      tolerance: 0,
      plan: {
        language: "python",
        script: "a.py",
        args: [],
        comparisons: [],
        note: "",
      },
    }).success,
  ).toBe(false);
});
