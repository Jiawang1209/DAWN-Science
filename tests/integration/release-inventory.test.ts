import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

// 来自 v0.0.42 实际发布附件，独立于工作流的匹配规则。
// https://github.com/Jiawang1209/DAWN-Science/releases/tag/v0.0.42
// electron-builder 对 Linux x64 的 AppImage/deb 分别使用 x86_64/amd64。
const assets = [
  ['mac-arm64.dmg', 'macOS arm64 dmg'],
  ['mac-arm64.zip', 'macOS arm64 zip'],
  ['mac-x64.dmg', 'macOS x64 dmg'],
  ['mac-x64.zip', 'macOS x64 zip'],
  ['win-x64.exe', 'Windows installer x64'],
  ['win-x64-portable.exe', 'Windows portable x64'],
  ['linux-x86_64.AppImage', 'Linux x64 AppImage'],
  ['linux-amd64.deb', 'Linux x64 deb'],
  ['linux-arm64.AppImage', 'Linux arm64 AppImage'],
  ['linux-arm64.deb', 'Linux arm64 deb'],
] as const

function inventory(files: readonly string[], version = '0.0.42') {
  const workflow = parse(readFileSync('.github/workflows/release.yml', 'utf8'))
  const script = workflow.jobs.release.steps.find((s: { id?: string }) => s.id === 'inventory').run
  const dir = mkdtempSync(join(tmpdir(), 'dawn-release-check-'))
  try {
    mkdirSync(join(dir, 'artifacts'))
    for (const file of files) writeFileSync(join(dir, 'artifacts', `DAWN-Science-${version}-${file}`), 'fixture')
    const output = join(dir, 'output')
    const run = spawnSync('bash', ['-c', script], {
      cwd: dir,
      env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_REF_NAME: `v${version}` },
      encoding: 'utf8',
    })
    return { status: run.status, stdout: run.stdout, note: existsSync(output) ? readFileSync(output, 'utf8') : '' }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

it('v0.0.42 的十个真实文件名全部存在时，不误报 Linux x64 缺包', () => {
  const result = inventory(assets.map(([file]) => file))
  expect(result.status).toBe(0)
  expect(result.note).toContain('预期的10份安装包与便携归档均已收到。')
  expect(result.note).not.toContain('缺')
  expect(result.stdout).not.toContain('::warning::')
})

it.each(assets)('真实缺少 %s 时，只报告 %s，保留部分平台发布策略', (missingFile, label) => {
  const result = inventory(assets.filter(([file]) => file !== missingFile).map(([file]) => file))
  expect(result.status).toBe(0)
  expect(result.note).toContain(`这次发布**缺**这些平台的包： ${label} ——`)
  expect(result.stdout).toContain('::warning::')
  expect(result.note).not.toContain('打包 job 失败')
  for (const [file, otherLabel] of assets) if (file !== missingFile) expect(result.note).not.toContain(otherLabel)
})

it('一个产物都没有时失败，不输出可发布的说明', () => {
  const result = inventory([])
  expect(result.status).not.toBe(0)
  expect(result.stdout).toContain('::error::一个产物都没收到')
  expect(result.note).toBe('')
})

it('不把其他架构或错误命名的 Linux 文件算成 x64 安装包', () => {
  const files = assets.filter(([file]) => !file.startsWith('linux-x86_64') && !file.startsWith('linux-amd64')).map(([file]) => file)
  const result = inventory([...files, 'linux-x64.AppImage', 'linux-x64.deb'])
  expect(result.note).toContain('Linux x64 AppImage')
  expect(result.note).toContain('Linux x64 deb')
  expect(result.note).not.toContain('Linux arm64')
})

it('文件名中的版本取自当前标签，不固定为回归样例版本', () => {
  const result = inventory(assets.map(([file]) => file), '1.2.3')
  expect(result.status).toBe(0)
  expect(result.note).toContain('预期的10份安装包与便携归档均已收到。')
})
