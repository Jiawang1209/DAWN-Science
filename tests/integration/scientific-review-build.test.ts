import { beforeAll, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { createResourceHost } from "../../src/subagent/resources.js"
import { loadSubagentsFrom } from "../../src/subagent/definitions.js"

const root = resolve(import.meta.dirname, "../.."), dist = join(root, "dist")
beforeAll(() => {
  if (!existsSync(join(dist, "skills/scientific-review/SKILL.md"))) {
    execFileSync("npm", ["run", "build:electron"], {cwd: root, stdio: "pipe"})
  }
}, 180_000)

it("真实发布目录包含同版规范/参考和角色，不依赖开发机源码路径", () => {
  const paths = ["skills/scientific-review/SKILL.md", "skills/scientific-review/references/checklist.md", "skills/scientific-review/references/reporting.md",
    ...["stat-consultant", "reproducibility-reviewer", "reviewer-two", "data-auditor", "methods-writer", "data-cleaner"].map(n => `agents/${n}.md`),
    ...["reproducible-analysis", "analysis-delivery", "analyze-like-case"].map(n => `skills/${n}/SKILL.md`)]
  for (const path of paths) expect(readFileSync(join(dist, path), "utf8"), path).toBe(readFileSync(join(root, path), "utf8"))
  const loaded = loadSubagentsFrom([{dir: join(dist, "agents"), from: "builtin"}])
  expect(loaded.problems).toEqual([])
  expect(loaded.agents.find(a => a.name === "reviewer-two")!.tools).toEqual(["read", "glob", "grep"])
})

it("父侧资源服务从真实 dist 目录分页读取审查参考，不借源码目录", async () => {
  const h = createResourceHost({roots: [{path: join(dist, "skills"), scope: "builtin"}]})
  const found = JSON.parse(await h.call("resource_search", {kind: "skill", query: "scientific-review"}))
  expect(found.total).toBe(1)
  expect(found.items[0].source).toBe(join(dist, "skills/scientific-review/SKILL.md"))
  for (const path of ["references/checklist.md", "references/reporting.md"]) {
    let content = "", offset = 0
    for (;;) {
      const page = JSON.parse(await h.call("resource_read", {id: found.items[0].id, path, offset, limit: 193}))
      expect(page.source).toBe(join(dist, "skills/scientific-review", path))
      content += page.content
      if (!page.truncated) break
      expect(page.nextOffset).toBeGreaterThan(offset)
      offset = page.nextOffset
    }
    expect(content).toBe(readFileSync(join(root, "skills/scientific-review", path), "utf8"))
  }
})
