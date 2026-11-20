import { beforeEach, expect, it, vi } from 'vitest'
import { resolveWorkbenchLayout, readWorkbenchProportions, saveWorkbenchProportions, WORKBENCH_PROPORTIONS_KEY } from '../../src/ui/workbench-layout.js'

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

it('默认宽度随窗口变化，侧栏有上下限，工作面板在大屏可超过720px', () => {
  expect(resolveWorkbenchLayout({ viewportWidth: 1440 })).toMatchObject({ sidebarWidth: 300, dockWidth: 480 })
  expect(resolveWorkbenchLayout({ viewportWidth: 1920 })).toMatchObject({ sidebarWidth: 400, dockWidth: 640 })
  expect(resolveWorkbenchLayout({ viewportWidth: 3840 })).toMatchObject({ sidebarWidth: 420, dockWidth: 1280 })
})

it('旧像素偏好作为1440px参照读取，新比例优先', () => {
  expect(resolveWorkbenchLayout({ viewportWidth: 1920, sidebarWidth: 315, dockWidth: 600 }))
    .toMatchObject({ sidebarWidth: 420, dockWidth: 800 })
  expect(resolveWorkbenchLayout({ viewportWidth: 1920, sidebarWidth: 315, dockWidth: 600, proportions: { sidebar: .2, dock: .3 } }))
    .toMatchObject({ sidebarWidth: 384, dockWidth: 576 })
})

it('窄窗口保住正文预算，实际面板宽度与可操作的拖动上下界一致', () => {
  const narrow = resolveWorkbenchLayout({ viewportWidth: 900 })
  expect(narrow).toMatchObject({ sidebarWidth: 300, dockWidth: 280, mainMin: 296, dockMin: 280, dockMax: 280 })
  for (const viewportWidth of [900, 1080, 1280, 1440, 1920, 2560, 3840]) {
    const layout = resolveWorkbenchLayout({ viewportWidth, proportions: { dock: .9 } })
    expect(viewportWidth - layout.sidebarWidth - layout.dockWidth - 24).toBeGreaterThanOrEqual(viewportWidth < 1024 ? 280 : 420)
    expect(layout.dockWidth).toBeLessThanOrEqual(layout.dockMax)
    expect(layout.dockWidth).toBeGreaterThanOrEqual(layout.dockMin)
  }
})

it('折叠不重新分配面板偏好，重新拉宽恢复被暂时约束的比例', () => {
  const proportions = { sidebar: .25, dock: .4 }
  expect(resolveWorkbenchLayout({ viewportWidth: 1920, proportions, sidebarCollapsed: true }).dockWidth).toBe(768)
  resolveWorkbenchLayout({ viewportWidth: 900, proportions })
  expect(proportions).toEqual({ sidebar: .25, dock: .4 })
  expect(resolveWorkbenchLayout({ viewportWidth: 1920, proportions }).dockWidth).toBe(768)
  expect(localStorage.length).toBe(0)
})

it('非法视口或比例回落为默认，巨大偏好受面板上限约束', () => {
  expect(resolveWorkbenchLayout({ viewportWidth: NaN, proportions: { sidebar: -1, dock: Infinity } }))
    .toMatchObject({ sidebarWidth: 300, dockWidth: 480 })
  expect(resolveWorkbenchLayout({ viewportWidth: 3840, proportions: { dock: 1 } }).dockWidth).toBe(1440)
})

it('窄窗口里已保存的宽侧栏也要给正文和面板留下可用空间', () => {
  const layout = resolveWorkbenchLayout({ viewportWidth: 900, proportions: { sidebar: .5, dock: .5 } })
  expect(layout).toMatchObject({ sidebarWidth: 316, sidebarMax: 316, dockWidth: 280, mainMin: 280 })
  expect(900 - layout.sidebarWidth - layout.dockWidth - 24).toBeGreaterThanOrEqual(280)
})

it('手动选择的比例可读回，不覆盖旧像素记录', () => {
  localStorage.setItem('dawn.global.sidebar-width', '340')
  saveWorkbenchProportions({ sidebar: .23, dock: .38 })
  expect(readWorkbenchProportions()).toEqual({ sidebar: .23, dock: .38 })
  expect(localStorage.getItem('dawn.global.sidebar-width')).toBe('340')
})

it.each(['null', '[]', '"invalid"', '{', '{"sidebar":0,"dock":".3"}'])('无效比例存储出声并回到兼容路径：%s', value => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.setItem(WORKBENCH_PROPORTIONS_KEY, value)
  expect(readWorkbenchProportions()).toEqual({})
  expect(error).toHaveBeenCalled()
})

it('保留同份存储中的合法比例，无法保存时出声而不抛出', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.setItem(WORKBENCH_PROPORTIONS_KEY, '{"sidebar":0.25,"dock":-1}')
  expect(readWorkbenchProportions()).toEqual({ sidebar: .25 })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(() => saveWorkbenchProportions({ dock: .4 })).not.toThrow()
  expect(error).toHaveBeenCalled()
})
