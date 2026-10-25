import { afterEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeliveryService } from "../../src/delivery/service.js";
import type { DeliveryRecord } from "../../src/protocol/delivery.js";
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const script = `import sys, pathlib, os\nroot,out=map(pathlib.Path,sys.argv[1:])\nassert str(out) in os.environ['TMPDIR']\nout.mkdir(parents=True,exist_ok=True)\n(out/'model.csv').write_text('n,slope,r2\\n24,2.5,0.8\\n')\nprint('independent validation pid:',os.getpid())\n`;
async function setup(
  code = script,
  options: { python?: string; timeout?: number; source?: string } = {
    python: "/usr/bin/python3",
  },
) {
  const root = mkdtempSync(join(tmpdir(), "dawn-verify-"));
  dirs.push(root);
  mkdirSync(join(root, "results"));
  writeFileSync(join(root, "results/model.csv"), options.source ?? "n,slope,r2\n24,2.5,0.8\n");
  const plan = {
    language: "python" as const,
    script: "analysis/run.py",
    args: ["{workspace}", "{output}"],
    comparisons: [
      {
        source: "results/model.csv",
        output: "model.csv",
        kind: "table" as const,
      },
    ],
    note: "argv: workspace then output; outputs only to supplied output",
  };
  const ask = vi.fn(async () => ({
    model: "m",
    text: JSON.stringify({
      readme: "# Readme\n明确的参数",
      interpretation:
        "# 结果解读\nn=24 slope=2.5 r2=.8，依据 model.csv；没有因果证据。",
      gaps: [],
      scripts: [{ path: "analysis/run.py", content: code }],
      validation: plan,
    }),
  }));
  const service = new DeliveryService({
    sessionId: "s",
    workspace: root,
    sessionDir: join(root, ".dawn/sessions/s"),
    skills: "rules",
    ask,
    interpreters: { ...(options.python ? { python: options.python } : {}) },
    validationTimeoutMs: options.timeout,
  });
  const record = await service.create({
    requestId: "r1",
    name: "test",
    paths: ["results/model.csv"],
    references: [],
    mode: "validate",
  });
  return { root, service, record };
}
const run = (service: DeliveryService, r: DeliveryRecord) =>
  service.verify({
    id: r.id,
    plan: r.plan!,
    tolerance: 1e-9,
    outputsReviewed: true,
  });
