import { afterEach, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeliveryService } from "../../src/delivery/service.js";
const dirs: string[] = [];
afterEach(() => {
  for (const path of dirs.splice(0))
    rmSync(path, { recursive: true, force: true });
});
it("uses the Rscript sibling of the configured R installation with --vanilla", async (context) => {
  const r = "/Library/Frameworks/R.framework/Resources/bin/R";
  if (!existsSync(r)) {
    context.skip(
      "Local R installation unavailable; independent R acceptance not run",
    );
    return;
  }
  const root = mkdtempSync(join(tmpdir(), "dawn-delivery-r-"));
  dirs.push(root);
  mkdirSync(join(root, "results"));
  writeFileSync(join(root, "results/summary.csv"), "n,slope\n28,2.5\n");
  const code = `args <- commandArgs(trailingOnly=TRUE)\nout <- args[2]\nstopifnot(startsWith(Sys.getenv("TMPDIR"),out))\nwriteLines(c("n,slope","28,2.5"),file.path(out,"summary.csv"))\ncat(R.version.string)`;
  const service = new DeliveryService({
    sessionId: "r",
    workspace: root,
    sessionDir: join(root, ".dawn/sessions/r"),
    skills: "rules",
    interpreters: { r },
    ask: async () => ({
      model: "m",
      text: JSON.stringify({
        readme: "# R readme\nexplicit inputs",
        interpretation:
          "# 结果解读\n依据 results/summary.csv，n=28 斜率2.5，没有因果证据。",
        scripts: [{ path: "run.R", content: code }],
        gaps: [],
        validation: {
          language: "r",
          script: "run.R",
          args: ["{workspace}", "{output}"],
          comparisons: [
            {
              source: "results/summary.csv",
              output: "summary.csv",
              kind: "table",
            },
          ],
          note: "R process with explicit output",
        },
      }),
    }),
  });
  const record = await service.create({
    requestId: "r",
    name: "R-analysis",
    paths: ["results/summary.csv"],
    references: [],
    mode: "validate",
  });
  const checked = await service.verify({
    id: "r",
    plan: record.plan!,
    outputsReviewed: true,
    tolerance: 0,
  });
  expect(checked.verification.state).toBe("passed");
  expect(checked.verification.command?.slice(0, 2)).toEqual([
    join(r, "../Rscript"),
    "--vanilla",
  ]);
});
