import { describe, expect, it } from 'vitest'
import { chmod, copyFile, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { 换包, type 换包依赖 } from '../../src/update/换包.js'

describe('AppImage replacement preserves the installed binary', () => {
  it.each(['copy', 'chmod', 'rename'] as const)('keeps the old executable after a %s failure', async failure => {
    const dir = await mkdtemp(join(tmpdir(), 'dawn-appimage-atomic-'))
    const app = join(dir, 'DAWN.AppImage'), pkg = join(dir, 'new.AppImage')
    try {
      await writeFile(app, 'working old executable', { mode: 0o755 })
      await writeFile(pkg, 'complete new executable')
      const deps: 换包依赖 = {
        运行: async () => {}, 找app: () => undefined, 读包版本: () => undefined,
        删: path => rm(path, { recursive: true, force: true }),
        拷贝: async (from, to) => {
          if (failure === 'copy') { await writeFile(to, 'partial'); throw new Error('copy failed') }
          await copyFile(from, to)
        },
        chmod: async (path, mode) => { if (failure === 'chmod') throw new Error('chmod failed'); await chmod(path, mode) },
        改名: async (from, to) => { if (failure === 'rename') throw new Error('rename failed'); await rename(from, to) },
      }
      await expect(换包({ 方式: 'appimage', 应用路径: app, 包路径: pkg, 期望版本: '0.0.48', 当前版本: '0.0.47' }, deps)).rejects.toThrow(`${failure} failed`)
      expect(await readFile(app, 'utf8')).toBe('working old executable')
      expect((await stat(app)).mode & 0o777).toBe(0o755)
      expect((await readdir(dir)).sort()).toEqual(['DAWN.AppImage', 'new.AppImage'])
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('publishes the complete executable with execute permissions only after staging', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dawn-appimage-atomic-'))
    const app = join(dir, 'DAWN.AppImage'), pkg = join(dir, 'new.AppImage')
    try {
      await writeFile(app, 'old')
      await writeFile(pkg, 'new', { mode: 0o600 })
      await 换包({ 方式: 'appimage', 应用路径: app, 包路径: pkg, 期望版本: '0.0.48', 当前版本: '0.0.47' }, {
        运行: async () => {}, 找app: () => undefined, 读包版本: () => undefined,
        拷贝: copyFile, chmod, 改名: rename, 删: path => rm(path, { force: true }),
      })
      expect(await readFile(app, 'utf8')).toBe('new')
      expect((await stat(app)).mode & 0o777).toBe(0o755)
      expect((await readdir(dir)).sort()).toEqual(['DAWN.AppImage', 'new.AppImage'])
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
