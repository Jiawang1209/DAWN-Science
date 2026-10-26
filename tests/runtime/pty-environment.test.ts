import { describe, expect, it } from 'vitest'
import { ptyEnvironment } from '../../src/runtime/pty-environment.js'

describe('PTY locale defaults', () => {
  it.each([
    ['darwin', 'en_US.UTF-8'], ['linux', 'C.UTF-8'],
  ] as const)('supplies a platform UTF-8 default for %s without mutating the parent', (platform, locale) => {
    const env = { PATH: '/usr/bin', LC_NUMERIC: 'C' }
    expect(ptyEnvironment(env, platform)).toEqual({ ...env, LANG: locale })
    expect(env).toEqual({ PATH: '/usr/bin', LC_NUMERIC: 'C' })
  })

  it('supplies the default when inherited locale values are empty', () => {
    expect(ptyEnvironment({ LANG: '', LC_ALL: '', LC_CTYPE: '' }, 'darwin'))
      .toEqual({ LANG: 'en_US.UTF-8', LC_ALL: '', LC_CTYPE: '' })
  })

  it.each([
    { LANG: 'zh_CN.UTF-8' },
    { LC_CTYPE: 'UTF-8' },
    { LC_ALL: 'ja_JP.UTF-8' },
    { LANG: 'C', LC_CTYPE: 'en_US.UTF-8' },
    { LANG: 'zh_CN.UTF-8', LC_ALL: 'C' },
    { LANG: 'POSIX' },
  ])('preserves explicitly configured locale precedence: %j', env => {
    expect(ptyEnvironment(env, 'darwin')).toEqual(env)
  })

  it('leaves Windows code-page handling unchanged', () => {
    expect(ptyEnvironment({ PATH: 'C:\\Windows' }, 'win32')).toEqual({ PATH: 'C:\\Windows' })
  })
})
