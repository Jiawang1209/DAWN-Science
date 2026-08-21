/**
 * 把一个技能从本机某处导进技能目录（skills-manage，2026-08-21）。
 *
 * 学自 dsh-skills-manager 的 `importSkill`（Apache-2.0，思路借、代码自己写）——**两阶段**：
 *   1. `预检`：认来源、规整名字、查同名——回 `{ 待导, 冲突, 失败 }`，界面拿到「冲突」才问「覆盖？」；
 *      **预检与实导同口径**（符号链接、深度都在预检查），不会出现「预检过了、确认覆盖之后才失败」。
 *   2. `导入`：先复制到**目标同目录的临时路径**，成了再把旧的改名成备份、临时的改名到位；
 *      失败回滚备份；回滚也失败时把备份路径**报出来**，不吞。
 *
 * 与它不同的几处：
 *   - 只认目录形态（`<name>/SKILL.md`）——agentskills.io 标准只有这一种，pi 也只认这一种；`<name>.md` 不收；
 *   - 选中的是 `SKILL.md` 文件本身时，用它的父目录；
 *   - 名字规整不出合法 kebab 就失败并**说原名**，不猜。
 */
import { promises as fs } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { randomUUID } from "node:crypto"

export const 名字规则 = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const 最深 = 64

