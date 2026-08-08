/**
 * 设置：凭证（作者反馈后新增）。
 *
 * **凭证在 app 里填，不写进配置文件。** 这是作者首次启动桌面版时指出的——
 * 桌面应用不该因为一个要手写的文件缺了变量就起不来。
 *
 * 两条显示纪律：
 *   1. **绝不回显已存的凭证**——界面只知道「配没配」，不知道「是什么」
 *   2. **加密状态如实告知**——系统没有 keychain 时明说是明文存的，
 *      不能让人以为加了密
 */
import { useState } from "react"

export interface CredentialState {
  configured: string[]
  encrypted: boolean
}

export function SettingsPanel({
  providers,
  credentials,
  onSet,
  onDelete,
}: {
  /** 本配置实际用到的 provider id（pi 的 provider，如 deepseek / anthropic） */
  providers: string[]
  credentials: CredentialState
  onSet: (providerId: string, secret: string) => void
  onDelete: (providerId: string) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  return (
    <section className="panel">
      <h3 className="panel-title">凭证</h3>
      <div className="panel-body">
        {credentials.encrypted ? (
          <p className="hint">由系统安全存储加密（macOS Keychain）</p>
        ) : (
          <p className="caveat">
            ⚠ 系统未提供安全存储，凭证将以明文保存在用户数据目录
          </p>
        )}

        {providers.length === 0 ? (
          <p className="empty">providers.yaml 里还没有声明任何 native agent</p>
        ) : (
          <ul className="cred-list">
            {providers.map((id) => {
              const isSet = credentials.configured.includes(id)
              return (
                <li key={id} className="cred">
                  <div className="cred-head">
                    <span className="name">{id}</span>
                    <span className={isSet ? "state alive" : "state exited"}>
                      {isSet ? "已配置" : "未配置"}
                    </span>
                  </div>
                  <form
                    className="cred-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const v = (drafts[id] ?? "").trim()
                      if (!v) return
                      onSet(id, v)
                      setDrafts((d) => ({ ...d, [id]: "" }))
                    }}
                  >
                    <input
                      type="password"
                      value={drafts[id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
                      // 已配置时也不回显原值——界面拿不到它，也不该拿到
                      placeholder={isSet ? "已配置（输入新值可替换）" : "粘贴 API key"}
                      aria-label={`${id} 的 API key`}
                    />
                    <button type="submit">保存</button>
                    {isSet ? (
                      <button type="button" onClick={() => onDelete(id)}>
                        删除
                      </button>
                    ) : null}
                  </form>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
