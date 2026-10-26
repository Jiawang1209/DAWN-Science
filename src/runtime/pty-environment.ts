/** Finder/launchd may omit the locale that Terminal.app normally supplies. */
export function ptyEnvironment(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const result = { ...env }
  // Preserve explicit locales (including deliberate C/POSIX settings) and their
  // LC_ALL > LC_CTYPE > LANG precedence. Do not change formatting categories.
  if (platform !== 'win32' && !result.LC_ALL && !result.LC_CTYPE && !result.LANG) {
    result.LANG = platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8'
  }
  return result
}