/** 尽量规整成 kebab-case；规整不出回空串 */
export function 规整名(s: string): string {
  return String(s)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function 同或在内(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`))
}

async function 真路径(p: string): Promise<string> {
  try {
    return await fs.realpath(p)
  } catch {
    return resolve(p)
  }
}

/** 来源里任何一层有符号链接就拒——它能把目标目录外的东西带进来 */
async function 不许符号链接(root: string): Promise<void> {
  const 栈: { path: string; depth: number }[] = [{ path: root, depth: 0 }]
  while (栈.length) {
    const { path, depth } = 栈.pop()!
    if (depth > 最深) throw new Error(`来源目录超过 ${最深} 层：${root}`)
    const st = await fs.lstat(path)
    if (st.isSymbolicLink()) throw new Error(`来源里有符号链接，不收：${path}`)
    if (!st.isDirectory()) continue
    for (const d of await fs.readdir(path, { withFileTypes: true })) {
      const 子 = join(path, d.name)
      if (d.isSymbolicLink()) throw new Error(`来源里有符号链接，不收：${子}`)
      if (d.isDirectory()) 栈.push({ path: 子, depth: depth + 1 })
    }
  }
}

export interface 候选 {
  /** 规整后的名字（目标目录名） */
  name: string
  /** 来源目录（含 SKILL.md） */
  source: string
}
export interface 预检结果 {
  /** 来源是一个技能还是一筐技能 */
  kind: "single" | "batch"
  待导: 候选[]
  /** 目标里已有同名 */
  冲突: 候选[]
  失败: { source: string; why: string }[]
}

/** 认来源：含 SKILL.md 的目录 / SKILL.md 文件 / 一筐含 SKILL.md 子目录的目录 */
async function 认来源(source: string): Promise<{ kind: "single" | "batch"; dirs: { dir: string; raw: string }[] } | { why: string }> {
  let st
  try {
    st = await fs.lstat(source)
  } catch {
    return { why: `路径不存在：${source}` }
  }
  if (st.isSymbolicLink()) return { why: `来源里有符号链接，不收：${source}` }
  if (st.isFile()) {
    if (basename(source).toLowerCase() !== "skill.md") return { why: `不是技能：要一个含 SKILL.md 的文件夹，给的是 ${basename(source)}` }
    const dir = dirname(source)
    return { kind: "single", dirs: [{ dir, raw: basename(dir) }] }
  }
  if (!st.isDirectory()) return { why: `认不出的来源：${source}` }
  const 自己 = await fs.lstat(join(source, "SKILL.md")).catch(() => undefined)
  if (自己?.isFile() || 自己?.isSymbolicLink()) return { kind: "single", dirs: [{ dir: source, raw: basename(source) }] }
  const dirs: { dir: string; raw: string }[] = []
  for (const d of await fs.readdir(source, { withFileTypes: true })) {
    if (!d.isDirectory() || d.isSymbolicLink()) continue
    const 子 = join(source, d.name)
    const s = await fs.lstat(join(子, "SKILL.md")).catch(() => undefined)
    if (s?.isFile() || s?.isSymbolicLink()) dirs.push({ dir: 子, raw: d.name })
  }
  if (dirs.length === 0) return { why: `这里面没有技能（要含 SKILL.md 的文件夹）：${source}` }
  return { kind: "batch", dirs }
}

export async function 预检(source: string, 目标根: string): Promise<预检结果 | { why: string }> {
  const 认 = await 认来源(source)
  if ("why" in 认) return 认
  const 根真 = await 真路径(目标根)
  const 出: 预检结果 = { kind: 认.kind, 待导: [], 冲突: [], 失败: [] }
  const 计数 = new Map<string, number>()
  for (const d of 认.dirs) 计数.set(规整名(d.raw), (计数.get(规整名(d.raw)) ?? 0) + 1)
  for (const d of 认.dirs) {
    const name = 规整名(d.raw)
    if (!名字规则.test(name)) {
      出.失败.push({ source: d.dir, why: `「${d.raw}」规整不出合法的名字（只能小写字母、数字、连字符）` })
      continue
    }
    if ((计数.get(name) ?? 0) > 1) {
      出.失败.push({ source: d.dir, why: `这一筐里有多个都叫 ${name}` })
      continue
    }
    const 源真 = await 真路径(d.dir)
    if (同或在内(根真, 源真) || 同或在内(源真, 根真)) {
      出.失败.push({ source: d.dir, why: `来源就在技能目录里（或包着它），导了等于把自己删掉` })
      continue
    }
    try {
      await 不许符号链接(d.dir)
    } catch (e) {
      出.失败.push({ source: d.dir, why: e instanceof Error ? e.message : String(e) })
      continue
    }
    const 已有 = await fs.lstat(join(目标根, name)).catch(() => undefined)
    ;(已有 ? 出.冲突 : 出.待导).push({ name, source: d.dir })
  }
  return 出
}

const 临时 = (target: string, kind: string) => join(dirname(target), `.${basename(target)}.dawn-${kind}-${randomUUID()}`)

/** 临时副本就绪再换；换失败尽力恢复旧的，恢复不了把备份路径报出来 */
async function 换上(source: string, dest: string, 覆盖: boolean): Promise<string[]> {
  const stage = 临时(dest, "stage")
  try {
    await fs.cp(source, stage, { recursive: true, dereference: false, verbatimSymlinks: true })
    await 不许符号链接(stage)
  } catch (e) {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined)
    throw e
  }
  const 警告: string[] = []
  let 备份: string | undefined
  try {
    if (覆盖) {
      备份 = 临时(dest, "backup")
      await fs.rename(dest, 备份)
    }
    await fs.rename(stage, dest)
  } catch (e) {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined)
    if (备份) {
      try {
        await fs.rename(备份, dest)
      } catch {
        throw new Error(`${e instanceof Error ? e.message : String(e)}；回滚也失败了，旧版本留在 ${备份}`)
      }
    }
    throw e
  }
  if (备份) {
    await fs.rm(备份, { recursive: true, force: true }).catch((e: unknown) => {
      警告.push(`旧版本的备份没清掉：${备份}（${e instanceof Error ? e.message : String(e)}）`)
    })
  }
  return 警告
}

export interface 导入结果 {
  kind: "single" | "batch"
  导了: { name: string; dest: string; 覆盖了: boolean; 警告: string[] }[]
  跳过: 候选[]
  失败: { source: string; why: string }[]
}

/** 正式导入。`覆盖 = false` 时冲突的跳过 */
export async function 导入(source: string, 目标根: string, 覆盖: boolean): Promise<导入结果 | { why: string }> {
  const 检 = await 预检(source, 目标根)
  if ("why" in 检) return 检
  const 出: 导入结果 = { kind: 检.kind, 导了: [], 跳过: [], 失败: [...检.失败] }
  if (检.待导.length + (覆盖 ? 检.冲突.length : 0) > 0) await fs.mkdir(目标根, { recursive: true })
  for (const c of 检.待导) {
    const dest = join(目标根, c.name)
    try {
      出.导了.push({ name: c.name, dest, 覆盖了: false, 警告: await 换上(c.source, dest, false) })
    } catch (e) {
      出.失败.push({ source: c.source, why: e instanceof Error ? e.message : String(e) })
    }
  }
  for (const c of 检.冲突) {
    if (!覆盖) {
      出.跳过.push(c)
      continue
    }
    const dest = join(目标根, c.name)
    try {
      出.导了.push({ name: c.name, dest, 覆盖了: true, 警告: await 换上(c.source, dest, true) })
    } catch (e) {
      出.失败.push({ source: c.source, why: e instanceof Error ? e.message : String(e) })
    }
  }
  return 出
}
