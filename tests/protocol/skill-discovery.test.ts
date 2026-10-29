import { expect, it } from "vitest";
import { OPERATIONS, 只读模式该拦 } from "../../src/protocol/operations.js";
it("online skill installation is a strict mutating operation with a backend preview identity", () => {
  const operation = (OPERATIONS as Record<string, any>).installGithubSkill;
  expect(operation).toBeDefined();
  expect(operation.mutating).toBe(true);
  expect(
    operation.request.safeParse({
      previewId: "x",
      to: "global",
      body: "injected",
    }).success,
  ).toBe(false);
  expect(
    operation.request.safeParse({ previewId: "x", to: "global" }).success,
  ).toBe(true);
});

it("read-only mode blocks online retrieval and installation but permits local origin reads",()=>{
 for(const op of ["searchSkillCatalog","inspectGithubSkills","previewGithubSkill","installGithubSkill"]) expect(只读模式该拦(op)).toBe(true);
 expect(只读模式该拦("getSkillOrigin")).toBe(false);
});
