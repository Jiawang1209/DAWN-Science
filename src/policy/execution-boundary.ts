/**
 * 普通对话由统一指引约束；这里只识别明确的“只讨论 / 先别运行”及解除指令。
 * 当前 pi 分支是唯一权威：不扫描工具输出、助手回复或未送达的排队消息。
 */
import { 本轮内核语言 } from '../kernel/shortcuts.js'
import { 扫内核指令 } from '../files/mentions.js'
import { displayTerminalRequest } from '../terminal/request.js'

export const 讨论执行指引 =
  '先判断用户当前是在讨论还是要求执行。普通聊天、解释概念、比较方法、讨论方案、询问看法时，直接用文字回答；' +
  '不要仅因为工具或 Python/R 环境可用，就调用 run_code、bash、自检环境、计算示例或生成示例图。' +
  '用户明确要求处理数据、计算、分析、绘图、修改文件或按已批准方案执行时，可以直接使用必要工具。' +
  '同一个已经授权的任务内，读取、计算、绘图、验证和交付连续完成，不要每一步都问是否继续；' +
  '用户说“继续”时结合前文已授权任务，不能扩大为不相关任务。' +
  '用户明确说“先讨论”“先别运行”“只给代码”时保持讨论，不执行代码、不写文件、不通过 shell、MCP 或子 agent 绕过。' +
  '明确要求开始或恢复执行后再执行；范围不清且执行会改变文件或启动分析时，先简短澄清一次。' +
  '提供未执行的代码时如实说明未运行。已有方案审批与权限要求继续生效。'

/** 类型明确的读取工具；inspect_data 会起内核，因此不属于纯讨论的只读入口。 */
const 讨论只读 = new Set(['terminal_list', 'terminal_snapshot', 'terminal_wait', 'read', 'ls', 'grep', 'find', 'look_at_image', 'read_main_session', 'ask_user_question', 'propose_plan', 'get_analysis_route', 'update_analysis_route'])

type Entry = { type?: string; message?: { role?: string; content?: unknown } }

/** 排除引用 / 代码与附图转述；这些文字不是用户向当前助手发出的指令。 */
export function 指令文本(content: unknown): string {
  const text = typeof content === 'string' ? content : Array.isArray(content)
    ? content.flatMap((b: { type?: string; text?: string }) => b?.type === 'text' && typeof b.text === 'string' ? [b.text] : []).join('\n') : ''
  let plain = displayTerminalRequest(text).split('[以下是随消息附上的')[0]!
    .replace(/```[^]*?(?:```|$)|~~~[^]*?(?:~~~|$)/g, '')
    .replace(/^\s*>.*$/gm, '')
    // 格式化的工具名仍是指令的宾语；整句代码示例及引文继续排除。
    .replace(/(?<!`)(`+)(run_code|inspect_data)\1(?!`)/g, '$2')
    .replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"|`[^`\n]*`/g, '')
  // 快捷标记是执行方式；不要让前置的 @Python 遮住同句“先不要运行”。
  for (const shortcut of 扫内核指令(plain).reverse()) {
    plain = plain.slice(0, shortcut.start) + ' '.repeat(shortcut.end - shortcut.start) + plain.slice(shortcut.end)
  }
  return plain
}

/** undefined = 本句不改变既有边界；true = 明确限制；false = 明确解除。 */
export function 执行指令(content: unknown): boolean | undefined {
  const text = 指令文本(content)
  let result: boolean | undefined
  for (const raw of text.split(/(?<=[，,。！？!?；;\n])/)) {
    const clause = raw.trim()
    if (!clause) continue
    // 谈论一句命令、询问可否执行，都不是实际下令。
    if (/^(?:如果|假如|例如|比如|假设|你说|他说|用户说|when\b|if\b)/i.test(clause)) continue
    const lead = '(?:(?:请|你|我们|咱们|这次|本轮|现在|目前|暂时|还是|就|先|仅|只)\\s*)*'
    if (new RegExp(`^${lead}(?:不要|不许|禁止|别|无需|不用|不需要|不|暂不)(?:再|实际|直接|自动|擅自)?(?:执行|运行|跑(?:代码|程序|分析)?|调用(?:工具|Python|R\\b)|改(?:文件|代码)|写文件)`, 'i').test(clause)
      || /^(?:(?:请|我们|咱们|这次|本轮|现在|目前|还是)\s*)*(?:先|只|仅|暂时)(?:只|仅)?(?:讨论|聊|解释|给(?:出)?(?:代码|脚本|方案)|看(?:看)?(?:方案|方法|思路))/.test(clause)
      || /^(?:(?:please|let'?s)\s+)?(?:(?:do not|don'?t|never)\s+(?:run|execute|write|modify)|(?:only|just)\s+(?:discuss|explain|provide code)|discuss only)/i.test(clause)) {
      result = true
      continue
    }
    if (/[?？]$|(?:吗|么|是否|能否|要不要|可不可以|怎么|如何|什么|怎样|哪些)|\b(?:can|could|should|would)\s+(?:you|we|i)\b/i.test(clause)) continue
    const command = clause.replace(/^(?:(?:请|帮我|麻烦|那就|现在|可以|好(?:的)?)\s*)+/, '')
    if (!/^(?:请|帮我|麻烦)/.test(clause) && /^(?:(?:执行|运行|计算|修改|修复|分析)(?:结果|环境|过程|步骤|方式|方法|时间|速度|权限|边界|模式|日志|状态|记录|前|后|过|的)|保存(?:后|过|的|结果(?:的|是|已)))/.test(command)) continue
    if (/^(?:(?:请|帮我|麻烦|那就|现在|可以|好(?:的)?)\s*)*(?:(?:开始|继续|恢复)(?:执行|运行|跑|分析|计算|处理|画|绘图|改|做)|(?:实际)?(?:执行|运行|跑代码|计算)|(?:修改|修复|写入|保存|安装|删除)|(?:分析|处理).*(?:数据|表格|文件|\.csv\b)|(?:绘制|画).*(?:图)|照批准的方案做|按(?:照)?(?:这个|上面|刚才|批准的)?(?:方案|计划)(?:开始)?(?:执行|做)|开始吧)/i.test(clause)
      || /^(?:please\s+)?(?:(?:start|continue|resume)\s+(?:running|executing|the analysis)|(?:run|execute|calculate)\b)/i.test(clause)) result = false
  }
  // @R/@Py 是用户显式运行入口；同句“先别运行”优先于快捷标记。
  if (result !== true && 本轮内核语言([{ role: 'user', content }])) return false
  return result
}

export function 仅讨论(branch: readonly Entry[]): boolean {
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i]!
    if (entry.type !== 'message' || entry.message?.role !== 'user') continue
    const instruction = 执行指令(entry.message.content)
    if (instruction !== undefined) return instruction
  }
  return false
}

export function 讨论拒绝理由(name: string, branch: readonly Entry[], mcpReadOnly = false): string | undefined {
  if (!仅讨论(branch) || 讨论只读.has(name) || mcpReadOnly) return undefined
  return `当前按用户要求只讨论 / 提供代码，尚未恢复执行，不能调用 ${name}。请用文字回答，不要换用其他工具绕过；用户明确要求开始或继续执行后，在已授权任务内连续完成，不必逐步询问。`
}
