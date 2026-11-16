import { homedir } from 'node:os'
import { join } from 'node:path'
export const version = '8.30.1'
export const toolDir = join(homedir(), '.cache', 'dawn-security', version)
export const toolPath = join(toolDir, process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks')
export const releases = {
  darwin_arm64: ['tar.gz', 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5'],
  darwin_x64: ['tar.gz', 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709'],
  linux_arm64: ['tar.gz', 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080'],
  linux_x64: ['tar.gz', '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'],
  windows_x64: ['zip', 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e'],
}
