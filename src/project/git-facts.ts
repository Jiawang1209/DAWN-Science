/**
 * 从 git 事实计算「产出」（Task 2.5）。
 *
 * **不变式 5：agent 声明层与 Repo 事实层分离。** 这一栏回答的是「仓库里实际变了什么」，
 * 不是「agent 说它改了什么」。后者不可信——那正是本项目要防的东西。
 *
 * **①-B 的已知局限**：没有 worktree 隔离（实体 #50 在阶段 ③），agent 直接在作者的
 * 工作目录里改，所以差集**可能混入作者本人的手动修改**。该事实随数据一起传递
 * （`mayIncludeUserEdits`），不指望 UI 记得加脚注。
 *
 * 一处能做的降噪：**基线时就已经脏、之后再没动过的文件**可以确定不是 agent 改的，
 * 从结果中剔除。但基线时脏、之后又变了的**仍然算进去**——那种情况分不清是谁改的，
 * 宁可多报也不漏报。
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { FileChangeFacts } from "../protocol/index.js"

const exec = promisify(execFile)

export class NotAGitRepoError extends Error {
  constructor(public readonly workspace: string) {
    super(`"${workspace}" 不是一个 git 仓库，无法计算产出事实`)
    this.name = "NotAGitRepoError"
  }
}

export interface GitBaseline {
  head: string
  /** 基线时刻已经存在的未提交改动（含未跟踪文件）。这些是作者的，不是 agent 的 */
  dirtyFiles: string[]
  /**
   * 上述每个脏文件在基线时刻的内容哈希。
   *
   * 只记文件名不够——那样无法区分「还是原样脏」与「之后又被改了」，
   * 前者该剔除、后者必须保留。存哈希把这个精度上限直接消掉，
   * 代价只是基线时多跑一次 `git hash-object`。
   * 文件在基线时已被删除则不出现在此表中。
   */
  dirtyHashes: Record<string, string>
  capturedAt: string
}

async function git(workspace: string, args: string[]): Promise<string> {
  try {
    // 只读命令也要净化环境：仓库内的 git hook / alias / credential-helper
    // 会在普通 git 操作时被触发并读到环境变量（规格 7.31 第 ⑥ 条）
    const { stdout } = await exec("git", [
      /**
       * **非 ASCII 路径不要转义。**
       *
       * git 默认把中文文件名写成 `"\346\226\260..."` 这种八进制转义，
       * 于是产出事实里出现的是乱码路径——**用户在界面上看到的是一串反斜杠**，
       * 而不是他刚建的那个文件。本项目界面全中文，这条不是边角情况。
       *
       * 2026-08-09 由 R3 的逐次溯源测试撞出来；它同时修掉了**会话级**产出事实
       * 里同样的乱码（那一处从 ①-B 起就带着这个缺陷）。
       */
      "-c",
      "core.quotePath=false",
      ...args,
    ], {
      cwd: workspace,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer: 32 * 1024 * 1024,
    })
    return stdout
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/not a git repository/i.test(msg)) throw new NotAGitRepoError(workspace)
    throw err
  }
}

/**
 * 去掉 git 给路径加的外层引号。
 *
 * **`core.quotePath=false` 只管非 ASCII，管不了这个。** 路径里有空格、引号、
 * 反斜杠等字符时，git 仍会整体加引号并做 C 风格转义——于是产出事实里出现的是
 * `"有 空格.txt"`（**带着那对引号**），点开必然找不到文件。
 *
 * 2026-08-09 与 quotePath 那条一起，由 R3 的逐次溯源测试撞出来。
 */
function unquotePath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"') || raw.length < 2) return raw
  const inner = raw.slice(1, -1)
  // C 风格转义：git 只会产出这几种（quotePath=false 时不会有 \NNN 八进制）
  return inner.replace(/\\(["\\abfnrtv])/g, (_m, c: string) => {
    const map: Record<string, string> = {
      '"': '"', "\\": "\\", a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v",
    }
    return map[c] ?? c
  })
}

/** `git status --porcelain` 的路径解析。重命名形如 `R  old -> new`，取新名。 */
function parsePorcelain(stdout: string): string[] {
  const files = new Set<string>()
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue
    const path = line.slice(3)
    const arrow = path.indexOf(" -> ")
    files.add(unquotePath(arrow >= 0 ? path.slice(arrow + 4) : path))
  }
  return [...files]
}

/**
 * 逐个算内容哈希。文件不存在（已删除）时跳过——`git hash-object` 会对缺失路径报错，
 * 一次性批量调用会因为一个缺失文件而全军覆没，故逐个来并容错。
 */
async function hashFiles(workspace: string, files: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const f of files) {
    try {
      out[f] = (await git(workspace, ["hash-object", "--", f])).trim()
    } catch {
      // 已删除或不可读——不记哈希，后续比对时视为「变过了」
    }
  }
  return out
}

export async function snapshot(workspace: string): Promise<GitBaseline> {
  const head = (await git(workspace, ["rev-parse", "HEAD"])).trim()
  const dirty = parsePorcelain(
    await git(workspace, ["status", "--porcelain", "--untracked-files=all"]),
  ).sort()
  return {
    head,
    dirtyFiles: dirty,
    dirtyHashes: await hashFiles(workspace, dirty),
    capturedAt: new Date().toISOString(),
  }
}

export interface DiffOptions {
  /**
   * 工作区是否为该会话独占（worktree 隔离）。
   *
   * ①-B **默认 false**——agent 与作者共用同一目录，分不清谁改的。
   * 阶段 ③ 引入 worktree 隔离后才能置 true，届时 `mayIncludeUserEdits` 才为 false。
   */
  isolated?: boolean
}

export async function diffSince(
  workspace: string,
  baseline: GitBaseline,
  opts: DiffOptions = {},
): Promise<FileChangeFacts> {
  const isolated = opts.isolated ?? false

  // 两个来源合并：基线之后的提交 + 当前工作区未提交的改动。
  // 只看其一都会漏——agent 可能自己 commit 了，也可能改完没提交。
  const committed = (await git(workspace, ["diff", "--name-only", `${baseline.head}..HEAD`]))
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)

  const working = parsePorcelain(
    await git(workspace, ["status", "--porcelain", "--untracked-files=all"]),
  )

  const changed = new Set([...committed, ...working])

  // 降噪：基线时就脏、且**内容与基线时一模一样**的文件，可以确定不是 agent 改的。
  // 用内容哈希比对，而不是只看文件名——后者会把「之后又被改了」误判成「没动过」。
  // 哈希对不上、或基线时没记到哈希（文件当时已删除），一律保留：分不清就不剔除。
  const candidates = working.filter(
    (f) => baseline.dirtyHashes[f] !== undefined && !committed.includes(f),
  )
  const nowHashes = await hashFiles(workspace, candidates)
  for (const f of candidates) {
    if (nowHashes[f] !== undefined && nowHashes[f] === baseline.dirtyHashes[f]) changed.delete(f)
  }

  return {
    files: [...changed].sort(),
    mayIncludeUserEdits: !isolated,
    baselineHead: baseline.head,
    computedAt: new Date().toISOString(),
  }
}
