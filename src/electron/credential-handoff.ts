import type { CredentialStore } from "./credentials.js"
import type { 交接箱 } from "../update/交接.js"

/** 在系统存储预热之后接收旧版本交接；无 Electron 依赖，可独立验证。 */
export function 收凭证交接(凭证库: CredentialStore, 交接: 交接箱, 记: (message: string) => void): void {
  const 条目 = 交接.读()
  if (!条目) {
    交接.清()
    return
  }
  try {
    // broken() 只列模型服务商，不能代表视觉、MCP、SSH 等其他凭证。
    // 逐条核对交接内容，并保留用户已经更新且当前可读取的值。
    const 待恢复 = Object.fromEntries(Object.entries(条目).filter(([id]) => 凭证库.hasStored(id) && 凭证库.get(id) === undefined))
    if (Object.keys(待恢复).length === 0) {
      记("更新交接：自己解得开，交接文件用不上，删了")
    } else {
      凭证库.导入明文(待恢复)
      记(`更新交接：${Object.keys(待恢复).length} 条凭证已用这一版的钥匙重新加密`)
    }
  } catch (e) {
    记(`更新交接失败，需要重新填写 key：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    交接.清()
  }
}
