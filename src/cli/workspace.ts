import { realpathSync } from 'node:fs'
/** Preserve the desktop spelling of an existing project (for example /var vs /private/var). */
export function desktopWorkspace(workspace: string, existing: readonly { workspace: string }[]): string {
  const actual = realpathSync(workspace)
  return existing.find(project => {
    try { return realpathSync(project.workspace) === actual } catch { return false }
  })?.workspace ?? workspace
}
