import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { KernelOutputRow } from '../../src/ui/views.js'
import type { TranscriptItem } from '../../src/protocol/index.js'

const output = (language?: 'R' | 'python', id = 'r1'): Extract<TranscriptItem, { type: 'kernelOutput' }> => ({
  type: 'kernelOutput', id: 'out', kernelInstanceId: id, kernelRevision: 1,
  ...(language ? { language } : {}), output: { kind: 'stream', stream: 'stdout', text: '42' },
})
const kernels = [{ language: 'R' as const, state: 'idle' as const, kernelInstanceId: 'r1' },
  { language: 'python' as const, state: 'idle' as const, kernelInstanceId: 'py1' }]

describe('按语言比较内核实例', () => {
  it('两台当前内核同时存在时，R 和 Python 输出都不是旧结果', () => {
    const { container } = render(<><KernelOutputRow item={output('R')} currentKernel="py1" currentKernels={kernels} />
      <KernelOutputRow item={output('python', 'py1')} currentKernel="r1" currentKernels={kernels} /></>)
    expect(container.querySelectorAll('.kout-stale')).toHaveLength(0)
    expect(container.textContent).toContain('42')
  })
  it('R 真正换实例后只标旧 R，Python 保持正常', () => {
    const { container } = render(<><KernelOutputRow item={output('R', 'r-old')} currentKernels={kernels} />
      <KernelOutputRow item={output('python', 'py1')} currentKernels={kernels} /></>)
    expect(container.querySelectorAll('.kout-stale')).toHaveLength(1)
  })
  it('语言身份未知时不拿另一台身份来猜', () => {
    const { container } = render(<KernelOutputRow item={output('R')} currentKernel="py1" />)
    expect(container.querySelector('.kout-stale')).toBeNull()
  })
  it('独立内核会话的单实例旧结果警告仍保留', () => {
    const { container } = render(<KernelOutputRow item={output(undefined, 'old')} currentKernel="new" />)
    expect(container.querySelector('.kout-stale')).not.toBeNull()
  })
})
