// Shared deterministic inference fixture. PDF/Excel/files are real; scientific reasoning is not evaluated here.
const text = value => typeof value === 'string' ? value : (value ?? []).map(b => b.text ?? '').join('\n')
const inputs = ['papers/study-a.pdf', 'papers/study-b.pdf', 'papers/study-scan.pdf']
const directory = 'outputs/literature-review/acceptance'
const book = `${directory}/论文对照.xlsx`, report = `${directory}/文献总结.md`
const required = ['pdf_read', 'xlsx_write', 'xlsx_edit', 'xlsx_read', 'write', 'read']
function turn(body) {
  const messages = body.messages ?? [], index = messages.findLastIndex(m => m.role === 'user')
  const system = text(body.system) || text(messages.find(m => m.role === 'system' || m.role === 'developer')?.content)
  if (system.includes('为用户建议下一句')) return
  const raw = text(messages[index]?.content)
  // Explicit /skill calls include the guide before the user's actual request.
  const request = /^<skill\b[^>]*>[\s\S]*?<\/skill>\s*([\s\S]*)$/.exec(raw)?.[1] ?? raw
  if (!request.includes('文献对照验收')) return
  const current = messages.slice(index + 1), calls = current.flatMap(m => m.tool_calls ?? [])
  const results = current.filter(m => m.role === 'tool').map(m => {
    const call = calls.find(c => c.id === m.tool_call_id)
    let args = {}; try { args = JSON.parse(call?.function?.arguments ?? '{}') } catch {}
    return {name: m.name ?? call?.function?.name, args, content: text(m.content)}
  })
  const missing = required.filter(name => !(body.tools ?? []).some(t => t.function?.name === name))
  const failed = results.find(r => /failed|file not found|ENOENT|^Error:|"error"\s*:|permission.*denied|不能调用|拒绝/i.test(r.content))
  return {request, results, missing, failed}
}
function material(results) {
  const evidence = [['证据 ID', '文献 ID', '字段', '原文信息', '原文件', 'PDF 物理页', '原文短摘', '状态']]
  const overview = [['文献 ID', '原文件', '题名', '材料状态', '已读范围', '设计', '生物重复', '技术重复', '方法', '主要结果', '局限']]
  const fields = ['Title', 'Design', 'Biological replicates', 'Technical repeats', 'Method', 'Outcome', 'Limitations']
  inputs.forEach((path, i) => {
    const source = results.find(r => r.name === 'pdf_read' && r.args.file_path === path)?.content ?? ''
    const pages = [...source.matchAll(/--- Page (\d+) ---\s*([\s\S]*?)(?=--- Page \d+ ---|$)/g)]
    const readable = pages.some(p => p[2].trim() && p[2].trim() !== '(empty)')
    const values = fields.map((field, j) => {
      for (const page of pages) {
        // pdf_read preserves physical pages, while text items may be joined with spaces.
        const quote = new RegExp(`(?:^|\\s)(${field}:[\\s\\S]*?)(?=\\s+(?:${fields.join('|')}):|$)`).exec(page[2])?.[1]?.trim()
        if (!quote) continue
        const value = quote.slice(field.length + 1).trim(), id = `P${i+1}-E${j+1}`
        evidence.push([id, `P${i+1}`, field, value, path, Number(page[1]), quote, '已定位'])
        return `${value} [${id}]`
      }
      return readable ? '未提供（未在已读范围找到）' : '文本不可提取'
    })
    overview.push([`P${i+1}`, path, values[0], readable ? '全文可读' : '文本不可提取', pages.map(p => Number(p[1])).join(', '), ...values.slice(1)])
  })
  const differences = [['比较项', '涉及证据', '判断', '待核对'], ['结果方向', 'P1-E6 / P2-E6', '方向不同，可比性待核对', '模型归纳：核对设计、终点及独立样本单位，不据此称相互推翻']]
  const markdown = '# 合成论文对照\n\n本次为确定性工程验收，不是实际文献综述。\n\n## 材料与覆盖范围\n\n' + overview.slice(1).map(r => `- ${r[0]}：${r[1]}；${r[3]}；已读 PDF 物理页 ${r[4]}。`).join('\n') + '\n\n## 逐项证据\n\n' + evidence.slice(1).map(r => `- ${r[0]}：${r[4]}，PDF 物理页 ${r[5]}，“${r[6]}”。`).join('\n') + '\n\n## 缺口与解释\n\n' + overview.slice(1).map(r => `${r[0]}：${r.slice(5).join('；')}`).join('\n\n') + '\n\n方向不同，可比性待核对；模型归纳不能替代原文结论。文本不可提取的文件未作全文判断，没有生成缺失 n。\n\nExcel 包含文献清单、逐项证据、差异对照。读回只证明工程链路，科学核验仍需研究者复核。\n'
  return {overview, evidence, differences, markdown}
}
export function reviewMockTool(body) {
  const t = turn(body)
  if (!t || t.failed || t.missing.length || t.request.includes('只讨论')) return
  const read = t.results.filter(r => r.name === 'pdf_read').length
  if (read < inputs.length) return {toolName: 'pdf_read', args: {file_path: inputs[read], start_page: 1, end_page: 2}, say: '按物理页读取合成验收材料。'}
  const data = material(t.results)
  if (!t.results.some(r => r.name === 'write')) return {toolName: 'write', args: {path: report, content: data.markdown}, say: '保存基于实际 PDF 文本的工程验收总结。'}
  if (!t.results.some(r => r.name === 'xlsx_write')) return {toolName: 'xlsx_write', args: {file_path: book, sheet_name: '文献清单', data: data.overview, header_bold: true, column_widths: [12, 30, 34, 20, 16, 35, 26, 26, 35, 35, 35]}}
  if (!t.results.some(r => r.name === 'xlsx_edit')) return {toolName: 'xlsx_edit', args: {file_path: book, operations: [{action: 'add_sheet', name: '逐项证据'}, {action: 'append_rows', sheet: '逐项证据', rows: data.evidence}, {action: 'add_sheet', name: '差异对照'}, {action: 'append_rows', sheet: '差异对照', rows: data.differences}], style_sheet: '逐项证据', header_bold: true, column_widths: [14, 12, 24, 45, 32, 18, 55, 18]}}
  const sheets = ['文献清单', '逐项证据', '差异对照'], checked = t.results.filter(r => r.name === 'xlsx_read').length
  if (checked < sheets.length) return {toolName: 'xlsx_read', args: {file_path: book, sheet: sheets[checked]}}
  if (!t.results.some(r => r.name === 'read')) return {toolName: 'read', args: {path: report}}
}
export function reviewMockReply(body) {
  const t = turn(body); if (!t) return
  if (t.request.includes('只讨论')) return '可以按文献清单、逐项证据和差异对照组织；本轮只讨论，未读取或写入文件。'
  if (t.missing.length) return `工具不可用：${t.missing.join('、')}。本轮保留文本方案，尚未生成文件，请按需开启插件并新建 API 会话。`
  if (t.failed) return `文献对照未完成：${t.failed.content.slice(0, 240)}。不能声称已完整核验。`
  if (!t.results.some(r => r.name === 'read')) return '正在读取合成验收材料并核对输出。'
  return `文献对照验收完成：3 份材料，P3 文本不可提取，P2 生物重复未提供。\n\n- ${book}\n- ${report}\n\n方向不同，可比性待核对。确定性模型仅用于工具链验收，不证明真实模型的科学判断质量。`
}
