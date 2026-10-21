/** 显式“工具边界验收”夹具；固定选工具仅验证接线，不代表真实模型选择质量。 */
function turn(body) {
  const messages = body.messages ?? []
  const user = messages.findLast(m => m.role === 'user')
  const text = typeof user?.content === 'string' ? user.content : (user?.content ?? []).map(b => b.text ?? '').join('\n')
  return text.includes('工具边界验收') ? { messages, text } : undefined
}

export function toolSelectionDemoTool(body) {
  const current = turn(body)
  if (!current || current.messages.at(-1)?.role !== 'user') return undefined
  if (current.text.includes('不要启动内核') || current.text.includes('恢复内核')) return { toolName: 'run_code', args: { language: 'python', code: 'x = 40 + 2\nprint(x)' } }
  if (current.text.includes('切换目录')) return { toolName: 'bash', args: { command: 'cd 数据 && pwd' } }
  const remote = JSON.stringify(current.messages.filter(m => m.role === 'system' || m.role === 'developer')).includes('远端执行上下文')
  return { toolName: 'read', args: { path: remote ? '/home/dawn/下载状态.txt' : 'download-status.txt' } }
}

export function toolSelectionDemoReply(body) {
  const current = turn(body)
  if (!current) return undefined
  const result = current.messages.findLast(m => m.role === 'tool')
  const output = typeof result?.content === 'string' ? result.content : JSON.stringify(result?.content ?? '')
  if (!result) return '这是隔离验收，尚未收到工具结果。'
  if (output.includes('用户明确要求不要启动或使用内核')) return '内核调用已被运行时拦住，未启动 Python。可以继续读取现成状态和进行必要的 shell 查询。\n\n这是固定模型的隔离接线演示。'
  if (current.text.includes('恢复内核')) return output.includes('[python 内核]')
    ? `已恢复内核使用，实际工具输出：\n\n${output}\n\n这是固定模型的隔离接线演示。`
    : `内核使用限制已解除，但本次执行尚未成功：\n\n${output}\n\n这是固定模型的隔离接线演示。`
  if (current.text.includes('切换目录')) return `服务器工具返回：\n\n${output}\n\n这是固定模型的隔离接线演示。`
  return `已读取现成下载状态：\n\n${output}\n\n信息足以回答本次进度查询，本轮到此结束。未启动 Python/R 内核，也未扫描逐个文件。\n\n以上为隔离测试数据，固定模型仅用于接线验收。`
}
