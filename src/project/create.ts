import { mkdirSync, readFileSync, realpathSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { 科研目录, 约定正文, 我们写的指令文件 } from '../policy/science-layout.js'
import { validProjectFolderName } from '../protocol/project-name.js'

export interface CreateProjectInput {
  parentDirectory: string
  name: string
  description?: string | undefined
  scienceLayout?: boolean | undefined
  agentContext?: string | undefined
}

/** Claim a new directory exclusively. Never initialize an existing directory. */
export function initializeProject(input: CreateProjectInput): { workspace: string; rollback: () => void } {
  if (!validProjectFolderName(input.name)) throw new Error('项目名称必须是有效的单个文件夹名称')
  if (!isAbsolute(input.parentDirectory)) throw new Error('父目录必须是绝对路径')
  const parent = realpathSync(input.parentDirectory)
  if (!statSync(parent).isDirectory()) throw new Error('父目录必须是文件夹')
  const workspace = join(parent, input.name)
  try { mkdirSync(workspace) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`目标目录已存在，请使用“打开项目”：${workspace}`)
    throw error
  }
  const created = [workspace]
  const instructions = [input.scienceLayout ? 约定正文.trim() : '', input.agentContext?.trim()].filter(Boolean).join('\n\n')
  const contextFile = join(workspace, 我们写的指令文件)
  let wroteContext = false
  const rollback = () => {
    const problems: unknown[] = []
    if (wroteContext) {
      try {
        if (readFileSync(contextFile, 'utf8') !== instructions + '\n') throw new Error('指令文件已被修改')
        unlinkSync(contextFile)
      } catch (error) { problems.push(error) }
    }
    for (const dir of [...created].reverse()) {
      try { rmdirSync(dir) } catch (error) { problems.push(error) }
    }
    if (problems.length) throw new Error(`新建项目未完成，残留文件保留在：${workspace}`)
  }
  try {
    if (input.scienceLayout) {
      for (const relative of 科研目录) {
        let current = workspace
        for (const component of relative.split('/')) {
          current = join(current, component)
          if (created.includes(current)) continue
          mkdirSync(current); created.push(current)
        }
      }
    }
    if (instructions) { writeFileSync(contextFile, instructions + '\n', { encoding: 'utf8', flag: 'wx' }); wroteContext = true }
    return { workspace, rollback }
  } catch (error) {
    try { rollback() }
    catch (cleanupError) { throw new Error(`${String(error)}；${String(cleanupError)}`) }
    throw error
  }
}
