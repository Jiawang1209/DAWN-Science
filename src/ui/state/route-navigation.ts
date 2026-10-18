/** Renderer-owned browsing position, separate from the authoritative route book.
 * Keys include session, remote connection and workspace (supplied by App), then
 * routeId. No file bytes, execution permissions or durable state live here. */
import { atom } from 'nanostores'

export type RouteTab = 'files' | 'info' | 'log'
export type RouteView = {
  version: string
  stepId?: string | undefined
  tab: RouteTab
  path?: string | undefined
  reading: boolean
}
export const emptyRouteView: RouteView = { version: 'current', tab: 'log', reading: false }
export const $routeViews = atom<ReadonlyMap<string, RouteView>>(new Map())
export const routeViewKey = (scope: string, routeId: string | undefined) => JSON.stringify([scope, routeId])
export function setRouteView(key: string, view: RouteView): void {
  const next = new Map($routeViews.get())
  next.delete(key)
  next.set(key, view)
  if (next.size > 50) next.delete(next.keys().next().value!)
  $routeViews.set(next)
}
