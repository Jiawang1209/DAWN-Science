import { expect, it } from 'vitest'
import { visibleWidth } from '@earendil-works/pi-tui'
import { CliTranscript } from '../../src/cli/tui-transcript.js'
import type { QuestionRecord } from '../../src/protocol/questions.js'

const record: QuestionRecord = { requestId: 'choices', state: 'pending', questions: [
  { id: 'scope', header: '分析范围', question: '选择哪些样本？', options: [{ label: '全部样本', description: '保留全部符合条件的样本，逐项核对缺失情况。' }, { label: '健康组', description: '只使用健康组。' }] },
  { id: 'metrics', header: '分析指标', question: '需要哪些指标？', multi_select: true, options: [{ label: '多样性' }, { label: '丰度' }] },
] }
it('keeps the original numbered inline choices with blank spacing and bounded CJK wrapping', () => {
  const t = new CliTranscript(false)
  t.question(record)
  const lines = t.render(44), text = lines.join('\n')
  expect(text).toContain('选择哪些样本？')
  expect(text).not.toContain('需要你确认')
  expect(text).not.toContain('第 1/2 题')
  expect(text).toContain('1. 全部样本 ·')
  expect(text).toMatch(/情况。\n\n\s+2\. 健康组/)
  expect(text).not.toContain('需要哪些指标？')
  expect(lines.every(line => visibleWidth(line) <= 44)).toBe(true)
})
it('replaces one question block as it advances and retains visible selections without inventing submitted answers', () => {
  const t = new CliTranscript(false)
  t.question(record)
  t.question(record, 1, [{ id: 'scope', selected: ['全部样本'] }])
  const text = t.render(90).join('\n')
  expect(text).not.toContain('需要你确认')
  expect(text).toContain('选择哪些样本？')
  expect(text).toContain('1. 全部样本 · 保留全部符合条件的样本，逐项核对缺失情况。')
  expect(text).toContain('✓ 已选：全部样本')
  expect(text).toContain('需要哪些指标？')
  expect(text).toContain('1. 多样性')
  expect(text).toContain('逗号分隔')
  t.question({ ...record, state: 'answered', answer: { answers: [{ id: 'scope', selected: ['全部样本'] }, { id: 'metrics', selected: ['多样性', '丰度'] }] } })
  const done = t.render(90).join('\n')
  expect(done).toContain('已提交答案')
  expect(done).toContain('✓ 已选：多样性、丰度')
  expect(done).not.toContain('输入编号')
})
it.each(['cancelled', 'interrupted'] as const)('keeps %s questions distinct from confirmed answers and sanitizes custom text', state => {
  const t = new CliTranscript(false)
  t.question({ ...record, state })
  expect(t.render(80).join('\n')).not.toContain('已提交答案')
  t.question({ ...record, state: 'answered', answer: { answers: [{ id: 'scope', selected: [], custom: '\x1b[2J自己的范围' }, { id: 'metrics', selected: [] }] } })
  const text = t.render(80).join('\n')
  expect(text).toContain('自己的范围')
  expect(text).not.toContain('\x1b')
  expect(text).toContain('已跳过')
})
