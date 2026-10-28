import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeliveryService } from "../../src/delivery/service.js";
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function setup(override?: unknown) {
  const root = mkdtempSync(join(tmpdir(), "dawn-delivery-"));
  dirs.push(root);
  mkdirSync(join(root, "analysis"));
  mkdirSync(join(root, "results"));
  writeFileSync(
    join(root, "analysis/run.py"),
    'raise Exception("must not execute during organize")',
  );
  writeFileSync(join(root, "results/model.csv"), "n,slope,r2\n24,2.5,0.8\n");
  const ask = vi.fn(async (_req: { user: string }) => ({
    text: JSON.stringify(
      override ?? {
        readme: "# 运行说明\n输入未知，未运行",
        interpretation:
          "# 结果解读\n依据 results/model.csv：n=24，slope=2.5，r2=0.8。没有p值，不推断因果。",
        scripts: [],
        gaps: ["输入未提供"],
      },
    ),
    model: "test-model",
  }));
  const owner = {
    sessionId: "s",
    workspace: root,
    sessionDir: join(root, ".dawn/sessions/s"),
  };
  return {
    root,
    ask,
    owner,
    service: new DeliveryService({ ...owner, ask, skills: "delivery rules" }),
  };
}
const request = {
  requestId: "request-1",
  name: "草地回归",
  paths: ["analysis/run.py", "results/model.csv"],
  references: [],
  mode: "organize" as const,
};
describe("analysis delivery generation", () => {
  it('keeps existing step scripts and writes invocation guidance without embedding their source', async () => {
    const {service,root}=setup({readme:'# 运行说明\n原始输入在项目中',interpretation:'# 分析结果\n有效样本24，模型关联仍需审阅。',scripts:[],gaps:[],steps:[{title:'统计分析',purpose:'读取清洗结果并计算回归',script:'analysis/run.py',args:['--input','data/clean.csv'],inputs:[],outputs:['results/model.csv'],interpretation:'统计表记录有效样本量。'}]})
    const r=await service.create(request)
    const report=readFileSync(join(root,r.directory,'分析报告.md'),'utf8')
    expect(report).toContain('[analysis/run.py](files/analysis/run.py)')
    expect(report).toContain('建议调用方式（未执行）')
    expect(report).toContain("'analysis/run.py' '--input' 'data/clean.csv'")
    expect(report).not.toContain('raise Exception')
    expect(report).toContain('[results/model.csv](files/results/model.csv)')
    expect(r.gaps.join('\n')).not.toContain('未生成可独立运行')
    expect(r.state).toBe('organized')
    expect(existsSync(join(root,r.directory,'结果解读.md'))).toBe(false)
    expect(readFileSync(join(root,r.directory,'README.md'),'utf8')).toContain('[分析报告](分析报告.md)')
    expect(r.verification.state).toBe('not_run')
  })
  it("requires explicit selection, never runs analysis and grounds interpretation in actual output", async () => {
    const { service, root, ask } = setup();
    await expect(service.create({ ...request, paths: [] })).rejects.toThrow();
    const r = await service.create(request);
    expect(r.state).toBe("partial");
    expect(r.verification.state).toBe("not_run");
    expect(ask.mock.calls[0]?.[0].user).toContain("24,2.5,0.8");
    expect(
      readFileSync(join(root, r.directory, "分析报告.md"), "utf8"),
    ).toContain("slope=2.5");
    expect(readFileSync(join(root, "analysis/run.py"), "utf8")).toContain(
      "must not execute",
    );
    expect(r.files.some((f) => f.path.endsWith("README.md"))).toBe(true);
  });
  it("is idempotent by request id and never overwrites same-named packages", async () => {
    const { service, root, ask } = setup();
    const a = await service.create(request);
    expect((await service.create(request)).id).toBe(a.id);
    expect(ask).toHaveBeenCalledTimes(1);
    writeFileSync(join(root, a.directory, "README.md"), "user edited");
    const b = await service.create({ ...request, requestId: "request-2" });
    expect(b.directory).not.toBe(a.directory);
    expect(readFileSync(join(root, a.directory, "README.md"), "utf8")).toBe(
      "user edited",
    );
  });
  it('links the copied script snapshot when the workspace changes during report generation', async()=>{
    const {service,root,ask}=setup()
    ask.mockImplementation(async()=>{
      writeFileSync(join(root,'analysis/run.py'),'# changed after selection\nprint(999)\n')
      return {model:'test',text:JSON.stringify({readme:'Run from the original project root.',interpretation:'Only the chosen statistical output is described; no new execution occurred.',scripts:[],gaps:[],steps:[{title:'Saved step',purpose:'Use selected script',script:'analysis/run.py',args:[],inputs:[],outputs:[]}]})}
    })
    const r=await service.create(request)
    expect(readFileSync(join(root,r.directory,'files/analysis/run.py'),'utf8')).toContain('must not execute')
    const report=readFileSync(join(root,r.directory,'分析报告.md'),'utf8')
    expect(report).toContain('(files/analysis/run.py)')
    expect(report).not.toContain('print(999)')
    expect(report).not.toContain('raise Exception')
  })
  it('does not link a script copy removed while the model was preparing the report', async()=>{
    const {service,root,ask}=setup()
    ask.mockImplementation(async()=>{
      rmSync(join(root,service.list()[0]!.directory,'files/analysis/run.py'))
      return {model:'test',text:JSON.stringify({readme:'Original project instructions; no execution.',interpretation:'The selected statistical results are available; the script copy is missing.',scripts:[],gaps:[],steps:[{title:'Step',purpose:'Original script',script:'analysis/run.py',args:[],inputs:[],outputs:[]}]})}
    })
    const r=await service.create(request)
    const report=readFileSync(join(root,r.directory,'分析报告.md'),'utf8')
    expect(r.state).toBe('partial')
    expect(report).not.toContain('(files/analysis/run.py)')
    expect(r.gaps.join('\n')).toContain('交付副本已不可用')
  })
  it("rejects traversal, credential files and outward links before calling the model", async () => {
    const { service, root, ask } = setup();
    symlinkSync(tmpdir(), join(root, "link"));
    for (const path of [
      "../secret",
      "/etc/passwd",
      ".dawn/sessions/s/private.json",
      "link/no-such-file",
    ])
      await expect(
        service.create({ ...request, requestId: path, paths: [path] }),
      ).rejects.toThrow();
    expect(ask).not.toHaveBeenCalled();
  });
  it("rejects symlinked output roots and does not write through them", async () => {
    const { service, root } = setup();
    symlinkSync(tmpdir(), join(root, "outputs"));
    await expect(service.create(request)).rejects.toThrow(/链接|symlink/);
    expect(service.list().every((r) => r.state !== "organized")).toBe(true);
  });
  it("reports missing files and bounded evidence without pretending they were read", async () => {
    const { service, root, ask } = setup();
    writeFileSync(join(root, "results/large.csv"), "x".repeat(150_000));
    const r = await service.create({
      ...request,
      paths: ["results/model.csv", "results/missing.csv", "results/large.csv"],
    });
    expect(r.state).toBe("partial");
    expect(
      r.evidence.find((e) => e.path === "results/missing.csv")?.state,
    ).toBe("missing");
    expect(
      r.evidence.find((e) => e.path === "results/large.csv")?.note,
    ).toMatch(/上限/);
    expect(ask.mock.calls[0]?.[0].user.length).toBeLessThan(140_000);
  });
  it("requires a new interpretation, retains a failed record on malformed generation", async () => {
    const { service } = setup({ readme: "readme", scripts: [], gaps: [] });
    const r = await service.create(request);
    expect(r.state).toBe("failed");
    expect(r.error).toBeTruthy();
    expect(service.list()[0]?.state).toBe("failed");
  });
  it("persists per owner and exposes every generated file for preview", async () => {
    const { service, owner, ask, root } = setup();
    const r = await service.create(request);
    const reopened = new DeliveryService({ ...owner, ask, skills: "" });
    expect(reopened.list()[0]?.id).toBe(r.id);
    expect(r.files.every((f) => existsSync(join(root, f.path)))).toBe(true);
    const other = new DeliveryService({
      ...owner,
      sessionId: "other",
      sessionDir: join(root, ".dawn/sessions/other"),
      ask,
      skills: "",
    });
    expect(other.list()).toEqual([]);
  });
  it("cancels a generating request and preserves an explicit failed record", async () => {
    const f = setup();
    const pending = f.service.create(request);
    expect(f.service.cancel(request.requestId)).toBe(true);
    const result = await pending;
    expect(result.state).toBe("failed");
    expect(result.error).toMatch(/取消/);
    expect(result.verification.state).toBe("not_run");
  });
  it("marks an interrupted generation as interrupted when reopened, never invents completion", async () => {
    const f = setup();
    const r = await f.service.create(request);
    writeFileSync(
      join(f.owner.sessionDir, "deliveries.json"),
      JSON.stringify([{ ...r, state: "generating" }]),
    );
    const reopened = new DeliveryService({
      ...f.owner,
      ask: f.ask,
      skills: "",
    });
    expect(reopened.list()[0]?.state).toBe("failed");
    expect(reopened.list()[0]?.error).toMatch(/重启/);
  });

  it("does not resurrect deleted session state after its owner disposes an active job", async () => {
    const f = setup();
    const pending = f.service.create(request);
    f.service.dispose();
    rmSync(f.owner.sessionDir, { recursive: true, force: true });
    await pending;
    expect(existsSync(f.owner.sessionDir)).toBe(false);
  });
  it("does not call a scriptless package complete just because the model omitted gaps", async () => {
    const f = setup({
      readme: "# README\n原有结果已整理",
      interpretation:
        "# 结果解读\n依据 results/model.csv，样本量24，缺少输入和脚本。",
      scripts: [],
      gaps: [],
    });
    const r = await f.service.create({
      ...request,
      paths: ["results/model.csv"],
    });
    expect(r.state).toBe("partial");
    expect(r.gaps.some((g) => g.includes("脚本"))).toBe(true);
  });
  it("does not feed damaged non-UTF-8 text to the model as complete evidence", async () => {
    const f = setup();
    writeFileSync(
      join(f.root, "results/legacy.csv"),
      Buffer.from([110, 44, 108, 97, 98, 101, 108, 10, 50, 52, 44, 255, 10]),
    );
    const r = await f.service.create({
      ...request,
      paths: ["results/legacy.csv"],
    });
    expect(f.ask.mock.calls[0]?.[0].user).not.toContain("�");
    expect(r.evidence[0]?.note).toMatch(/UTF-8/);
    expect(r.evidence[0]?.state).toBe("reference");
  });
});
