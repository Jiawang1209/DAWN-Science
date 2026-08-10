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
/**
 * ## 排版：Section > Row > Control（2026-08-10）
 *
 * 作者：*「我们的设置里面太不规范了，我们要学习 codex app 设置里面的排版和布局。」*
 *
 * 此前设置**复用了项目概览的三栏仪表盘网格**——那是问题的根：
 * 三节并排铺满整个宽度，控件宽度随列宽变，同一个「保存」按钮在三列里
 * 落在三个位置。**仪表盘要的是一眼看全，设置要的是一件一件读。**
 *
 * 从 Codex 的设置页取的是**结构**（`settings.css` 的 Section > Row > Control）：
 *   - 内容**单栏**，有最大宽度（它取 600px）
 *   - 每一节：标题 + 一行说明 + 若干行
 *   - **每一行：左边「名字 + 说明」，右边控件**，行间一条 hairline，最后一行不带
 *
 * **没取的**：它左边那条 220px 的分节导航。我们只有三节，
 * 而左边已经有一条应用侧栏了——**再叠一条会让人不知道自己在哪一层**。
 * 颜色与类名同样不取（那是它的表达，不是事实）。
 */
import { useState } from "react"
import { useStore } from "@nanostores/react"
import { Button } from "./primitives.js"
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

/**
 * 一节设置。**标题 + 一行说明 + 若干行**——说明这一行不是装饰，
 * 它回答「这一节是干什么的」，少了它每一节都要靠标题猜。
 */
function Section({
  title,
  desc,
  children,
}: {
  title: string
  desc?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="set-section">
      <h3 className="set-section-title">{title}</h3>
      {desc ? <div className="set-section-desc">{desc}</div> : null}
      <div className="set-rows">{children}</div>
    </section>
  )
}

/**
 * 一行设置：**左边「名字 + 说明」，右边控件**。
 *
 * 说明写在名字下面而不是控件下面——**读的顺序是先知道这是什么，再决定填什么**。
 */
function Row({
  name,
  desc,
  htmlFor,
  children,
}: {
  name: string
  desc?: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="set-row">
      <div className="set-label">
        {htmlFor ? (
          <label className="set-name" htmlFor={htmlFor}>
            {name}
          </label>
        ) : (
          <span className="set-name">{name}</span>
        )}
        {desc ? <p className="set-desc">{desc}</p> : null}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

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
  interpreters,
  onRefresh,
  onSetInterpreter,
}: {
  kernels: readonly KernelRow[]
  problems: readonly { dir: string; reason: string }[]
  shadowed: readonly { name: string; dir: string }[]
  /** 当前配置。**没配的那个是 undefined**，不是空串 */
  interpreters: { python?: string; r?: string }
  onRefresh: () => void
  onSetInterpreter: (language: "python" | "R", path: string) => void
}) {
  return (
    <Section
      title="内核"
      desc={
        /**
         * **两个路径就是机制**（作者 2026-08-10）：
         * *「直接提供一个 R 解释器和 Python 解释器的路径即可。
         * 只有配置了，我们才能调用。」*
         *
         * 所以这句话不是提示，是**准入条件**——不能让人以为它是可选的。
         * （**JSX 纯文本不渲染 markdown**：写 `**` 只会显示成星号，
         * 今天栽过两次，所以强调一律走 CSS。）
         */
        <>
          配置里 <code>kind: kernel</code> 的 agent 靠这两个路径起内核。
          <em className="set-emph">没有配置就不能用。</em>
        </>
      }
    >
      <InterpreterField
        id="interp-python"
        label="Python 解释器"
        hint="例如 /usr/local/bin/python3 或某个 conda 环境里的 bin/python。需要它装了 ipykernel。"
        value={interpreters.python}
        onSave={(v) => onSetInterpreter("python", v)}
      />
      <InterpreterField
        id="interp-r"
        label="R 解释器"
        hint="例如 /usr/local/bin/R。需要它装了 IRkernel。"
        value={interpreters.r}
        onSave={(v) => onSetInterpreter("R", v)}
      />

      {/* 参考：本机注册过的 kernelspec。**它只是帮你填上面那两个框**，不是机制 */}
      {kernels.length > 0 ? (
        <details className="kernel-ref">
          <summary>参考：本机注册过的 Jupyter 内核（{kernels.length}）</summary>
          <ul className="kernel-list">
            {kernels.map((k) => (
              <li key={k.dir} className="kernel">
                <span className="name">{k.displayName}</span>
                <span className="sub">{k.language ?? "语言未声明"}</span>
                <p className="kernel-exe">{k.executable ?? "（kernel.json 里没有 argv[0]）"}</p>
              </li>
            ))}
          </ul>
          {shadowed.length > 0 ? (
            <p className="caveat">
              ⚠ 有 {shadowed.length} 个同名内核被前面的挡住了：
              {shadowed.map((x) => ` ${x.name}（${x.dir}）`).join("；")}
            </p>
          ) : null}
          {problems.length > 0 ? (
            <p className="caveat">
              ⚠ 有 {problems.length} 条注册项读不出来：
              {problems.map((x) => ` ${x.dir}——${x.reason}`).join("；")}
            </p>
          ) : null}
          <div className="state-action">
            <Button variant="outline" size="sm" onClick={onRefresh}>
              重新扫描
            </Button>
          </div>
        </details>
      ) : null}
    </Section>
  )
}

