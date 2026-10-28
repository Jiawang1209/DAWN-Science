import { basename } from 'node:path'
import { DeliveryPathSchema, type DeliveryGeneration, type DeliveryPlan } from '../protocol/delivery.js'

export interface ReportFile { path: string; copyPath: string; generated?: boolean }
export interface RecordedCall { script: string; command: string }

/** Only backend-frozen, completed, simple direct calls qualify as history. Other Shell forms stay unknown. */
export function recordedScriptCall(source: unknown, workspace: string): RecordedCall | undefined {
  const execution = (source as {execution?: Record<string, unknown>} | undefined)?.execution
  if (!execution || execution.workspace !== workspace || execution.tool !== 'bash' || execution.dispatch !== 'completed' || execution.status !== 'captured' || typeof execution.code !== 'string') return
  let command: unknown
  try { command = (JSON.parse(execution.code) as {command?: unknown}).command } catch { return }
  if (typeof command !== 'string' || /[\r\n]/.test(command)) return
  const words = command.trim().split(/\s+/)
  if (words.some(word => !/^[^\s'"`$;&|<>\\()]+$/.test(word))) return
  const runner = basename(words[0] ?? '')
  if (!/^(python(?:3(?:\.\d+)?)?|Rscript)$/.test(runner)) return
  const script = words[runner === 'Rscript' && words[1] === '--vanilla' ? 2 : 1]?.replace(/^\.\//, '')
  if (!script || !DeliveryPathSchema.safeParse(script).success || !(runner === 'Rscript' ? /\.r$/i : /\.py$/i).test(script)) return
  return {script, command}
}

const quote = (arg: string) => `'${arg.replace(/'/g, "'\\''")}'`
export const reportText = (text: string) => text.replace(/\\/g, '\\\\').replace(/[\[\]`]/g, '\\$&').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const prose = reportText
const code = (text: string) => { const ticks = '`'.repeat(Math.max(1, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1))); return `${ticks} ${text} ${ticks}` }
const link = (file: ReportFile) => `[${prose(file.path)}](${file.copyPath.split('/').map(encodeURIComponent).join('/').replace(/[()]/g, c => '%' + c.charCodeAt(0).toString(16))})`
const shellBlock = (command: string) => { const fence = '`'.repeat(Math.max(3, ...[...command.matchAll(/`+/g)].map(m => m[0].length + 1))); return `${fence}sh\n${command}\n${fence}` }
const runner = (script: string) => /\.r$/i.test(script) ? 'Rscript --vanilla' : 'python3'

/** Pure assembly: filenames and links come from the copied-file index, never model-authored Markdown. */
export function buildAnalysisReport(p: {
  name: string; generated: DeliveryGeneration; files: ReportFile[]; inputs: string[]; history?: RecordedCall[]; plan?: DeliveryPlan
}): {report: string; readme: string; gaps: string[]} {
  const files = new Map(p.files.filter(f => !f.generated).map(f => [f.path, f]))
  const sources = p.files.filter(f => !f.generated && /\.(py|r)$/i.test(f.path))
  const inputSet = new Set(p.inputs), used = new Set<string>(), shownResults = new Set<string>(), gaps: string[] = []
  const lines = [`# ${prose(p.name)} · 分析报告`, '', '> 整理时快照：本阶段没有执行分析；历史调用与建议调用分别标明。最新验证状态见工作台交付记录和 validation/verification.json。', '', '## 分析目的与结果解读', '', prose(p.generated.interpretation), '', '## 分步骤脚本与调用', '', '**调用位置：交付目录下的 files/**。以下建议命令指向本次采用的脚本副本；原始输入可能仅引用，运行前须按脚本要求准备输入、依赖和路径。本次尚未验证这些命令可直接运行；展示顺序不代表已验证的执行顺序。', '']
  const references = (paths: string[], label: string, inputs = false) => {
    if (!paths.length) return
    lines.push(`**${label}**`, '')
    for (const path of paths) {
      const file = files.get(path)
      if (file) { lines.push(`- ${link(file)}`); if(!inputs && /\.(png|jpe?g|gif|webp|svg)$/i.test(file.path)){lines.push('', '!'+link(file), '');shownResults.add(file.path)} }
      else if (inputs && inputSet.has(path)) lines.push(`- ${code(path)}（原项目引用，未复制）`)
      else { gaps.push(`步骤引用未采用或未复制的文件：${path}`); lines.push(`- ${code(path)}（未纳入本次交付）`) }
    }
    lines.push('')
  }
  for (const [index, step] of (p.generated.steps ?? []).entries()) {
    const script = files.get(step.script)
    if (!script || script.generated || !/\.(py|r)$/i.test(script.path)) { gaps.push(`步骤脚本未纳入本次交付：${step.script}`); continue }
    used.add(step.script)
    lines.push(`### ${index + 1}. ${prose(step.title)}`, '', prose(step.purpose), '', `脚本：${link(script)}`, '')
    const actual = p.history?.find(call => call.script === step.script)
    if (actual) {lines.push('**原工作区历史调用记录（已记录命令完成，脚本版本未核对；不等于本次重跑）**', '', shellBlock(actual.command), '');gaps.push(`历史调用的脚本版本未核对：${step.script}`)}
    if (step.args !== undefined) lines.push('**建议调用方式（未执行）**', '', shellBlock(`${runner(step.script)} ${[step.script.startsWith('-') ? './' + step.script : step.script, ...step.args].map(quote).join(' ')}`), '')
    else if (!actual) { lines.push('调用方式未记录；请核对脚本的入口、参数及运行位置。', ''); gaps.push(`调用方式未记录：${step.script}`) }
    references(step.inputs, '输入', true)
    references(step.outputs, '输出')
    if (step.interpretation) lines.push(prose(step.interpretation), '')
  }
  const remaining = sources.filter(f => !used.has(f.path))
  if (remaining.length) {
    lines.push('### 未确认步骤的脚本', '', '以下文件已保留，采用关系与执行顺序尚未确认；文件编号不能证明运行顺序。', '')
    for (const file of remaining) {
      lines.push(`- ${link(file)}`)
      const actual = p.history?.find(call => call.script === file.path)
      if (actual) {lines.push('', '原工作区历史调用记录（已记录命令完成，脚本版本未核对）：', '', shellBlock(actual.command), '');gaps.push(`历史调用的脚本版本未核对：${file.path}`)}
      else gaps.push(`步骤及调用方式未记录：${file.path}`)
    }
    lines.push('')
  }
  const generated = p.files.filter(f => f.generated)
  if (generated.length) {
    lines.push('## 整理后的验证脚本', '', '以下验证入口建议在交付根目录调用。这些代码由整理阶段生成，不代表原分析当时使用的脚本；尚未在本次整理中执行。', '')
    for (const file of generated) {
      lines.push(`- ${link(file)}`)
      if (p.plan?.script === file.path) lines.push('', '建议验证调用（须先核对输入/输出范围，未执行）：', '', shellBlock(`${runner(file.path)} ${[file.path, ...p.plan.args].map(quote).join(' ')}`), '', '`{workspace}` 表示原工作区，`{output}` 表示全新验证输出目录。', '')
    }
  }
  if (!sources.length) gaps.push('原分析脚本未提供或未复制，无法确认当时采用的脚本。')
  const images=p.files.filter(f=>/\.(png|jpe?g|gif|webp|svg)$/i.test(f.path)&&!shownResults.has(f.path))
  if(images.length)lines.push('## 其他选定图片','',...images.flatMap(f=>['!'+link(f),'']))
  lines.push('## 文件清单', '')
  for (const file of p.files) lines.push(`- ${link(file)}`)
  if (p.inputs.length) lines.push('', '### 输入引用', '', ...p.inputs.map(path => `- ${code(path)}（原项目引用；以实际复制清单为准）`))
  const readme = `# ${prose(p.name)}\n\n[分析报告](分析报告.md)包含分步脚本、调用说明和结果解读；完整代码保留在独立文件中。\n\n## 运行与依赖说明\n\n${prose(p.generated.readme)}\n\n## 采用文件\n\n${p.files.map(file => '- ' + link(file)).join('\n')}\n\n整理阶段没有执行分析。调用建议未经本次运行验证，输入、依赖与工作目录需核对；最新状态见工作台交付记录。\n`
  return {report: lines.join('\n'), readme, gaps: [...new Set(gaps)]}
}