describe("independent analysis verification", () => {
  it("waits for confirmation then launches configured process and checks complete results", async () => {
    const { root, service, record } = await setup();
    expect(record.verification.state).toBe("awaiting_confirmation");
    const r = await run(service, record);
    expect(r.verification.state).toBe("passed");
    expect(r.verification.exitCode).toBe(0);
    expect(r.verification.command?.[0]).toMatch(/python/);
    const log = r.files.find((f) => f.path.endsWith("stdout.log"))!;
    expect(readFileSync(join(root, log.path), "utf8")).toContain(
      "independent validation pid:",
    );
    expect(r.files.some((f) => f.path.endsWith("environment.json"))).toBe(true);
    expect(readFileSync(join(root, "results/model.csv"), "utf8")).toBe(
      "n,slope,r2\n24,2.5,0.8\n",
    );
  });
  it("does not treat exit zero with a missing output as pass", async () => {
    const { service, record } = await setup('print("no result")');
    const r = await run(service, record);
    expect(r.verification.exitCode).toBe(0);
    expect(r.verification.state).toBe("partial");
    expect(r.verification.checks?.[0]?.state).toBe("skipped");
  });
  it("fails real numerical differences rather than loosening tolerance", async () => {
    const { service, record } = await setup(
      script.replace("24,2.5,0.8", "24,2.6,0.8"),
    );
    const r = await run(service, record);
    expect(r.verification.state).toBe("failed");
    expect(r.verification.checks?.[0]?.note).toMatch(/slope|第/);
    expect(r.verification.exitCode).toBe(0);
  });
  it.each([
    ["id", "001", "1"],
    ["id", "9007199254740992", "9007199254740993"],
    ["category", "10000000", "10000001"],
  ])("records changed %s %s / %s as failed even with process exit zero", async (field, a, b) => {
    const source = `${field}\n${a}\n`;
    const current = `${field}\n${b}\n`;
    const f = await setup(`import pathlib,sys\nout=pathlib.Path(sys.argv[2])\n(out/'model.csv').write_text(${JSON.stringify(current)})\n`, {
      python: "/usr/bin/python3", source,
    });
    const result = await f.service.verify({ id: f.record.id, plan: f.record.plan!, tolerance: 1e-6, outputsReviewed: true });
    expect(result.verification.state).toBe("failed");
    expect(result.verification.exitCode).toBe(0);
    expect(result.verification.checks?.[0]).toMatchObject({ state: "failed", note: expect.stringContaining(`${a} / ${b}`) });
    expect(readFileSync(join(f.root, "results/model.csv"), "utf8")).toBe(source);
    const saved = JSON.parse(readFileSync(join(f.root, result.verification.directory!, "verification.json"), "utf8"));
    expect(saved.state).toBe("failed");
    expect(f.service.list()[0]?.verification.state).toBe("failed");
  });
  it("records nonzero exits and scoped timeout without touching another run", async () => {
    const a = await setup('raise RuntimeError("broken analysis")');
    expect((await run(a.service, a.record)).verification.state).toBe("failed");
    const b = await setup("import time\ntime.sleep(10)", {
      python: "/usr/bin/python3",
      timeout: 250,
    });
    const r = await run(b.service, b.record);
    expect(r.verification.state).toBe("failed");
    expect(r.verification.note).toMatch(/超时/);
    expect(existsSync(join(b.root, r.directory, "README.md"))).toBe(true);
  });
  it("requires configured interpreter and explicit output args; does not guess a default", async () => {
    const { service, record } = await setup(script, {});
    await expect(run(service, record)).rejects.toThrow(/解释器/);
    const b = await setup();
    await expect(
      b.service.verify({
        id: b.record.id,
        plan: { ...b.record.plan!, args: [] },
        outputsReviewed: true,
        tolerance: 1e-9,
      }),
    ).rejects.toThrow(/输出/);
    expect(b.service.list()[0]?.verification.state).toBe(
      "awaiting_confirmation",
    );
  });
  it("each verification has a new output directory, never cleans previous output", async () => {
    const { root, service, record } = await setup();
    const a = await run(service, record);
    const output = a.verification.directory!;
    writeFileSync(join(root, output, "keep.txt"), "keep");
    const b = await run(service, record);
    expect(b.verification.directory).not.toBe(output);
    expect(readFileSync(join(root, output, "keep.txt"), "utf8")).toBe("keep");
  });
  it("retains images and reports generated during validation even when only statistics are compared", async () => {
    const f = await setup(
      script +
        "(out/'plot.svg').write_text('<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>')\n(out/'report.md').write_text('# actual validation report')\n",
    );
    const result = await run(f.service, f.record);
    expect(
      result.files.some(
        (file) =>
          file.role === "verification" &&
          file.path.endsWith("/output/plot.svg"),
      ),
    ).toBe(true);
    expect(
      result.files.some(
        (file) =>
          file.role === "verification" &&
          file.path.endsWith("/output/report.md"),
      ),
    ).toBe(true);
    expect(
      result.files.some(
        (file) => file.role === "verification" && file.path.endsWith("/run.py"),
      ),
    ).toBe(true);
  });
  it("rejects an edited reference instead of validating against changed original output", async () => {
    const f = await setup();
    const reference = f.record.evidence.find(
      (e) => e.path === "results/model.csv",
    )!;
    writeFileSync(
      join(f.root, reference.copyPath!),
      "n,slope,r2\n24,2.6,0.8\n",
    );
    const result = await run(f.service, f.record);
    expect(result.verification.state).toBe("failed");
    expect(
      result.verification.checks?.some((c) => c.note.includes("已被修改")),
    ).toBe(true);
  });
  it("never calls two different invalid-UTF-8 category values equal after replacement decoding", async () => {
    const f = await setup(
      "import pathlib,sys\nout=pathlib.Path(sys.argv[2])\n(out/'model.csv').write_bytes(bytes([110,44,108,97,98,101,108,10,50,52,44,254,10]))",
    );
    const source = Buffer.from([
      110, 44, 108, 97, 98, 101, 108, 10, 50, 52, 44, 255, 10,
    ]);
    writeFileSync(join(f.root, "results/model.csv"), source);
    const record = await f.service.create({
      requestId: "encoded",
      name: "legacy",
      paths: ["results/model.csv"],
      references: [],
      mode: "validate",
    });
    const result = await run(f.service, record);
    expect(result.verification.state).toBe("partial");
    expect(
      result.verification.checks?.some((c) => c.note.includes("UTF-8")),
    ).toBe(true);
  });
});