/**
 * 一个解释器路径输入框。
 *
 * **路径必须回显**——与凭证那条恰恰相反：看不见自己配了什么，等于没配。
 * 保存后由后端当场做静态校验（路径存不存在），**不等到建会话才炸**。
 */
function InterpreterField({
  id,
  label,
  hint,
  value,
  onSave,
}: {
  id: string
  label: string
  hint: string
  value: string | undefined
  onSave: (path: string) => void
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const shown = draft ?? value ?? ""
  return (
    <Row name={label} desc={hint} htmlFor={id}>
      <input
        id={id}
        className="control path"
        value={shown}
        placeholder="还没配置"
        onChange={(e) => setDraft(e.target.value)}
        aria-label={label}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={draft === undefined}
        onClick={() => {
          onSave(shown)
          setDraft(undefined)
        }}
      >
        保存
      </Button>
    </Row>
  )
}

export function AppearancePanel() {
  const theme = useStore($theme)

  return (
    <Section title="外观">
      <Row
        name="主题"
        desc={
          theme === "system"
            ? /* 「跟随系统」四个字不回答「所以现在到底是哪个」。**说出来，别让人猜。** */
              `跟随系统——系统当前是${resolveTheme("system") === "dark" ? "暗色" : "亮色"}`
            : "「跟随系统」不是亮色的同义词，它是一条会随系统变化的规则"
        }
      >
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
      </Row>
    </Section>
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
    <Section
      title="凭证"
      desc={
        credentials.encrypted ? (
          "由系统安全存储加密（macOS Keychain）。已存的值不会回显——界面只知道配没配。"
        ) : (
          /* **加密状态如实告知。** 没有 keychain 时它是明文，这必须是警告而不是说明 */
          <span className="caveat">⚠ 系统未提供安全存储，凭证将以明文保存在用户数据目录</span>
        )
      }
    >
      {providers.length === 0 ? (
        <p className="empty">providers.yaml 里还没有声明任何 native agent</p>
      ) : (
        providers.map((id) => {
          const isSet = credentials.configured.includes(id)
          return (
            <Row
              key={id}
              name={id}
              htmlFor={`cred-${id}`}
              desc={isSet ? "已配置" : "未配置"}
            >
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
                  id={`cred-${id}`}
                  className="control"
                  type="password"
                  aria-label={`${id} 的 API key`}
                  value={drafts[id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
                  // 已配置时也不回显原值——界面拿不到它，也不该拿到
                  placeholder={isSet ? "已配置（输入新值可替换）" : "粘贴 API key"}
                />
                <Button type="submit" variant="primary" size="sm">
                  保存
                </Button>
                {isSet ? (
                  <Button variant="text" size="sm" onClick={() => onDelete(id)}>
                    删除
                  </Button>
                ) : null}
              </form>
            </Row>
          )
        })
      )}
    </Section>
  )
}
