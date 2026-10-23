import { describe, expect, it } from 'vitest'
import { TerminalScreen } from '../../src/terminal/screen.js'

describe('backend terminal screen', () => {
  it('keeps visible cells below a moved cursor and matches frontend newline conversion', async () => {
    const screen = new TerminalScreen(40, 8)
    try {
      screen.write('first\nsecond\x1b[H')
      expect(await screen.snapshot()).toMatchObject({ text: 'first\nsecond', cursorLine: 'first', cursorX: 0 })
    } finally { screen.dispose() }
  })
  it('uses the same Unicode width version as the visible terminal', async () => {
    const screen = new TerminalScreen(40, 8)
    try {
      screen.write('😀A')
      expect(await screen.snapshot()).toMatchObject({ text: '😀A', cursorX: 3 })
    } finally { screen.dispose() }
  })
  it('interprets overwritten cells, clear-screen and Unicode instead of stripping ANSI', async () => {
    const screen = new TerminalScreen(40, 8)
    try {
      screen.write('old progress\rnew\x1b[K\r\n中文数据 42')
      expect((await screen.snapshot()).text).toBe('new\n中文数据 42')
      screen.write('\x1b[2J\x1b[Hfresh')
      expect((await screen.snapshot()).text).toBe('fresh')
      screen.resize(60, 12)
      expect(await screen.snapshot()).toMatchObject({ cols: 60, rows: 12 })
    } finally { screen.dispose() }
  })

  it('only consumes emitted private markers, including split OSC chunks', async () => {
    const observed: string[] = []
    const screen = new TerminalScreen(80, 24, (token, code) => observed.push(`${token}:${code}`))
    try {
      screen.write("printf '\\033]7777;dawn;abc;0\\007'\r\n")
      await screen.snapshot()
      expect(observed).toEqual([])
      screen.write('\x1b]7777;dawn;abc;')
      screen.write('3\x07result')
      expect((await screen.snapshot()).text).toContain('result')
      expect(observed).toEqual(['abc:3'])
      expect((await screen.snapshot()).text).not.toContain('\x1b')
    } finally { screen.dispose() }
  })
})
