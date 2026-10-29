import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SkillDiscoveryPanel,
  SkillOriginDetails,
  type SkillDiscoveryActions,
} from "../../src/ui/skill-discovery.js";
import type {
  SkillCandidate,
  SkillPreview,
} from "../../src/protocol/skill-discovery.js";
const candidate: SkillCandidate = {
  key: "one",
  name: "plot-data",
  description: "Plots scientific data",
  sourceLabel: "Test source",
  url: "https://github.com/owner/skills",
  repository: "owner/skills",
  ref: "main",
  commit: "a".repeat(40),
  path: "skills/plot-data",
  format: "valid",
  issues: [],
  dependencies: ["requirements.txt"],
  license: "MIT",
  runtimeVerification: "not_verified",
};
const preview: SkillPreview = {
  previewId: "preview-1",
  skill: candidate,
  body: "---\nname: plot-data\n---\nDo the analysis",
  files: [
    { path: "SKILL.md", bytes: 64 },
    { path: "scripts/run.py", bytes: 12 },
  ],
  packageSha256: "b".repeat(64),
  expiresAt: "2099-01-01T00:00:00Z",
};
const actions = (): SkillDiscoveryActions => ({
  search: vi.fn(async () => ({
    sources: [{ id: "test", label: "Test source", url: candidate.url }],
    skills: [candidate],
    problems: ["Other source is unavailable"],
  })),
  inspect: vi.fn(async () => ({
    sources: [],
    skills: [candidate],
    problems: [],
  })),
  preview: vi.fn(async () => preview),
  readFile: vi.fn(async (_id, path) => ({
    path,
    bytes: 12,
    text: "print(42)",
  })),
  discard: vi.fn(async () => {}),
  install: vi.fn(async () => ({
    name: candidate.name,
    dest: "/tmp/plot-data",
    origin: {
      provider: "github" as const,
      repository: candidate.repository,
      sourceUrl: candidate.url,
      ref: candidate.ref,
      commit: candidate.commit,
      path: candidate.path,
      packageSha256: preview.packageSha256,
      installedAt: "2026-10-29T00:00:00Z",
      runtimeVerification: "not_verified" as const,
    },
  })),
  origin: vi.fn(async () => ({})),
});
async function showPreview(a: SkillDiscoveryActions) {
  render(<SkillDiscoveryPanel actions={a} hasProject onInstalled={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("搜索在线技能"), {
    target: { value: "plot" },
  });
  fireEvent.click(screen.getByRole("button", { name: "检索技能源" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "预览 plot-data" }),
  );
  await screen.findByText(candidate.commit);
}
describe("Skill discovery", () => {
  it("shows partial source failure, pinned preview and companion file content without claiming runtime verification", async () => {
    const a = actions();
    await showPreview(a);
    expect(screen.getByText("Other source is unavailable")).toBeTruthy();
    expect(screen.getByText("DAWN 运行未验证")).toBeTruthy();
    expect(screen.getByText("requirements.txt")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "scripts/run.py" }));
    expect(await screen.findByText("print(42)")).toBeTruthy();
    expect(a.readFile).toHaveBeenCalledWith(
      preview.previewId,
      "scripts/run.py",
    );
  });
  it("installs only the backend preview identity and refreshes installed skills", async () => {
    const a = actions(),
      changed = vi.fn();
    render(
      <SkillDiscoveryPanel actions={a} hasProject onInstalled={changed} />,
    );
    fireEvent.change(screen.getByLabelText("GitHub 链接"), {
      target: { value: candidate.url },
    });
    fireEvent.click(screen.getByRole("button", { name: "解析链接" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "预览 plot-data" }),
    );
    await screen.findByText(candidate.commit);
    fireEvent.change(screen.getByLabelText("安装位置"), {
      target: { value: "project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "安装此技能" }));
    await waitFor(() =>
      expect(a.install).toHaveBeenCalledWith(preview.previewId, "project"),
    );
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });
  it("discards a late preview when the user cancels instead of showing or installing it", async () => {
    const a = actions();
    let resolve!: (v: SkillPreview) => void;
    a.preview = vi.fn(
      () =>
        new Promise<SkillPreview>((r) => {
          resolve = r;
        }),
    );
    render(
      <SkillDiscoveryPanel
        actions={a}
        hasProject={false}
        onInstalled={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "检索技能源" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "预览 plot-data" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "放弃加载" }));
    await act(async () => resolve(preview));
    expect(screen.queryByText(candidate.commit)).toBeNull();
    await waitFor(() =>
      expect(a.discard).toHaveBeenCalledWith(preview.previewId),
    );
    expect(a.install).not.toHaveBeenCalled();
  });
  it("reads recorded origin offline without querying GitHub", async () => {
    const a = actions(),
      installed = await a.install("id", "global");
    a.origin = vi.fn(async () => ({ origin: installed.origin }));
    render(
      <SkillOriginDetails filePath="/skills/plot-data/SKILL.md" actions={a} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "查看安装来源" }));
    expect(await screen.findByText(candidate.commit)).toBeTruthy();
    expect(a.search).not.toHaveBeenCalled();
    expect(a.inspect).not.toHaveBeenCalled();
  });
});

it("moves keyboard focus to selected details even after a long catalog", async () => {
  const a = actions();
  a.search = vi.fn(async () => ({
    sources: [],
    skills: [
      candidate,
      ...Array.from({ length: 20 }, (_, i) => ({
        ...candidate,
        key: `key-${i}`,
        name: `other-${i}`,
      })),
    ],
    problems: [],
  }));
  await showPreview(a);
  expect(document.activeElement).toBe(
    screen.getByRole("region", { name: "技能详情" }),
  );
});
