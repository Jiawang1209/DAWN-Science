/**
 * 用真 git 仓库跑真命令，不 mock——「产出」这一栏的可信度全靠它，
 * mock 出来的 diff 证明不了任何事（不变式 5）。
 */
import { beforeEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NotAGitRepoError, diffSince, snapshot } from "../../src/project/git-facts.js"

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  })
}

function newRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "dawn-git-"))
  git(dir, "init", "-q", "-b", "main")
  writeFileSync(join(dir, "seed.txt"), "seed\n")
  git(dir, "add", ".")
  git(dir, "commit", "-q", "-m", "seed")
  return dir
}

describe("snapshot", () => {
  let repo: string
  beforeEach(() => {
    repo = newRepo()
  })

  it("干净仓库：拿到 HEAD，脏文件为空", async () => {
    const s = await snapshot(repo)
    expect(s.head).toMatch(/^[0-9a-f]{40}$/)
    expect(s.dirtyFiles).toEqual([])
  })

  it("记录基线时已存在的未提交修改 —— 那些是作者的，不是 agent 的", async () => {
    writeFileSync(join(repo, "seed.txt"), "user edited\n")
    const s = await snapshot(repo)
    expect(s.dirtyFiles).toEqual(["seed.txt"])
  })

  it("未跟踪文件也算脏", async () => {
    writeFileSync(join(repo, "new.txt"), "x\n")
    const s = await snapshot(repo)
    expect(s.dirtyFiles).toContain("new.txt")
  })

  it("非 git 仓库响亮报错，而不是返回一个空结果", async () => {
    const notRepo = mkdtempSync(join(tmpdir(), "dawn-notgit-"))
    await expect(snapshot(notRepo)).rejects.toBeInstanceOf(NotAGitRepoError)
    rmSync(notRepo, { recursive: true, force: true })
  })
})

describe("diffSince", () => {
  let repo: string
  let baseline: Awaited<ReturnType<typeof snapshot>>

  beforeEach(async () => {
    repo = newRepo()
    baseline = await snapshot(repo)
  })

  it("什么都没改 → 空变更集（这也是一个事实，不是失败）", async () => {
    const f = await diffSince(repo, baseline)
    expect(f.files).toEqual([])
    expect(f.baselineHead).toBe(baseline.head)
  })

  it("工作区新增文件被算进产出", async () => {
    writeFileSync(join(repo, "made-by-agent.ts"), "x\n")
    const f = await diffSince(repo, baseline)
    expect(f.files).toContain("made-by-agent.ts")
  })

  it("工作区修改已跟踪文件被算进产出", async () => {
    writeFileSync(join(repo, "seed.txt"), "changed\n")
    expect((await diffSince(repo, baseline)).files).toContain("seed.txt")
  })

  it("基线之后的提交被算进产出 —— agent 自己 commit 了也要看得见", async () => {
    writeFileSync(join(repo, "committed.txt"), "x\n")
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "agent commit")
    expect((await diffSince(repo, baseline)).files).toContain("committed.txt")
  })

  it("提交 + 工作区改动同时存在时，两者都算进去且不重复", async () => {
    writeFileSync(join(repo, "a.txt"), "x\n")
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "c1")
    writeFileSync(join(repo, "a.txt"), "y\n")
    writeFileSync(join(repo, "b.txt"), "z\n")
    const f = await diffSince(repo, baseline)
    expect(f.files.sort()).toEqual(["a.txt", "b.txt"])
  })

  it("基线时就脏的文件、之后没再动 → 不算 agent 的产出", async () => {
    // 作者先改了 seed.txt，然后才起会话
    writeFileSync(join(repo, "seed.txt"), "user edit\n")
    const late = await snapshot(repo)
    expect(late.dirtyFiles).toEqual(["seed.txt"])

    const f = await diffSince(repo, late)
    expect(f.files).not.toContain("seed.txt")
  })

  it("基线时就脏、之后又被改 → 仍算进去，因为分不清是谁改的", async () => {
    writeFileSync(join(repo, "seed.txt"), "user edit\n")
    const late = await snapshot(repo)
    writeFileSync(join(repo, "seed.txt"), "user edit + agent edit\n")
    expect((await diffSince(repo, late)).files).toContain("seed.txt")
  })

  it("mayIncludeUserEdits 默认为 true —— ①-B 没有 worktree 隔离，分不清谁改的", async () => {
    expect((await diffSince(repo, baseline)).mayIncludeUserEdits).toBe(true)
  })

  it("显式声明隔离环境时才为 false", async () => {
    const f = await diffSince(repo, baseline, { isolated: true })
    expect(f.mayIncludeUserEdits).toBe(false)
  })

  it("产出符合协议的 FileChangeFacts schema", async () => {
    const { FileChangeFactsSchema } = await import("../../src/protocol/index.js")
    writeFileSync(join(repo, "x.txt"), "1\n")
    const facts = await diffSince(repo, baseline)
    expect(() => FileChangeFactsSchema.parse(facts)).not.toThrow()
  })

  it("非 git 仓库响亮报错", async () => {
    const notRepo = mkdtempSync(join(tmpdir(), "dawn-notgit-"))
    await expect(diffSince(notRepo, baseline)).rejects.toBeInstanceOf(NotAGitRepoError)
    rmSync(notRepo, { recursive: true, force: true })
  })
})
