import { expect, it } from 'vitest'
import { plain } from '../../src/cli/presentation.js'
it('does not execute terminal control sequences from model or tool output, even incomplete C1 controls', () => {
  expect(plain('\x1b[2Jhello\x1b]0;injected-title\x07\nworld\x9b')).toBe('hello\nworld')
})
