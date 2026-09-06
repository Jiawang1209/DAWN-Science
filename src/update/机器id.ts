/**
 * 这台机器的 id（规格 U5）——交接密钥就是从它派生的。
 *
 * **三个平台三个来源，取不到就是取不到**：不许退回 hostname 之类的东西。
 * hostname 会变（换个 Wi-Fi 都可能变），而它一变，上一版交接过来的东西
 * 就解不开了——**症状是「更新之后 key 没了」，而我们会以为自己接上了**。
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

export function 本机机器id(): string | undefined {
  try {
    if (process.platform === "darwin") {
      // IOPlatformUUID：跟着这台硬件走，重装系统才会变
      const out = execFileSync("/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], {
        encoding: "utf8",
        timeout: 5_000,
      })
      return /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out)?.[1]
    }
    if (process.platform === "win32") {
      const out = execFileSync(
        "reg",
        ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
        { encoding: "utf8", timeout: 5_000 },
      )
      return /MachineGuid\s+REG_SZ\s+(\S+)/.exec(out)?.[1]
    }
    // Linux：systemd 的 machine-id（`/var/lib/dbus/` 那份是老位置，两处都试）
    for (const f of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
      try {
        const v = readFileSync(f, "utf8").trim()
        if (v) return v
      } catch {
        // 下一个
      }
    }
    return undefined
  } catch {
    // 命令不在、超时、权限——都算「取不到」。上一层会因此不交接**并且出声**
    return undefined
  }
}
