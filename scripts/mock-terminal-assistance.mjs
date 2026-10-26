/** Shared deterministic model scenario; terminal processes and control operations remain real. */
export const TERMINAL_CONTROL_OPERATIONS = ['getTerminalAgentAttachments', 'updateTerminalAgentAttachments', 'getTerminalAgentImage', 'getTerminalAgentMode', 'listTerminalAgentHistory', 'setTerminalAgentMode', 'selectTerminal', 'getTerminalControl', 'setTerminalControl', 'resizeTerminal', 'interruptTerminal', 'sendTerminalPrompt']
const text = content => typeof content === 'string' ? content : (content ?? []).map(b => b.text ?? '').join('\n')
function turn(body) {
  const messages = body.messages ?? [], index = messages.findLastIndex(m => m.role === 'user')
  const request = text(messages[index]?.content)
  if (!request.includes('终端协助验收') && !request.includes('终端自然语言验收')) return undefined
  const current = messages.slice(index + 1)
  const calls = current.flatMap(m => m.tool_calls ?? [])
  const results = current.filter(m => m.role === 'tool').map(m => {
    let data
    try { data = JSON.parse(text(m.content)) } catch { data = { error: text(m.content) } }
    return { name: m.name ?? calls.find(c => c.id === m.tool_call_id)?.function?.name, data }
  })
  return { request, results }
}
export function terminalAssistanceTool(body) {
  const t = turn(body)
  if (!t) return undefined
  const last = t.results.at(-1)
  if (last?.data?.error) return undefined
  if (!t.results.length) return { toolName: 'terminal_list', args: {} }
  const listed = t.results.find(r => r.name === 'terminal_list')?.data
  const terminal = Array.isArray(listed) ? listed.find(t => t.controlled) : undefined
  if (!terminal) return undefined
  const terminal_id = terminal.id
  if (!t.results.some(r => r.name === 'terminal_snapshot')) return { toolName: 'terminal_snapshot', args: { terminal_id } }
  if (t.request.includes('只读')) return undefined
  if (!t.results.some(r => r.name === 'terminal_execute')) {
    const code = t.request.includes('终端自然语言验收')
      ? 'pwd > terminal-natural-result.txt; printf "\\nNATURAL_INPUT_OK\\n"'
      : t.request.includes('Python')
      ? 'dawn_number += 2\nopen("python-ai-result.txt", "w").write(str(dawn_number))\nprint("PYTHON_RESULT", dawn_number)'
      : t.request.includes('R变量')
      ? 'dawn_number <- dawn_number + 2; writeLines(as.character(dawn_number), "r-ai-result.txt"); print(dawn_number)'
      : t.request.includes('长任务')
      ? 'sleep 12; printf done > terminal-long-result.txt'
      : 'printf "%s|%s|%s" "$DAWN_TERMINAL_SAMPLE" "$PWD" "$$" > terminal-ai-result.txt; printf "\\nTERMINAL_VALUE=%s\\n" "$DAWN_TERMINAL_SAMPLE"'
    return { toolName: 'terminal_execute', args: { terminal_id, code } }
  }
  if (!t.results.some(r => r.name === 'terminal_wait')) return { toolName: 'terminal_wait', args: { terminal_id, timeout_ms: t.request.includes('长任务') ? 200 : 3000 } }
  return undefined
}
export function terminalAssistanceReply(body) {
  const t = turn(body)
  if (!t) return undefined
  const data = t.results.at(-1)?.data
  const note = data?.error ? '终端操作没有执行成功，请根据工具返回处理。'
    : data?.task?.state === 'completed' ? `终端执行已返回，状态码 ${data.task.exitCode}。`
    : data?.task?.state === 'running' ? '终端任务仍在运行，本轮只结束等待，没有重复发送命令。'
    : t.request.includes('只读') ? '已读取终端当前画面，本轮没有输入。'
    : '请先在终端协助行把终端交给当前对话。'
  const observed = t.request.includes('只读') ? data?.text
    : data?.text?.split('\n').filter(line => /^(TERMINAL_VALUE=|PYTHON_RESULT |NATURAL_INPUT_OK|\[1\])/.test(line)).join('\n')
  const detail = data?.error ?? observed
  return `${note}${detail ? `\n\n实际终端输出：\n\n\`\`\`text\n${detail}\n\`\`\`` : ''}\n\n这是隔离预览的固定模型场景；终端进程、变量、文件及控制权交接为真实执行。`
}
