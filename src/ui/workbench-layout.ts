import { SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX, clampWidth } from './state/sidebar.js'
import { RIGHT_DOCK_DEFAULT, RIGHT_DOCK_MIN, RIGHT_DOCK_MAX, clampDockWidth } from './state/right-dock.js'

export const WORKBENCH_PROPORTIONS_KEY = 'dawn.global.workbench-proportions'
export interface WorkbenchProportions { sidebar?: number; dock?: number }
const referenceWidth = 1440
// Two 8px grid gaps and 8px right padding in styles.css.
const gridChrome = 24
const validRatio = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)))

/** Display constraints never overwrite the user's preferred proportions. */
export function resolveWorkbenchLayout({ viewportWidth, sidebarWidth = SIDEBAR_DEFAULT, dockWidth = RIGHT_DOCK_DEFAULT, sidebarCollapsed = false, proportions = {} }: {
  viewportWidth: number
  sidebarWidth?: number
  dockWidth?: number
  sidebarCollapsed?: boolean
  proportions?: WorkbenchProportions
}) {
  const viewport = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : referenceWidth
  const sidebarRatio = validRatio(proportions.sidebar) ? proportions.sidebar : clampWidth(sidebarWidth) / referenceWidth
  const dockRatio = validRatio(proportions.dock) ? proportions.dock : clampDockWidth(dockWidth) / referenceWidth
  const sidebarMax = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.floor(viewport - 280 - RIGHT_DOCK_MIN - gridChrome)))
  const sidebar = clamp(viewport * sidebarRatio, SIDEBAR_MIN, sidebarMax)
  const contentSpace = viewport - (sidebarCollapsed ? 0 : sidebar) - gridChrome
  // At the 900px desktop minimum, share the constraint rather than crushing the file panel.
  const mainMin = Math.min(420, Math.max(280, contentSpace - RIGHT_DOCK_MIN))
  const available = Math.max(0, Math.floor(contentSpace - mainMin))
  const dockMax = Math.min(1440, Math.max(RIGHT_DOCK_MAX, Math.floor(viewport / 2)), available)
  const dockMin = Math.min(RIGHT_DOCK_MIN, dockMax)
  return { sidebarWidth: sidebar, sidebarMin: SIDEBAR_MIN, sidebarMax, mainMin,
    dockWidth: clamp(viewport * dockRatio, dockMin, dockMax), dockMin, dockMax,
    dockDefault: clamp(viewport * RIGHT_DOCK_DEFAULT / referenceWidth, dockMin, dockMax),
    dockDefaultRatio: RIGHT_DOCK_DEFAULT / referenceWidth }
}

export function readWorkbenchProportions(): WorkbenchProportions {
  try {
    const raw = localStorage.getItem(WORKBENCH_PROPORTIONS_KEY)
    if (raw === null) return {}
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
    const result: WorkbenchProportions = {}
    for (const key of ['sidebar', 'dock'] as const) {
      const ratio = (value as Record<string, unknown>)[key]
      if (ratio === undefined) continue
      if (validRatio(ratio)) result[key] = ratio
      else console.error(`[layout] Invalid ${key} proportion; using legacy width preference`)
    }
    return result
  } catch (error) {
    console.error('[layout] Could not read window proportions; using legacy width preferences:', error)
    return {}
  }
}

export function saveWorkbenchProportions(proportions: WorkbenchProportions): void {
  try { localStorage.setItem(WORKBENCH_PROPORTIONS_KEY, JSON.stringify(proportions)) }
  catch (error) { console.error('[layout] Could not save proportions; the current layout remains active:', error) }
}
