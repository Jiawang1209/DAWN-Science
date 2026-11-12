import { expect, it, vi } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 下载到 } from "../../src/update/下载.js"

it("a release filename cannot remove a file outside the update directory before a network failure", async () => {
  const root = mkdtempSync(join(tmpdir(), "dawn-download-path-"))
  const outside = join(root, "outside-mac-arm64.zip")
  writeFileSync(outside, "original user file")
  const fetcher = vi.fn(async () => { throw new Error("network unavailable") })
  try {
    const error = await 下载到({ 资源: { name: "../outside-mac-arm64.zip", size: 4, url: "https://example.invalid/pkg" }, 目录: join(root, "updates"), 进度: () => {}, signal: new AbortController().signal, fetch: fetcher }).catch(error => error)
    expect(existsSync(outside)).toBe(true)
    expect(readFileSync(outside, "utf8")).toBe("original user file")
    expect(String(error)).toMatch(/文件名/)
    expect(fetcher).not.toHaveBeenCalled()
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it.each(["", ".", "..", "../pkg.zip", "..\\pkg.zip", "/tmp/pkg.zip", "C:pkg.zip", "C:\\pkg.zip", "bad\0.zip"])("rejects non-filename release metadata before any I/O: %j", async name => {
  const root = mkdtempSync(join(tmpdir(), "dawn-download-name-"))
  const target = join(root, "updates")
  const fetcher = vi.fn(async () => new Response("test"))
  try {
    await expect(下载到({ 资源: { name, size: 4, url: "https://example.invalid/pkg" }, 目录: target, 进度: () => {}, signal: new AbortController().signal, fetch: fetcher })).rejects.toThrow(/文件名/)
    expect(existsSync(target)).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  } finally { rmSync(root, { recursive: true, force: true }) }
})
