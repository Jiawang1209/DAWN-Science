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

/** `listKernels` 回来的一条 */
export interface KernelRow {
  name: string
  displayName: string
  language?: string
  executable?: string
  dir: string
}

/**
 * 内核：**列表里必须带解释器路径**（②-A · K2，作者 2026-08-10 提）。
 *
 * > *「我觉得有必要在 app 的设置里面，让用户配置一下 R 和 Python 的路径，
 * > 否则很盲目。」*
 *
 * 实测印证了这句话：作者机器上五个 kernelspec 里三个是 conda 环境
 * （`d2l` / `datascience` / `python_learn`），**光看名字完全分不出哪个是哪个**。
 * 挑错的后果不是报错，是**跑在了另一个环境里而不自知**——
 * 那比报错坏，因为它不出声。
 *
 * 三样都要显示，且都不是装饰：
 *   - **解释器路径**：回答「这个内核到底是哪个 Python」
 *   - **坏掉的注册项**：一条读不出来的 kernel.json 要能被看见，不是悄悄少一个
 *   - **被同名挡住的**：「我明明改了配置为什么没生效」的唯一答案
 */
export function KernelsPanel({
  kernels,
  problems,
  shadowed,
  onRefresh,
}: {
  kernels: readonly KernelRow[]
  problems: readonly { dir: string; reason: string }[]
  shadowed: readonly { name: string; dir: string }[]
  onRefresh: () => void
}) {
  return (
    <section className="panel">
      <h3 className="panel-title">内核</h3>
      <div className="panel-body">
        {kernels.length === 0 ? (
          <p className="empty">
            本机没有注册任何 Jupyter 内核。Python 装 <code>ipykernel</code>、
            R 装 <code>IRkernel</code> 之后会出现在这里。
          </p>
        ) : (
          <ul className="kernel-list">
            {kernels.map((k) => (
              <li key={`${k.dir}`} className="kernel">
                <span className="name">{k.displayName}</span>
                <span className="sub">{k.language ?? "语言未声明"}</span>
                {/* **这一行是这个面板存在的理由**——不显示它，选内核就是蒙 */}
                <p className="kernel-exe">{k.executable ?? "（kernel.json 里没有 argv[0]）"}</p>
              </li>
            ))}
          </ul>
        )}

        {shadowed.length > 0 ? (
          <p className="caveat">
            ⚠ 有 {shadowed.length} 个同名内核被前面的挡住了，不会被用到：
            {shadowed.map((s) => ` ${s.name}（${s.dir}）`).join("；")}
          </p>
        ) : null}

        {problems.length > 0 ? (
          <p className="caveat">
            ⚠ 有 {problems.length} 条注册项读不出来：
            {problems.map((p) => ` ${p.dir}——${p.reason}`).join("；")}
          </p>
        ) : null}

        {/* 每次现扫，不缓存：人可能刚在别处装了一个 */}
        <div className="state-action">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            重新扫描
          </Button>
        </div>
      </div>
    </section>
  )
}

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
