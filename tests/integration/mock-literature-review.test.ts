import { expect, it } from 'vitest'
// @ts-expect-error shared development/Electron inference fixture
import { reviewMockTool, reviewMockReply } from '../../scripts/mock-literature-review.mjs'
const tools = ['pdf_read', 'xlsx_write', 'xlsx_edit', 'xlsx_read', 'write', 'read'].map(name => ({function: {name}}))
const user = {role: 'user', content: '文献对照验收'}
it('技能正文中的只讨论规则不会劫持实际用户要求导出的场景', () => {
  const expanded = '<skill name="literature-review" location="/skills/literature-review/SKILL.md">\n用户只讨论时不导出。\n</skill>\n\n文献对照验收，导出表格。'
  expect(reviewMockTool({messages: [{role: 'user', content: expanded}], tools})?.toolName).toBe('pdf_read')
})
it('只匹配当前轮；只讨论不读写，缺工具不绕行', () => {
  expect(reviewMockTool({messages: [user, {role: 'user', content: '其他问题'}], tools})).toBeUndefined()
  expect(reviewMockTool({messages: [{...user, content: '文献对照验收 只讨论'}], tools})).toBeUndefined()
  expect(reviewMockReply({messages: [{...user, content: '文献对照验收 只讨论'}], tools})).toContain('未读取或写入文件')
  expect(reviewMockTool({messages: [user], tools: []})).toBeUndefined()
  expect(reviewMockReply({messages: [user], tools: []})).toContain('工具不可用')
  expect(reviewMockReply({messages: [{role: 'system', content: '为用户建议下一句'}, user], tools: []})).toBeUndefined()
})
it('工具失败停止，不把已读部分写成完成', () => {
  const body = {messages: [user, {role: 'assistant', tool_calls: [{id: 'r1', function: {name: 'pdf_read', arguments: '{}'}}]}, {role: 'tool', tool_call_id: 'r1', content: 'PDF read failed: file not found'}], tools}
  expect(reviewMockTool(body)).toBeUndefined()
  expect(reviewMockReply(body)).toContain('未完成')
  for (const content of ['当前按用户要求只讨论，不能调用 pdf_read。', 'ENOENT: no such file or directory']) {
    const blocked = {...body, messages: [...body.messages.slice(0, -1), {role: 'tool', tool_call_id: 'r1', content}]}
    expect(reviewMockTool(blocked)).toBeUndefined()
    expect(reviewMockReply(blocked)).toContain('未完成')
  }
})
it('只从实际返回页提取短摘；缺失 n 不补，扫描件保留为不可提取', () => {
  const sources = ['--- Page 1 ---\nTitle: Alpha\n--- Page 2 ---\nBiological replicates: 17 per group.\nOutcome: Increased.', '--- Page 1 ---\nTitle: Beta\n--- Page 2 ---\nOutcome: Decreased.', '--- Page 1 ---\n(empty)']
  const messages: object[] = [user]
  sources.forEach((content, i) => {
    messages.push({role: 'assistant', tool_calls: [{id: `r${i}`, function: {name: 'pdf_read', arguments: JSON.stringify({file_path: `papers/study-${['a','b','scan'][i]}.pdf`})}}]}, {role: 'tool', tool_call_id: `r${i}`, content})
  })
  const next = reviewMockTool({messages, tools})
  expect(next.toolName).toBe('write')
  expect(next.args.content).toContain('17 per group.')
  expect(next.args.content).toContain('PDF 物理页 2')
  expect(next.args.content).toContain('未提供')
  expect(next.args.content).toContain('文本不可提取')
  expect(next.args.content).not.toContain('8 per group.')
})
