import type { AnalysisRoute } from "../../src/protocol/analysis-route.js"
export const route = (revision = 1): AnalysisRoute => ({
  routeId: "route-a",
  revision,
  updatedAt: 1,
  title: "分析路线",
  goal: "目标",
  dataContext: [],
  steps: [
    {
      id: "S1",
      title: "输入",
      purpose: "核对",
      inputs: [],
      outputs: [],
      dependencies: [],
      status: "pending",
      blockers: [],
      cases: [],
      deliverables: [],
      execution: { state: "not_run", note: "未运行" },
      verification: { state: "unreviewed", note: "未审查" },
      needsReview: false,
      notes: [],
    },
  ],
})
