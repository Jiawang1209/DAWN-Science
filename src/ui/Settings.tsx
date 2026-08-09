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
import { useStore } from "@nanostores/react"
import { Button, Field } from "./primitives.js"
import { $theme, resolveTheme, setTheme, type ThemeChoice } from "./state/theme.js"

/**
 * 外观：明暗主题。
 *
 * **在这之前主题归操作系统管，应用自己没有话语权。** 桌面应用不该是这样——
 * 同一台机器上，人完全可能希望系统是亮的而这个工作台是暗的。
 *
 * 三个选项而不是两个：「跟随系统」**不是**亮色的同义词，
 * 它是一条会随系统变化的规则。少了它，选过一次之后就再也回不到自动了。
 */
const THEME_OPTIONS: readonly { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "亮色" },
  { value: "dark", label: "暗色" },
]

export function AppearancePanel() {
  const theme = useStore($theme)

  return (
    <section className="panel">
      <h3 className="panel-title">外观</h3>
      <div className="panel-body">
        <div className="theme-choices" role="radiogroup" aria-label="主题">
          {THEME_OPTIONS.map((o) => (
            <Button
              key={o.value}
              variant={theme === o.value ? "primary" : "secondary"}
              size="sm"
              role="radio"
              aria-checked={theme === o.value}
              onClick={() => setTheme(o.value)}
            >
              {o.label}
            </Button>
          ))}
        </div>
        {theme === "system" ? (
          /* 「跟随系统」四个字不回答"所以现在到底是哪个"。**说出来，别让人猜。** */
          <p className="hint">
            系统当前是{resolveTheme("system") === "dark" ? "暗色" : "亮色"}
          </p>
        ) : null}
      </div>
    </section>
  )
}

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
                    <Field id={`cred-${id}`} label={`${id} 的 API key`}>
                      <input
                        id={`cred-${id}`}
                        className="control"
                        type="password"
                        value={drafts[id] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
                        // 已配置时也不回显原值——界面拿不到它，也不该拿到
                        placeholder={isSet ? "已配置（输入新值可替换）" : "粘贴 API key"}
                      />
                    </Field>
                    <Button type="submit" variant="primary" size="sm">
                      保存
                    </Button>
                    {isSet ? (
                      <Button variant="text" size="sm" onClick={() => onDelete(id)}>
                        删除
                      </Button>
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
