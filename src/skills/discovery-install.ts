import { mkdirSync, lstatSync, rmdirSync, renameSync } from 'node:fs'
import type * as fs from 'node:fs'
type PublicationFs = Pick<
  typeof fs,
  'mkdirSync' | 'lstatSync' | 'rmdirSync' | 'renameSync'
>
/** Publish a staged directory without replacing another install or user directory. */
export function publishSkillPackage(
  stage: string,
  dest: string,
  platform: NodeJS.Platform = process.platform,
  fileSystem: PublicationFs = { mkdirSync, lstatSync, rmdirSync, renameSync },
): void {
  if (platform === 'win32') {
    // Windows native directory rename requires an absent destination and rejects a
    // competing file/directory. Precreating our POSIX reservation would always fail.
    fileSystem.renameSync(stage, dest)
    return
  }
  let reservation: ReturnType<typeof lstatSync> | undefined
  try {
    fileSystem.mkdirSync(dest)
    reservation = fileSystem.lstatSync(dest)
    const check = fileSystem.lstatSync(dest)
    if (
      check.ino !== reservation.ino ||
      check.dev !== reservation.dev ||
      !check.isDirectory()
    )
      throw new Error('Installation destination changed')
    fileSystem.renameSync(stage, dest)
    reservation = undefined
  } finally {
    if (reservation) {
      try {
        const current = fileSystem.lstatSync(dest)
        if (current.ino === reservation.ino && current.dev === reservation.dev)
          fileSystem.rmdirSync(dest)
      } catch {}
    }
  }
}
