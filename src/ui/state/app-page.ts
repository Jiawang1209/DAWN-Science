import { atom } from 'nanostores'

/** sessionStorage belongs to this window: reload retains its page, a new window starts home. */
const key = 'dawn.window.app-page'
function initialPage(): 'home' | 'workbench' {
  try { return sessionStorage.getItem(key) === 'workbench' ? 'workbench' : 'home' }
  catch { return 'home' }
}
export const $appPage = atom<'home' | 'workbench'>(initialPage())
let revision = 0
export const appPageRevision = () => revision
function show(page: 'home' | 'workbench') {
  if ($appPage.get() !== page) revision++
  $appPage.set(page)
  try { sessionStorage.setItem(key, page) } catch { /* Navigation still works without storage. */ }
}
export const showHome = () => show('home')
export const showWorkbench = () => show('workbench')
