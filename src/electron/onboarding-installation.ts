/**
 * 引导的安装世代，与数据库里的远端内核 install.id 无关。
 * 同版本复制安装也要重置；成功的应用内换包显式接续原世代。
 * 只读安装文件身份，不向签名 .app 写文件，也不碰凭证/会话。
 */
import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

interface InstallationRecord { v: 1; fingerprint: string; id: string }
export interface OnboardingInstallationOptions {
  stateFile: string
  identityPaths: readonly string[]
  /** NSIS 每次手动安装生成，应用内 --updated 沿用。便携版不用。 */
  installMarkerFile?: string | undefined
  log: (message: string) => void
}

export function createOnboardingInstallation(o: OnboardingInstallationOptions) {
  const fingerprint = (): string => {
    if (o.installMarkerFile) {
      try {
        const marker = readFileSync(o.installMarkerFile, "utf8").trim()
        if (!/^\{?[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\}?$/i.test(marker)) throw new Error("安装器标记无效")
        return createHash("sha256").update(`nsis:${marker}`).digest("hex")
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") o.log(`安装器标记读取失败，使用文件身份：${String(e)}`)
      }
    }
    const identities = o.identityPaths.map(path => {
      const s = statSync(path, { bigint: true })
      // 目录 mtime/size 会被 Finder 等正常改变；文件访问时间也不能用于判断重装。
      return [s.dev, s.ino, s.birthtimeNs, ...(s.isFile() ? [s.mtimeNs, s.size] : [])].map(String)
    })
    return createHash("sha256").update(JSON.stringify(identities)).digest("hex")
  }
  const save = (record: InstallationRecord) => {
    mkdirSync(dirname(o.stateFile), { recursive: true })
    const temporary = `${o.stateFile}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, JSON.stringify(record), { mode: 0o600, flag: "wx" })
      renameSync(temporary, o.stateFile)
    } finally {
      rmSync(temporary, { force: true })
    }
  }
  let id = randomUUID() as string
  try {
    const current = fingerprint()
    let previous: InstallationRecord | undefined
    try {
      const value: unknown = JSON.parse(readFileSync(o.stateFile, "utf8"))
      if (value && typeof value === "object" && "v" in value && value.v === 1 &&
          "id" in value && typeof value.id === "string" && /^[a-f\d-]{36}$/i.test(value.id) &&
          "fingerprint" in value && typeof value.fingerprint === "string") previous = value as InstallationRecord
      else throw new Error("安装世代记录无效")
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") o.log(`安装世代读取失败，重新引导：${String(e)}`)
    }
    if (previous?.fingerprint === current) id = previous.id
    else save({ v: 1, fingerprint: current, id })
  } catch (e) {
    o.log(`安装世代不可持久化，本次使用临时引导状态：${String(e)}`)
  }
  return {
    id,
    /** 只在实际换包成功后调用；写当前新文件身份，不留下可误用的待升级标记。 */
    adoptAutomaticUpdate() {
      try { save({ v: 1, fingerprint: fingerprint(), id }) }
      catch (e) { o.log(`更新后的引导状态接续失败，下次可能重新引导：${String(e)}`) }
    },
  }
}
