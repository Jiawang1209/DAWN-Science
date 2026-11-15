import { describe, expect, it } from 'vitest'
import { 更新管家 } from '../../src/update/检查.js'
import type { 更新盘面 } from '../../src/update/状态.js'
import type { 发布一条 } from '../../src/update/发布源.js'

const release: 发布一条 = {
  版本: '0.0.48', 页面: 'https://example.invalid/release',
  资源: [{ name: 'DAWN-Science-0.0.48-mac-arm64.zip', size: 4, url: 'https://example.invalid/pkg' }],
}
function setup(source: () => Promise<发布一条 | undefined>) {
  let disk: 更新盘面 = { auto: true }
  const manager = new 更新管家({
    当前版本: '0.0.47', 源: { 查最新: source },
    事实: { platform: 'darwin', arch: 'arm64', appPath: '/A/demo.app', 可写: () => true },
    读状态: () => disk, 写状态: value => { disk = value },
  })
  return { manager, disk: () => disk }
}

describe('update checks preserve newer state', () => {
  it('does not let a skipped automatic check swallow a simultaneous manual check', async () => {
    let calls = 0
    const { manager } = setup(async () => { calls++; return release })
    manager.设偏好({ auto: false })
    const skipped = manager.检查({ 自动: true })
    const manual = manager.检查({ 自动: false })
    await skipped
    expect((await manual).阶段).toBe('available')
    expect(calls).toBe(1)
  })

  it('keeps preferences changed while a release request is pending', async () => {
    let finish!: (value: 发布一条 | undefined) => void
    const { manager, disk } = setup(() => new Promise(resolve => { finish = resolve }))
    const checking = manager.检查({ 自动: false })
    manager.设偏好({ auto: false, ignore: release.版本 })
    finish(release)
    expect((await checking).阶段).toBe('ignored')
    expect(disk().auto).toBe(false)
    expect(disk().ignored).toBe(release.版本)
  })

  it('does not replace an active download when checking again', async () => {
    let calls = 0
    const { manager, disk } = setup(async () => { calls++; return release })
    await manager.检查({ 自动: false })
    manager.开始下载(4)
    manager.下载进度(2, 4)
    expect((await manager.检查({ 自动: false })).阶段).toBe('downloading')
    expect(calls).toBe(1)
    expect(manager.下好了('/tmp/package.zip').阶段).toBe('ready')
    expect(disk().ready?.包路径).toBe('/tmp/package.zip')
  })

  it('shares overlapping release checks instead of allowing stale results to win', async () => {
    let finish!: (value: 发布一条 | undefined) => void
    let calls = 0
    const { manager } = setup(() => { calls++; return new Promise(resolve => { finish = resolve }) })
    const first = manager.检查({ 自动: false })
    const second = manager.检查({ 自动: false })
    expect(calls).toBe(1)
    finish(release)
    expect((await first).阶段).toBe('available')
    expect((await second).阶段).toBe('available')
  })
})
