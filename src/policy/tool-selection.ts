/** 工具选择靠指引；只有用户明确的内核禁令在运行时强制执行。 */
import { 指令文本 } from './execution-boundary.js'
import { 本轮内核语言 } from '../kernel/shortcuts.js'
import { skillUserRequest } from '../skills/request.js'

export const 工具选择指引 =
  '按当前问题选择必要且代价合适的工具。查询下载进度、任务状态、日志或文件情况时，先读取已有摘要、状态文件和清单，必要时补查有限日志、文件属性或进程状态。' +
  '已有信息足以回答时，直接说明来源与时间并回答，不自动扩大成逐文件核验、全盘扫描、重算进度或新一轮分析。摘要过期、缺失或矛盾时，围绕具体缺口补查并说明不确定性，不凭旧记录声称实时状态。' +
  '简单读取、搜索和现成状态查询优先用read或必要的shell命令，不仅因为内容涉及数据就调用Python/R。' +
  '确需短时计算或文件处理时可用一次性脚本；复杂统计、绘图、连续数据分析、需要保留变量或用户明确要求笔记本运行时使用run_code。Python/R语言与持久内核是不同选择，不为轻量查询默认启动内核。' +
  '用户明确要求逐文件完整度核验或复杂统计时，在该任务内选用必要工具连续完成，不要每一步都问；用户只问状态时先回答状态，不擅自重启下载、修改配置或生成额外成果。' +
  '消息带有界面附加的run-code-request时，@R、@Python（兼容@Py）、@RPython是用户明确选择内核运行的入口，应按本轮允许语言调用run_code，不用轻量查询建议替代明确执行要求；下一条普通消息不继承上一轮语言限制。同句明确先不要运行时仍以禁令为准，任务不明确时先澄清。' +
  '用户明确要求不要启动内核时，run_code和inspect_data都不能调用，也不能通过其他工具启动同等内核；可继续读取与必要的shell查询，等待用户明确恢复内核使用。'

export function 远端执行上下文(localWorkspace: string, initialCwd: string): string {
  return '远端执行上下文：这是一段服务器会话。read、bash、write、edit在服务器执行；可用时run_code的内核也在同一服务器。' +
    `会话开始时的远端目录为${JSON.stringify(initialCwd)}，相对路径以远端会话当前目录为准；改变目录后以最新工具结果报告的路径为准。` +
    `系统cwd及项目资源加载位置${JSON.stringify(localWorkspace)}属于本机元数据，不是服务器上的执行目录，不要把这个本机路径用于远端命令。` +
    '内核启动后保持自己的工作目录，后续shell的cd不会移动已启动内核。'
}

type Entry = { type?: string; message?: { role?: string; content?: unknown } }

/** 只识别明确针对内核的限制/恢复，不猜“进度”等词是否允许计算。 */
function 内核指令(content: unknown): boolean | undefined {
  let result: boolean | undefined
  const target = '(?:(?:Python|R|Jupyter|持久)\\s*)?(?:的\\s*)?内核|run_code\\b|inspect_data\\b'
  const lead = '(?:(?:请|你|我们|这次|本轮|现在|目前|暂时|还是|就|先|仅|只|可以|允许)\\s*)*'
  for (const part of 指令文本(content).split(/(?<=[，,。！？!?；;\n])/)) {
    const text = part.trim()
    if (/^(?:如果|假如|比如|例如|假设|你说|他说|用户说|if\b|when\b)/i.test(text)) continue
    if (/[?？]$|(?:吗|是否|能否|要不要)|\b(?:can|could|should|would)\b/i.test(text)) continue
    if (new RegExp(`^${lead}(?:不要|不用|无需|不必|别|禁止|暂不)\\s*(?:启动|开启|新建|创建|使用|调用|运行)\\s*(?:${target})`, 'i').test(text)
      || /^(?:please\s+)?(?:do not|don't|never)\s+(?:start|launch|use|run)\s+(?:the\s+)?(?:(?:python|r|jupyter)\s+)?kernel\b/i.test(text)) {
      result = true
      continue
    }
    if (new RegExp(`^${lead}(?:开始|继续|恢复)?\\s*(?:启动|开启|使用|调用|运行)\\s*(?:${target})`, 'i').test(text)
      || /^(?:please\s+)?(?:start|launch|resume|use)\s+(?:the\s+)?(?:(?:python|r|jupyter)\s+)?kernel\b/i.test(text)) result = false
  }
  if (result !== true && 本轮内核语言([{ role: 'user', content: skillUserRequest(content) }])) return false
  return result
}

export function 内核调用拒绝理由(name: string, branch: readonly Entry[]): string | undefined {
  if (name !== 'run_code' && name !== 'inspect_data') return undefined
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i]!
    if (entry.type !== 'message' || entry.message?.role !== 'user') continue
    const restricted = 内核指令(entry.message.content)
    if (restricted === undefined) continue
    return restricted ? `用户明确要求不要启动或使用内核，不能调用${name}。请读取已有摘要、状态文件或使用必要的shell查询，不要改用其他工具启动内核。用户明确恢复内核使用后，可在已授权任务内连续分析。` : undefined
  }
  return undefined
}
