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
import { useEffect, useState, Fragment } from "react"
import { useStore } from "@nanostores/react"
import { Button } from "./primitives.js"
import { 关闭图标 } from "./icons.js"
import { $theme, resolveTheme, setTheme, type ThemeChoice } from "./state/theme.js"

import { t, tf, msgid, setLang, $lang } from "./i18n/index.js"
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
  { value: "system", label: msgid("跟随系统") },
  { value: "light", label: msgid("亮色") },
  { value: "dark", label: msgid("暗色") },
]

/**
 * 一节设置。**标题 + 一行说明 + 若干行**——说明这一行不是装饰，
 * 它回答「这一节是干什么的」，少了它每一节都要靠标题猜。
 */
export function Section({
  title,
  desc,
  children,
  className,
}: {
  /** `set-section-bare`：里面自己带卡的（模型服务那一列），外面就不再套一层 */
  className?: string | undefined
  /**
   * **不给就不画标题**（2026-08-12）。
   *
   * 设置改成「左分类 / 右内容」之后，外壳已经在右边顶上写了这一块叫什么——
   * 里面再写一遍就是同一个词上下各一个。**同一句话说两遍不是层次，是噪声。**
   */
  title?: string | undefined
  desc?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={`set-section${className ? ` ${className}` : ""}`}>
      {title ? <h3 className="set-section-title">{title}</h3> : null}
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
export function Row({
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
          {t("配置里 kind: kernel 的 agent 靠这两个路径起内核。")}
          <em className="set-emph">{t("没有配置就不能用。")}</em>
        </>
      }
    >
      <InterpreterField
        id="interp-python"
        label={t("Python 解释器")}
        hint={t("例如 /usr/local/bin/python3 或某个 conda 环境里的 bin/python。需要它装了 ipykernel。")}
        value={interpreters.python}
        onSave={(v) => onSetInterpreter("python", v)}
      />
      <InterpreterField
        id="interp-r"
        label={t("R 解释器")}
        hint={t("例如 /usr/local/bin/R。需要它装了 IRkernel。")}
        value={interpreters.r}
        onSave={(v) => onSetInterpreter("R", v)}
      />

      {/* 参考：本机注册过的 kernelspec。**它只是帮你填上面那两个框**，不是机制 */}
      {kernels.length > 0 ? (
        <details className="kernel-ref">
          <summary>{tf("参考：本机注册过的 Jupyter 内核（{0}）", kernels.length)}</summary>
          <ul className="kernel-list">
            {kernels.map((k) => (
              <li key={k.dir} className="kernel">
                <span className="name">{k.displayName}</span>
                <span className="sub">{k.language ?? t("语言未声明")}</span>
                <p className="kernel-exe">{k.executable ?? t("（kernel.json 里没有 argv[0]）")}</p>
              </li>
            ))}
          </ul>
          {shadowed.length > 0 ? (
            <p className="caveat">
              {tf(
                "⚠ 有 {0} 个同名内核被前面的挡住了：{1}",
                shadowed.length,
                shadowed.map((x) => ` ${x.name}（${x.dir}）`).join("；"),
              )}
            </p>
          ) : null}
          {problems.length > 0 ? (
            <p className="caveat">
              {tf(
                "⚠ 有 {0} 条注册项读不出来：{1}",
                problems.length,
                problems.map((x) => ` ${x.dir}——${x.reason}`).join("；"),
              )}
            </p>
          ) : null}
          <div className="state-action">
            <Button variant="outline" size="sm" onClick={onRefresh}>
              {t("重新扫描")}
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
        placeholder={t("还没配置")}
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
        {t("保存")}
      </Button>
    </Row>
  )
}

export function AppearancePanel() {
  const theme = useStore($theme)
  const lang = useStore($lang)

  return (
    <Section>
      {/**
        * **双语**（2026-08-13，作者：*「设置里面，其实可以增加一个双语模式，
        * 我们其实可以默认是英语模式，然后有中英双语的一个按钮。」*）。
        *
        * 与主题同一副形状（`radiogroup` + 两颗），因为它们是同一类东西：
        * **这一台机器上这个人怎么看这个应用**。
        *
        * **两个选项都写自己的母语**（`中文` / `English`），不写
        * 「Chinese / English」——一个看不懂当前语言的人，正是最需要这颗按钮的人。
        * 这是本地化里最老的一条：语言选择器**永远不跟着界面语言走**。
        */}
      <Row
        name={t("语言")}
        desc={t("界面语言。默认英文；这个选择记在这台机器上。")}
      >
        <div className="theme-choices" role="radiogroup" aria-label={t("语言")}>
          {(["zh", "en"] as const).map((v) => (
            <Button
              key={v}
              variant={lang === v ? "primary" : "secondary"}
              size="sm"
              role="radio"
              aria-checked={lang === v}
              onClick={() => setLang(v)}
              /**
               * **这两个字永远不翻**，所以在 DOM 上说清楚。
               *
               * 语言选择器写自己的母语是本地化最老的一条：一个看不懂当前语言的人，
               * 正是最需要这颗按钮的人。写成「Chinese」，中文用户在英文界面上
               * 就找不着回去的路。
               *
               * 标记出来是为了让「英文界面上不许有汉字」那条扫描
               * **有一个说得出理由的例外**，而不是在测试里硬编一个「中文」白名单——
               * 例外写在被例外的那个东西上，才不会随着文案改动而失效。
               */
              data-native-name
            >
              {v === "zh" ? "中文" : "English"}
            </Button>
          ))}
        </div>
      </Row>
      <Row
        name={t("主题")}
        desc={
          theme === "system"
            ? /* 「跟随系统」四个字不回答「所以现在到底是哪个」。**说出来，别让人猜。** */
              tf(
                "跟随系统——系统当前是{0}",
                resolveTheme("system") === "dark" ? t("暗色") : t("亮色"),
              )
            : t("「跟随系统」不是亮色的同义词，它是一条会随系统变化的规则")
        }
      >
        <div className="theme-choices" role="radiogroup" aria-label={t("主题")}>
          {THEME_OPTIONS.map((o) => (
            <Button
              key={o.value}
              variant={theme === o.value ? "primary" : "secondary"}
              size="sm"
              role="radio"
              aria-checked={theme === o.value}
              onClick={() => setTheme(o.value)}
            >
              {t(o.label)}
            </Button>
          ))}
        </div>
      </Row>
    </Section>
  )
}

/**
 * **App 的默认工作目录**（2026-08-12，作者要的）。
 *
 * 作者：*「设置里面，其实要增加一个就是 App 默认设置的工作目录，
 * 也就是初始化的目录，windows 的话就默认设置在桌面吧，
 * mac 默认家目录下设置一个 `DAWN` 的目录就行。」*
 *
 * **两处用它**：没给工作目录的那些对话落在这儿（此前落在应用数据目录里——
 * 一个用户永远找不到的地方），以及选文件夹时从这儿起步。
 */
export function WorkspacePanel({
  path,
  isDefault,
  onPick,
  onReset,
  download,
}: {
  path: string
  /** 是不是系统给的默认值。**「我没配过」与「我配的就是它」是两回事** */
  isDefault: boolean
  onPick: () => void
  onReset: () => void
  /**
   * 下载目录（2026-08-18，作者定的②）。**读不到就不画这一格**——
   * 摆一个猜出来的路径比不摆更坏，它会指错地方。
   */
  download?:
    | { path: string; isDefault: boolean; onPick: () => void; onReset: () => void }
    | undefined
}) {
  return (
    <Section>
      <Row
        name={t("默认工作目录")}
        desc={
          isDefault
            ? t("没设过，用的是系统默认。没给工作目录的对话会落在这儿，选文件夹也从这儿起步。")
            : t("没给工作目录的对话会落在这儿，选文件夹也从这儿起步。")
        }
      >
        <div className="ws-setting">
          <code className="ws-setting-path">{path}</code>
          <Button variant="secondary" size="sm" onClick={onPick}>
            {t("换一个")}
          </Button>
          {/* **配过才给「恢复默认」**：没配过时它点了什么都不会变 */}
          {isDefault ? null : (
            <Button variant="text" size="sm" onClick={onReset}>
              {t("恢复默认")}
            </Button>
          )}
        </div>
      </Row>

      {/**
        * **下载目录**（作者 2026-08-18 定的②：*「在设置里面，有一个工作目录，
        * 其实这里面可以设置一个下载目录」*）。
        *
        * 后端从批 4a 起就有 `getDownloadDir` / `setDownloadDir`，
        * **但界面上一个入口都没有**——于是从服务器拉下来的文件落到哪儿，
        * 只能靠猜。「看不见的能力等于不存在」，这个项目为它栽过两次。
        *
        * ## 两颗按钮的文案为什么跟上面那一格不一样
        *
        * 上面那颗叫「换一个」。**同一屏上出现两颗「换一个」，按名字就找不准了**
        * ——读屏的「按标签跳转」、Playwright 的 `getByRole(name)`、
        * 以及人脑里的「点那个写着 X 的」，三者都是子串匹配。
        *
        * **「下载」与「文件」这两个词都不许出现在这两颗按钮上**，
        * 两条都是扫描当场抓出来的、我自己撞的：
        *   - 文件面板上那颗按钮就叫「下载」，而坞不随左半的屏切换而收起
        *     （Q3，作者选的乙）——**它和这一屏真的会同时在场**，
        *     于是「换个下载目录」把那颗按钮整个包在里面了；
        *   - 侧栏那个去处叫「文件」，于是退而求其次的「换个文件夹」又撞了一次。
        *
        * 而「恢复默认」这一颗改叫「恢复系统默认」也不只是为了躲开撞名：
        * **两个默认值的性质不同**。工作目录的默认是 DAWN 自己挑的（`~/DAWN`），
        * 下载目录的默认是**系统那个**（`app.getPath("downloads")`，
        * mac 上是 `~/Downloads`，Windows 上是它自己的下载文件夹，
        * 而且跟得上你改过的系统设置）。这件事由上面那句 `desc` 说全——
        * **说明文字里说得清的，就不要挤进按钮文案**。
        */}
      {download ? (
        <Row
          name={t("下载目录")}
          desc={
            download.isDefault
              ? t("没设过，用的是系统的下载文件夹。从服务器拉下来的文件落在这儿。")
              : t("从服务器拉下来的文件落在这儿。")
          }
        >
          <div className="ws-setting">
            <code className="ws-setting-path">{download.path}</code>
            <Button variant="secondary" size="sm" onClick={download.onPick}>
              {t("另选一处")}
            </Button>
            {download.isDefault ? null : (
              <Button variant="text" size="sm" onClick={download.onReset}>
                {t("恢复系统默认")}
              </Button>
            )}
          </div>
        </Row>
      ) : null}
    </Section>
  )
}

/**
 * 设置的两栏外壳（2026-08-12，作者要的）。
 *
 * 作者：*「我们自己的设置，比较枯燥乏味，每一项的设置，以及设置的内容，
 * 都比较乏味，看不出太大的层次。」*
 *
 * 他指的是**层次**，而不是配色——上一版是一长条平铺的 section，
 * 从「外观」一路滚到「模型服务」，**没有任何东西告诉你这里一共有几块、
 * 你现在在哪一块**。左边一列分类就是那个东西。
 *
 * ## 只放我们真有的
 *
 * 截图里那份有十一项（账户管理 / 记忆 / 安全中心 …）。
 * **我们没有那些**，照抄一个点进去是空的列表比没有更坏——
 * 这里只列真的能配的四块。
 */
export interface SettingsSection {
  id: string
  title: string
  icon: React.ReactNode
  body: React.ReactNode
  /** 分组标题（2026-08-23，「扩展」那一组）：同一组连着写，组名只在第一项前画一次 */
  group?: string | undefined
  /** 行尾的计数（技能 / 子 agent 那两个数从侧栏搬过来的） */
  count?: number | undefined
}

export function SettingsShell({
  sections,
  selected,
  onSelect,
}: {
  sections: SettingsSection[]
  /** 受控：外面（命令面板、侧栏）要能直接指到某一类 */
  selected?: string | undefined
  onSelect?: ((id: string) => void) | undefined
}) {
  const [自己的, 设自己的] = useState(sections[0]?.id)
  const 选中 = selected ?? 自己的
  const 当前 = sections.find((s) => s.id === 选中) ?? sections[0]
  if (!当前) return null
  const 选 = (id: string) => {
    设自己的(id)
    onSelect?.(id)
  }
  return (
    <div className="settings-shell">
      <nav className="settings-nav" aria-label={t("设置分类")}>
        {sections.map((s, i) => (
          <Fragment key={s.id}>
            {s.group && sections[i - 1]?.group !== s.group ? <p className="settings-nav-group">{s.group}</p> : null}
            <Button
              variant="ghost"
              size="sm"
              className={`row settings-nav-item${s.id === 当前.id ? " current" : ""}`}
              aria-current={s.id === 当前.id ? "page" : undefined}
              onClick={() => 选(s.id)}
            >
              {s.icon}
              <span className="name">{s.title}</span>
              {s.count !== undefined ? <span className="side-count" aria-hidden="true">{s.count}</span> : null}
            </Button>
          </Fragment>
        ))}
      </nav>
      {/**
        * **右边只画选中那一块**，不是全都画出来再滚动到位——
        * 后者会让「我在哪一块」这件事重新变得说不清。
        */}
      <div className="settings-body">
        <h1 className="settings-body-title">{当前.title}</h1>
        {当前.body}
      </div>
    </div>
  )
}

export interface CredentialState {
  configured: string[]
  encrypted: boolean
}

/** 一个 provider 的连接设置。**密钥不在里面**——它在钥匙串里 */
export interface Connection {
  baseUrl?: string
  api?: string
  models?: string[]
}

/**
 * 模型服务（2026-08-10 重做）。
 *
 * ## 上一版乱在哪
 *
 * 作者：*「pi 里面自己识别的一大堆，我感觉格式有点儿乱乱的。我觉得可以在设置里面，
 * 通过 baseUrl、api、models 分别留出可以填写的地方，然后自行填写。」*
 *
 * 上一版是**一张 39 行的表**：每一行一个 key 输入框、一个「改地址」折叠，
 * 而其中 38 行是你根本没用、也不打算用的。**「我配过谁」和「我能配谁」
 * 挤在同一张表里**，于是两个问题都答得含糊。
 *
 * 现在分成两件事：
 *   - **上面是你配过的**，一条一行摘要（地址 · 几个模型 · key 配没配），
 *     点开能改**任何一项**
 *   - **下面是一个「添加」入口**，二选一：从 pi 认识的列表里挑（只问 key），
 *     或者填一个自定义端点（名字 / 地址 / 协议 / 模型 / key）
 *
 * ## 为什么每一个的地址都能改
 *
 * 作者在 platform.kimi.com 买了按量 API，填进 `kimi-coding` 之后 401——
 * **pi 自带的那个地址是 Kimi For Coding 订阅线**，与他买的不是一条路。
 * **「pi 自带地址」不等于「这个地址对你也对」。**
 */
export function SettingsPanel({
  providers,
  known,
  knownProblem,
  modelsOf,
  needsBaseUrl,
  connections,
  onSaveConnection,
  credentials,
  onSet,
  onDelete,
}: {
  /** 本配置实际用到的 provider id（pi 的 provider，如 deepseek / anthropic） */
  providers: string[]
  /**
   * pi 认识的全部 provider。**`providers` 是「我配过谁」，这个是「我能配谁」**——
   * 作者机器上前者是 1，后者是 39。
   */
  known: string[]
  /** 目录取不到时的原因。**不返回一个短清单**——缺失不等于不支持 */
  knownProblem?: string | undefined
  /** 该 provider 在模型目录里有哪些模型。一行摘要上那个「几个模型」就是它 */
  modelsOf: (providerId: string) => string[]
  /**
   * **地址 pi 不自带的那几个**（Bedrock / Azure / Vertex / Cloudflare×2 /
   * opencode×2 / radius）。它们跟账号、区域、项目走，只能由人填——
   * 摘要上因此要显眼地写「还没填地址」，而不是装作一切正常。
   */
  needsBaseUrl?: readonly string[] | undefined
  /** 已经写下的连接设置。**只装写过的**，没写过的没有键 */
  connections?: Record<string, Connection> | undefined
  /** 全量替换一个 provider 的连接设置。**三样全空 = 取消覆盖** */
  onSaveConnection: (providerId: string, conn: Connection) => void
  credentials: CredentialState
  onSet: (providerId: string, secret: string) => void
  onDelete: (providerId: string) => void
}) {
  /**
   * **这台机器上「配过」的服务。** 三个来源合一：
   * 配置里被 agent 用着的、填过 key 的、写过连接设置的。
   *
   * 少任何一个来源都会漏掉一类：只看配置漏掉「填了 key 就能用」的那些，
   * 只看凭证漏掉不要 key 的自建端点。
   */
  const 已配置 = [
    ...new Set([...providers, ...credentials.configured, ...Object.keys(connections ?? {})]),
  ].sort()
  const [展开的, set展开] = useState<string | undefined>(undefined)

  return (
    <Section
      className="set-section-bare"
      desc={
        credentials.encrypted ? (
          t("填了 key 就能在对话里选它的模型。密钥存在系统的安全存储里（macOS Keychain），已存的值不会回显——界面只知道配没配。")
        ) : (
          /* **加密状态如实告知。** 没有 keychain 时它是明文，这必须是警告而不是说明 */
          <span className="caveat">{t("⚠ 系统未提供安全存储，凭证将以明文保存在用户数据目录")}</span>
        )
      }
    >
      {已配置.length === 0 ? (
        /**
         * **空的时候要说清下一步在哪。**
         *
         * 2026-08-10 起默认配置不再摆 deepseek（那会给「只能配 deepseek」的
         * 错觉），所以第一次打开这里就是空的——那一刻更要有一句话。
         */
        <p className="empty">
          还没有配置任何模型服务。下面「添加模型服务」里
          {known.length > 0 ? ` pi 认识 ${known.length} 家，` : ""}
          也可以填一个自建端点。
        </p>
      ) : (
        已配置.map((id) => (
          <服务
            key={id}
            id={id}
            展开={展开的 === id}
            onToggle={() => set展开((x) => (x === id ? undefined : id))}
            isSet={credentials.configured.includes(id)}
            models={modelsOf(id)}
            conn={connections?.[id] ?? {}}
            必须填地址={Boolean(needsBaseUrl?.includes(id))}
            pi认识={known.includes(id)}
            onSaveKey={(secret) => onSet(id, secret)}
            onDeleteKey={() => onDelete(id)}
            onSaveConn={(c) => onSaveConnection(id, c)}
            onRemove={() => {
              // **两处都要清**：钥匙串里的 key，和配置里的那一段
              if (credentials.configured.includes(id)) onDelete(id)
              if (connections?.[id]) onSaveConnection(id, {})
              set展开(undefined)
            }}
          />
        ))
      )}

      {knownProblem ? (
        <p className="caveat">⚠ 取不到 pi 的模型目录，所以列不出可以挑的 provider：{knownProblem}</p>
      ) : null}

      <添加模型服务
        可挑={known.filter((id) => !已配置.includes(id))}
        needsBaseUrl={needsBaseUrl}
        onAddKnown={(id, secret) => {
          onSet(id, secret)
          set展开(id)
        }}
        onAddCustom={(id, conn, secret) => {
          onSaveConnection(id, conn)
          if (secret) onSet(id, secret)
          set展开(id)
        }}
      />
    </Section>
  )
}

/**
 * 一条已配置的服务：**一行摘要 + 点开就能改任何一项**。
 *
 * 折叠用**条件渲染**而不是 `<details>`：`<details>` 收起时子元素仍在 DOM 里，
 * 于是「看不见」和「不存在」在测试里长得一模一样——2026-08-10 已经为此
 * 改过一次断言。这里干脆让它们真的不同。
 */
function 服务({
  id,
  展开,
  onToggle,
  isSet,
  models,
  conn,
  必须填地址,
  pi认识,
  onSaveKey,
  onDeleteKey,
  onSaveConn,
  onRemove,
}: {
  id: string
  展开: boolean
  onToggle: () => void
  isSet: boolean
  models: readonly string[]
  conn: Connection
  必须填地址: boolean
  pi认识: boolean
  onSaveKey: (secret: string) => void
  onDeleteKey: () => void
  onSaveConn: (conn: Connection) => void
  onRemove: () => void
}) {
  return (
    <div className={`svc${展开 ? " open" : ""}`}>
      {/**
        * **整行可点，且写着「设置」两个字。**
        * 今天已经为「看不见的能力等于不存在」栽过三次——
        * 一个光秃秃的三角不算入口。
        */}
      <Button
        variant="ghost"
        size="inline"
        className="svc-head"
        aria-expanded={展开}
        onClick={onToggle}
      >
        <span className="svc-name">{id}</span>
        <span className="svc-sum">{摘要({ conn, models, isSet, 必须填地址 })}</span>
        <span className="svc-toggle">{展开 ? t("收起") : t("配置它")}</span>
      </Button>
      {展开 ? (
        <服务编辑器
          id={id}
          isSet={isSet}
          conn={conn}
          必须填地址={必须填地址}
          pi认识={pi认识}
          onSaveKey={onSaveKey}
          onDeleteKey={onDeleteKey}
          onSaveConn={onSaveConn}
          onRemove={onRemove}
        />
      ) : null}
    </div>
  )
}

/**
 * 那一行摘要。**三件事，各自都是能出错的那一件**：
 * 打到哪个地址、有几个模型可选、key 填没填。
 *
 * 用 `·` 隔开而不是三个标签：这一行是**扫**的，不是读的。
 */
function 摘要({
  conn,
  models,
  isSet,
  必须填地址,
}: {
  conn: Connection
  models: readonly string[]
  isSet: boolean
  必须填地址: boolean
}): string {
  const 地址 = conn.baseUrl
    ? conn.baseUrl.replace(/^https?:\/\//, "")
    : 必须填地址
      ? t("⚠ 还没填地址")
      : t("pi 自带地址")
  /**
   * **「0 个模型」要显眼。** 它意味着这个服务在对话里选不到任何东西，
   * 而那正是「我明明配了却用不上」的第一现场。
   */
  const 模型 = models.length > 0 ? tf("{0} 个模型", models.length) : t("⚠ 没有模型")
  return [地址, 模型, isSet ? t("已填 key") : t("没填 key")].join(" · ")
}

/** 编辑器里的一格：**名字 + 一句为什么 + 控件**，与 `Row` 同一个读法 */
function 字段({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="svc-field">
      {htmlFor ? (
        <label className="svc-field-name" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="svc-field-name">{label}</span>
      )}
      <p className="hint">{hint}</p>
      {children}
    </div>
  )
}

/**
 * 点开之后的编辑器：**四样都能改**。
 *
 * key 与另外三样存在两个地方（钥匙串 / `providers.yaml`），但**只有一个保存按钮**——
 * 「存在哪」是我们的实现细节，不该变成用户要按两次的理由。
 */
function 服务编辑器({
  id,
  isSet,
  conn,
  必须填地址,
  pi认识,
  onSaveKey,
  onDeleteKey,
  onSaveConn,
  onRemove,
}: {
  id: string
  isSet: boolean
  conn: Connection
  必须填地址: boolean
  pi认识: boolean
  onSaveKey: (secret: string) => void
  onDeleteKey: () => void
  onSaveConn: (conn: Connection) => void
  onRemove: () => void
}) {
  const [key, setKey] = useState("")
  const [baseUrl, setBaseUrl] = useState(conn.baseUrl ?? "")
  const [api, setApi] = useState(conn.api ?? "")
  const [models, setModels] = useState((conn.models ?? []).join(", "))

  return (
    <form
      className="svc-body"
      onSubmit={(e) => {
        e.preventDefault()
        // key 与连接设置分两处存，但**一次保存两处都落地**
        if (key.trim()) {
          onSaveKey(key.trim())
          setKey("")
        }
        onSaveConn(连接({ baseUrl, api, models }))
      }}
    >
      <字段
        label="API key"
        htmlFor={`cred-${id}`}
        hint={t("存在系统的加密存储里，不写进配置文件。已存的值不会回显——界面拿不到它，也不该拿到。")}
      >
        <div className="svc-line">
          <input
            id={`cred-${id}`}
            className="control"
            type="password"
            aria-label={tf("{0} 的 API key", id)}
            value={key}
            placeholder={isSet ? t("已配置（输入新值可替换）") : t("粘贴 API key")}
            onChange={(e) => setKey(e.target.value)}
          />
          {isSet ? (
            <Button variant="text" size="sm" onClick={onDeleteKey}>
              {t("删掉 key")}
            </Button>
          ) : null}
        </div>
      </字段>

      <字段
        label={t("端点地址")}
        htmlFor={`base-${id}`}
        hint={
          /**
           * **两种情况说两种话。**
           *
           * 「必须填」是 pi 压根不带地址；而「可以改」是**它带的那个未必对你**——
           * 2026-08-10 作者就撞上后者：`kimi-coding` 自带的是 Kimi For Coding
           * 订阅线，而他在 platform.kimi.com 买的是按量 API，两条路，结果 401。
           */
          必须填地址 ? (
            <>
              <em className="set-emph">{t("这个 provider 的地址要你自己填")}</em>
              {t("——它跟你的账号／区域／项目走，pi 没法替你填。不填就连不上。")}
            </>
          ) : (
            <>
              {t("留空就用 pi 自带的地址。")}<em className="set-emph">{t("如果你买的是另一条线")}</em>
              {t("（订阅版与按量版常常是两个端点），在这里改成你平台文档里的 base_url。")}
            </>
          )
        }
      >
        <input
          id={`base-${id}`}
          className="control mono"
          aria-label={tf("{0} 的端点地址", id)}
          value={baseUrl}
          placeholder={t("例如 https://api.example.com/v1")}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </字段>

      <字段
        label={t("协议")}
        htmlFor={`api-${id}`}
        hint={t("留空交给 pi 自己判断。自建的 OpenAI 兼容端点通常填 openai-completions；猜错的表现是请求发得出去、对面用另一种格式回，而报错与协议毫无关系。")}
      >
        <input
          id={`api-${id}`}
          className="control mono"
          aria-label={tf("{0} 的协议", id)}
          value={api}
          placeholder="openai-completions"
          onChange={(e) => setApi(e.target.value)}
        />
      </字段>

      <字段
        label={t("模型清单")}
        htmlFor={`models-${id}`}
        hint={
          pi认识 ? (
            <>{t("用逗号隔开。留空就用 pi 自带的目录——它认识这个 provider 的模型。")}</>
          ) : (
            <>
              {t("用逗号隔开。")}<em className="set-emph">{t("自建端点必须写")}</em>
              {t("——pi 猜不出你的端点上跑着什么，不写的话模型选择器会是空的。")}
            </>
          )
        }
      >
        <input
          id={`models-${id}`}
          className="control mono"
          aria-label={tf("{0} 的模型清单", id)}
          value={models}
          placeholder="local-7b, local-70b"
          onChange={(e) => setModels(e.target.value)}
        />
      </字段>

      <div className="svc-actions">
        <Button type="submit" variant="primary" size="sm">
          {t("保存")}
        </Button>
        <Button variant="text" size="sm" onClick={onRemove}>
          {t("移除这个服务")}
        </Button>
      </div>
    </form>
  )
}

/** 三个输入框 → 一份连接设置。**空的不给字段**：空串与「没写」是两回事 */
function 连接({
  baseUrl,
  api,
  models,
}: {
  baseUrl: string
  api: string
  models: string
}): Connection {
  const list = models
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
    ...(api.trim() ? { api: api.trim() } : {}),
    ...(list.length > 0 ? { models: list } : {}),
  }
}

/** 自定义端点的名字：与 `config/writer.ts` 的 `ID` 同一条规则 */
const 名字规则 = /^[a-z0-9][a-z0-9-]{0,31}$/

/**
 * 添加一个模型服务（2026-08-10）。
 *
 * 作者要的形态：*「一个「添加」入口，二选一。」*
 *
 * 两条路的差别不是排版，是**你知道多少**：
 *   - pi 认识它 → 地址、协议、模型目录它都有，**只缺一把钥匙**
 *   - pi 不认识 → 四样都得你说，尤其是模型清单：**pi 猜不出你的端点上跑着什么**
 */
function 添加模型服务({
  可挑,
  needsBaseUrl,
  onAddKnown,
  onAddCustom,
}: {
  可挑: string[]
  needsBaseUrl?: readonly string[] | undefined
  onAddKnown: (providerId: string, secret: string) => void
  onAddCustom: (providerId: string, conn: Connection, secret: string) => void
}) {
  const [开, set开] = useState(false)
  const [路, set路] = useState<"pi" | "自定义">("pi")

  if (!开) {
    return (
      <div className="svc-add-entry">
        <Button variant="outline" size="sm" onClick={() => set开(true)}>
          {t("＋ 添加模型服务")}
        </Button>
      </div>
    )
  }

  /**
   * **弹窗，不是就地展开**（2026-08-12，作者给了截图）。
   *
   * 上一版是在列表下面撑开一块。摆在弹窗里有两个实际好处，
   * 不只是长得像：
   *   - **它是一件要做完的事**：填到一半被下面的列表挤动会很难受；
   *   - **Esc 退得掉**，而就地展开那块没有「退出」这个概念。
   *
   * 壳复用远端连接那个对话框的（`.confirm-backdrop` + `.confirm`）——
   * **同一种东西不该有两套外壳**。
   */
  return (
    <div
      className="confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("添加模型服务")}
      onKeyDown={(e) => {
        if (e.key === "Escape") set开(false)
      }}
      // 点到框外也关（2026-08-23 作者：「退不出去了」——Esc 只在焦点落在框里时管用）
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) set开(false)
      }}
    >
      <div className="confirm svc-add">
        {/* 右上角一颗 ×（作者要的）；名字不叫「关闭」——别处还有同名的 */}
        <Button variant="ghost" size="icon" className="svc-add-close" aria-label={t("收起添加模型服务")} onClick={() => set开(false)}>
          <关闭图标 />
        </Button>
        <h2 className="confirm-title">
          添加模型服务
          {/**
            * **说清这里能加什么**（学自截图上那个 chip）。
            * 不说的话，「自定义端点」到底要什么样的地址只能靠试。
            */}
          <span className="svc-add-note">{t("只支持 OpenAI 兼容协议的端点")}</span>
        </h2>
      <div className="svc-tabs" role="radiogroup" aria-label={t("添加方式")}>
        <Button
          variant={路 === "pi" ? "primary" : "secondary"}
          size="sm"
          role="radio"
          aria-checked={路 === "pi"}
          onClick={() => set路("pi")}
        >
          从 pi 认识的里面挑（{可挑.length}）
        </Button>
        <Button
          variant={路 === "自定义" ? "primary" : "secondary"}
          size="sm"
          role="radio"
          aria-checked={路 === "自定义"}
          onClick={() => set路("自定义")}
        >
          {t("自定义端点")}
        </Button>
      </div>
        {路 === "pi" ? (
          <从列表里挑
            可挑={可挑}
            needsBaseUrl={needsBaseUrl}
            onAdd={(id, secret) => {
              onAddKnown(id, secret)
              set开(false)
            }}
          />
        ) : (
          <自定义端点
            onAdd={(id, conn, secret) => {
              onAddCustom(id, conn, secret)
              set开(false)
            }}
          />
        )}
      </div>
    </div>
  )
}

/** 从 pi 认识的那一堆里挑一个，**只问 key** */
function 从列表里挑({
  可挑,
  needsBaseUrl,
  onAdd,
}: {
  可挑: string[]
  needsBaseUrl?: readonly string[] | undefined
  onAdd: (providerId: string, secret: string) => void
}) {
  const [filter, setFilter] = useState("")
  const [选中, set选中] = useState("")
  const [key, setKey] = useState("")
  const [问题, set问题] = useState<string | undefined>(undefined)

  const 命中 = filter.trim()
    ? 可挑.filter((id) => id.toLowerCase().includes(filter.trim().toLowerCase()))
    : 可挑
  /** 筛完之后选中的那个可能已经不在列表里了——**以列表为准** */
  const 当前 = 命中.includes(选中) ? 选中 : (命中[0] ?? "")

  if (可挑.length === 0) {
    return <p className="hint">{t("pi 认识的 provider 都已经配过了。要加别的就走「自定义端点」。")}</p>
  }

  return (
    <form
      className="svc-add-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!当前) return set问题(t("先挑一个 provider"))
        /**
         * **不给一个存不下的「添加」。** key 是这条路唯一会落到磁盘上的东西，
         * 不填的话点完「添加」什么都不会发生，而界面会看起来像成功了。
         */
        if (!key.trim()) {
          return set问题(t("要填 key——pi 要求每个服务都有一把钥匙才肯调用。"))
        }
        set问题(undefined)
        onAdd(当前, key.trim())
      }}
    >
      <字段 label={t("挑一个")} htmlFor="pick-provider" hint={t("地址、协议、模型目录 pi 都有，只缺一把钥匙。")}>
        <div className="svc-line">
          <input
            className="control"
            value={filter}
            placeholder={t("筛选，例如 anthropic")}
            aria-label={t("筛选 provider")}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            id="pick-provider"
            className="control"
            aria-label={t("pi 认识的 provider")}
            value={当前}
            onChange={(e) => set选中(e.target.value)}
          >
            {命中.map((id) => (
              <option key={id} value={id}>
                {id}
                {needsBaseUrl?.includes(id) ? t("（还要填地址）") : ""}
              </option>
            ))}
          </select>
        </div>
      </字段>
      <字段 label="API key" htmlFor="pick-key" hint={t("存进系统的加密存储，不写进配置文件。")}>
        <input
          id="pick-key"
          className="control"
          type="password"
          aria-label={t("新服务的 API key")}
          value={key}
          placeholder={t("粘贴 API key")}
          onChange={(e) => setKey(e.target.value)}
        />
      </字段>
      {问题 ? <p className="caveat">⚠ {问题}</p> : null}
      <div className="svc-actions">
        {/* **不叫「添加」**：那两个字是「＋ 添加模型服务」「＋ 添加服务器」的
            一部分，按名字找按钮时会同时指向三个东西——屏幕阅读器与测试都一样 */}
        <Button type="submit" variant="primary" size="sm">
          {t("加进来")}
        </Button>
      </div>
    </form>
  )
}

/**
 * 自定义端点：**四样都得你说**。
 *
 * 这条路顺带把自建的 vLLM / Ollama / 任何 OpenAI 兼容端点接了进来——
 * 它们根本不在 pi 那 40 个里，要的正是同一样东西。
 */
function 自定义端点({
  onAdd,
}: {
  onAdd: (providerId: string, conn: Connection, secret: string) => void
}) {
  const [id, setId] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [api, setApi] = useState("openai-completions")
  const [models, setModels] = useState("")
  const [key, setKey] = useState("")
  const [问题, set问题] = useState<string | undefined>(undefined)

  return (
    <form
      className="svc-add-form"
      onSubmit={(e) => {
        e.preventDefault()
        const 名 = id.trim()
        /**
         * **三样是硬的，各有各的理由**——不是为了整齐：
         * 名字要进 YAML 的键；没有地址连不上；没有模型清单，
         * 模型选择器会是空的而没有一句话解释为什么。
         */
        if (!名字规则.test(名)) {
          return set问题(t("名字只能用小写字母、数字和连字符，且不超过 32 个字符"))
        }
        if (!baseUrl.trim()) return set问题(t("要填端点地址——pi 不认识这个服务，猜不出它在哪"))
        const conn = 连接({ baseUrl, api, models })
        if (!conn.models) {
          return set问题(t("要填至少一个模型 id——pi 猜不出你的端点上跑着什么"))
        }
        /**
         * **key 也是必填的，哪怕你的端点不要。**
         *
         * 2026-08-10 在真实产物上验出来的：留空之后 pi 直接拒绝调用，
         * 报的是 `No API key found for mine`。这里原本写着「本地端点常常不需要，
         * 留空即可」——**那句话是我想当然写的，而它是错的**。
         * 与其让人配完发现用不了，不如当场说清这条约束。
         */
        if (!key.trim()) {
          return set问题(
            t("要填 key：pi 要求每个服务都有一把钥匙才肯调用。本地端点（vLLM / Ollama）随便填一个值即可，比如 local。"),
          )
        }
        set问题(undefined)
        onAdd(名, conn, key.trim())
      }}
    >
      <字段
        label={t("名字")}
        htmlFor="new-id"
        hint={t("它会写进 providers.yaml 当键，也会显示在对话的模型选择器里。")}
      >
        <input
          id="new-id"
          className="control"
          aria-label={t("新服务的名字")}
          value={id}
          placeholder={t("例如 my-vllm")}
          onChange={(e) => setId(e.target.value)}
        />
      </字段>
      <字段 label={t("端点地址")} htmlFor="new-base" hint={t("平台文档里那个 base_url。")}>
        <input
          id="new-base"
          className="control mono"
          aria-label={t("新服务的端点地址")}
          value={baseUrl}
          placeholder="https://api.example.com/v1"
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </字段>
      <字段
        label={t("协议")}
        htmlFor="new-api"
        hint={t("大多数自建端点是 OpenAI 兼容的，保持默认即可。")}
      >
        <input
          id="new-api"
          className="control mono"
          aria-label={t("新服务的协议")}
          value={api}
          placeholder="openai-completions"
          onChange={(e) => setApi(e.target.value)}
        />
      </字段>
      <字段
        label={t("模型清单")}
        htmlFor="new-models"
        hint={t("用逗号隔开。pi 猜不出你的端点上跑着什么，所以这一项必须写。")}
      >
        <input
          id="new-models"
          className="control mono"
          aria-label={t("新服务的模型清单")}
          value={models}
          placeholder="local-7b, local-70b"
          onChange={(e) => setModels(e.target.value)}
        />
      </字段>
      <字段
        label="API key"
        htmlFor="new-key"
        hint={t("pi 要求每个服务都有一把钥匙才肯调用。本地端点（vLLM / Ollama）用不上它，随便填一个值即可，比如 local。")}
      >
        <input
          id="new-key"
          className="control"
          type="password"
          aria-label={t("新服务的 API key")}
          value={key}
          placeholder={t("粘贴 API key；本地端点填任意值")}
          onChange={(e) => setKey(e.target.value)}
        />
      </字段>
      {问题 ? <p className="caveat">⚠ {问题}</p> : null}
      <div className="svc-actions">
        {/* **不叫「添加」**：那两个字是「＋ 添加模型服务」「＋ 添加服务器」的
            一部分，按名字找按钮时会同时指向三个东西——屏幕阅读器与测试都一样 */}
        <Button type="submit" variant="primary" size="sm">
          {t("加进来")}
        </Button>
      </div>
    </form>
  )
}

/* ── ACP 适配器 ───────────────────────────────────────────────────── */

/**
 * **预置那两个**（2026-08-19）。
 *
 * 两条都是拿真适配器撞出来过的（2026-08-16 那一轮，见
 * `specs/2026-08-16-acp-runtime-design.md` 里逐条记着它们的差异），
 * 所以这里写的不是「大概是这么用的」，是**跑通过的那条命令**。
 *
 * `npx -y` 那条要求机器上有 Node。**不假装没有这个前提**——
 * 下面那句说明就写着它，而不是等人点下去看一串 ENOENT。
 */
/**
 * `remoteCapable`：它会不会把读写与命令借给 DAWN（T3，2026-08-21，真适配器上量的）。
 * 借的那个在远端会话里手能伸到服务器；不借的只能在本机干活，远端建会话时不列它。
 * `说` 里把这件事写出来——**挑之前就该知道**，不是建完会话才发现它在本机。
 */
const 预置适配器: readonly {
  agentId: string
  名: string
  command: string
  args: string[]
  remoteCapable: boolean
  说: () => string
}[] = [
  {
    agentId: "codex-acp",
    名: "Codex",
    command: "npx",
    args: ["-y", "@agentclientprotocol/codex-acp"],
    remoteCapable: false,
    说: () => `@agentclientprotocol/codex-acp · ${t("只在本机运行")}`,
  },
  {
    agentId: "claude-code-acp",
    名: "Claude Code",
    command: "npx",
    args: ["-y", "@zed-industries/claude-code-acp"],
    remoteCapable: true,
    说: () => `@zed-industries/claude-code-acp · ${t("手能到服务器：读写与命令落在远端")}`,
  },
]

/**
 * ACP 适配器（2026-08-19）。
 *
 * 作者：*「你现在要在选择模型的地方加上我们之前开发 ACP 的东西，
 * 否则岂不是白开发了。」*
 *
 * ## 为什么入口在设置里，而不在模型选择器里
 *
 * 作者说的是「选择模型的地方」，而缺的其实是**「怎么把它加进来」**——
 * 那是配置，不是选择。塞进选择器的菜单里，那个菜单就同时是
 * 「挑一个」和「造一个」两件事；而**配置这件事在这个应用里已经有一个家**
 * （设置 → 模型服务就在隔壁）。
 *
 * **加完它立刻出现在模型选择器里**，带着 ACP 标记——那一半是早就做好的。
 */

/* ── 视觉服务 ─────────────────────────────────────────────────────── */

/** `getVision` 回来的那份。**没有密钥本身**，只有配没配过 */
export interface VisionState {
  enabled: boolean
  api: string
  baseUrl?: string | undefined
  model?: string | undefined
  hasSecret: boolean
  ready: boolean
}

/**
 * 在线视觉服务（2026-08-20，作者要的；设计定案见
 * `specs/2026-08-20-视觉服务-design.md`）。
 *
 * 作者：*「给 deepseek 添加一个视觉，放在设置里面的模型选择里面，
 * 做一个选择框，是否添加视觉，选择之后才能调用。」* 并给了一张他用过的
 * 插件截图——字段与措辞照它：API 协议 / API 地址 / 模型名称 / API 密钥 /
 * 「已保存；留空表示不修改」/ 测试视觉模型。
 *
 * **全局一份，谁的目录里没声明收图谁用**——所以它放在「模型服务」
 * 这一屏里，而不是挂在某一家 provider 底下。
 *
 * 三个注入的异步函数而不是直接拿 client：**这块面板要能在单测里
 * 用假函数摆布**（与别的面板同一副做法）。
 */
export function VisionPanel({
  load,
  save,
  test,
}: {
  load: () => Promise<VisionState>
  save: (v: { enabled: boolean; baseUrl?: string; model?: string; secret?: string }) => Promise<{ ready: boolean }>
  test: () => Promise<{ ok: boolean; text: string }>
}) {
  const [态, set态] = useState<VisionState | undefined>(undefined)
  const [enabled, setEnabled] = useState(false)
  const [baseUrl, setBaseUrl] = useState("")
  const [model, setModel] = useState("")
  const [secret, setSecret] = useState("")
  const [说明, set说明] = useState<string | undefined>(undefined)
  const [测试中, set测试中] = useState(false)
  const [测试结果, set测试结果] = useState<{ ok: boolean; text: string } | undefined>(undefined)

  useEffect(() => {
    load()
      .then((v) => {
        set态(v)
        setEnabled(v.enabled)
        setBaseUrl(v.baseUrl ?? "")
        setModel(v.model ?? "")
      })
      // 读不到也要出声——**一块默认值的表单与「读失败」在屏幕上不能长一样**
      .catch((e: unknown) => set说明(`读不到视觉配置：${e instanceof Error ? e.message : String(e)}`))
    /**
     * **只在挂载时读一次**，deps 故意不含 `load`：调用方图省事传的是
     * 内联箭头，每次渲染都是新引用，进 deps 就是每帧重读一遍配置。
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="vision-card">
    <Section
      title={t("在线视觉服务")}
      desc={
        <>
          {t("让目录里没声明支持图片的模型（DeepSeek 等）借这个端点看图：贴进对话的图会先被它转述成文字，agent 也多一个 look_at_image 工具去看工作区里的图。")}
          {態徽章(态)}
        </>
      }
    >
      <div className="svc-field">
        <label className="svc-field-name" htmlFor="vision-enabled">
          {t("启用视觉")}
        </label>
        {/**
          * 作者要的那个选择框。**不勾 = 两条缝都不接**，一切如旧——
          * 这一格是整个功能的总闸，所以放最上面。
          */}
        <input
          id="vision-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
      </div>

      <字段 label={t("API 协议")} htmlFor="vision-api" hint={t("目前只支持这一种；视觉端点几乎都兼容它。")}>
        {/* 只有一项也画成下拉：**留着位**，下一种协议来时这里不用改形状 */}
        <select id="vision-api" className="control" value="openai-completions" onChange={() => {}}>
          <option value="openai-completions">OpenAI Chat Completions</option>
        </select>
      </字段>

      <字段 label={t("API 地址")} htmlFor="vision-url" hint={t("兼容端点的根地址，不带 /chat/completions。")}>
        <input
          id="vision-url"
          className="control mono"
          value={baseUrl}
          placeholder="https://your-vision.example/v1"
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </字段>

      <字段 label={t("模型名称")} htmlFor="vision-model" hint={t("那个端点上的视觉模型 id。")}>
        <input
          id="vision-model"
          className="control mono"
          value={model}
          placeholder="qwen-vl-plus"
          onChange={(e) => setModel(e.target.value)}
        />
      </字段>

      <字段
        label={t("API 密钥")}
        htmlFor="vision-key"
        hint={t("密钥存在系统的安全存储里，保存后不会回显。")}
      >
        <input
          id="vision-key"
          className="control mono"
          type="password"
          value={secret}
          placeholder={态?.hasSecret ? t("已保存；留空表示不修改") : t("还没有保存密钥")}
          onChange={(e) => setSecret(e.target.value)}
        />
      </字段>

      <div className="svc-actions">
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            save({
              enabled,
              ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
              ...(model.trim() ? { model: model.trim() } : {}),
              ...(secret ? { secret } : {}),
            })
              .then(({ ready }) => {
                setSecret("")
                set测试结果(undefined)
                set说明(ready ? t("已保存，视觉服务就绪。") : t("已保存，但还没就绪——看右上角缺什么。"))
                return load().then((v) => set态(v))
              })
              .catch((e: unknown) => set说明(`保存失败：${e instanceof Error ? e.message : String(e)}`))
          }}
        >
          {t("存下来")}
        </Button>
        {/**
          * **真调一次**，与 MCP 的「试一次」同一个理由：填完配置不试一发，
          * 第一次失败会发生在正经干活的时候。发的是一块内置的红色方块——
          * 端点回「红色」就是真通了，人眼可核对。
          */}
        <Button
          variant="ghost"
          size="sm"
          disabled={测试中}
          onClick={() => {
            set测试中(true)
            set测试结果(undefined)
            test()
              .then(set测试结果)
              .catch((e: unknown) => set测试结果({ ok: false, text: e instanceof Error ? e.message : String(e) }))
              .finally(() => set测试中(false))
          }}
        >
          {测试中 ? t("正在测…") : t("测试视觉模型")}
        </Button>
      </div>
      {说明 ? <p className="hint">{说明}</p> : null}
      {测试结果 ? (
        <p className={测试结果.ok ? "hint" : "caveat"}>
          {测试结果.ok ? tf("端点回话了：{0}", 测试结果.text) : tf("测试失败：{0}", 测试结果.text)}
        </p>
      ) : null}
    </Section>
    </div>
  )
}

/** 右上那颗状态。**「未配置”不写成错误**——没配是常态，不是事故 */
function 態徽章(态: VisionState | undefined) {
  if (!态) return null
  return 态.ready ? (
    <span className="vision-ready"> {t("已就绪")}</span>
  ) : 态.enabled ? (
    <span className="caveat"> {t("已启用但未配置齐")}</span>
  ) : null
}

export function AcpPanel({
  agents,
  onAdd,
  onRemove,
  onSetRemoteCapable,
}: {
  /** 现在配置里有哪些 acp agent，以及各自能不能把手借到服务器 */
  agents: readonly { agentId: string; remoteCapable: boolean }[]
  onAdd: (agent: { agentId: string; command: string; args: string[]; remoteCapable?: boolean }) => void
  onRemove: (agentId: string) => void
  /**
   * 标上／摘掉「能上服务器」（2026-08-21）。
   *
   * T3 之前接入的 `claude-code-acp` 没有这个标记，而远端会话只认带标记的——
   * 作者那天在界面上哪儿都找不到它，最后靠「移除再一键接入」绕过去。
   * 一个标记不该要人删掉重来。
   */
  onSetRemoteCapable: (agentId: string, on: boolean) => void
}) {
  const [自定义, 设自定义] = useState(false)
  const [id, 设id] = useState("")
  const [命令, 设命令] = useState("")
  const [参数, 设参数] = useState("")

  return (
    <section className="settings-section">
      <p className="hint">
        {t(
          "ACP 适配器是一个独立进程，DAWN 通过 Agent Client Protocol 跟它说话。它会主动问你要不要允许某次工具调用，所以这类会话里会多一张权限卡。",
        )}
      </p>

      {agents.length > 0 ? (
        <ul className="acp-list">
          {agents.map((a) => {
            /**
             * **预置里本该能上、配置里却没标**：这就是 T3 之前接入的老条目。
             * 直接说出来，而不是让人对着一条「只在本机运行」猜为什么远端列表里没有它。
             */
            const 预置 = 预置适配器.find((p) => p.agentId === a.agentId)
            const 老条目 = Boolean(预置?.remoteCapable) && !a.remoteCapable
            return (
            <li key={a.agentId} className="acp-row">
              <div className="acp-row-text">
                <span className="name">{a.agentId}</span>
                {/* **每一条都写清手到不到得了服务器**——远端建会话只认能到的 */}
                <span className={`sub${老条目 ? " caveat" : ""}`}>
                  {a.remoteCapable
                    ? t("手能到服务器：读写与命令落在远端")
                    : 老条目
                      ? t("接入时还没有「能上服务器」这个标记——它其实能，标上之后远端会话就能选它")
                      : t("只在本机运行")}
                </span>
              </div>
              {/* **切换键常驻**，与删除键一样不靠悬停 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSetRemoteCapable(a.agentId, !a.remoteCapable)}
              >
                {a.remoteCapable ? t("改为只在本机") : t("标为能上服务器")}
              </Button>
              {/* **删除键常驻**，不是悬停才出现——那条本项目栽过两次 */}
              {/**
                * **文字按钮 + `.danger`，不是实心红的 `variant="danger"`。**
                *
                * 后者是一整屏底部那种「移除项目」用的，摆在一行列表里太吵。
                * 而 `.danger` 这个类**在 2026-08-19 之前只是一个名字**
                * （`styles.css` 里没有任何一条规则叫它，设计契约的既有欠账
                * 清单上就挂着 `views.tsx：.danger`）——这一轮把它做成了真的。
                */}
              <Button variant="text" size="sm" className="danger" onClick={() => onRemove(a.agentId)}>
                {t("移除这个适配器")}
              </Button>
            </li>
            )
          })}
        </ul>
      ) : (
        // **空态说清楚它是空的**，不是一片留白
        <p className="hint">{t("还没有接入任何 ACP 适配器。")}</p>
      )}

      <div className="acp-add">
        {预置适配器
          .filter((p) => !agents.some((a) => a.agentId === p.agentId))
          .map((p) => (
            <div key={p.agentId} className="acp-preset">
              <div className="acp-preset-text">
                <span className="name">{p.名}</span>
                <span className="sub">{p.说()}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onAdd({ agentId: p.agentId, command: p.command, args: p.args, remoteCapable: p.remoteCapable })
                }
              >
                {t("一键接入")}
              </Button>
            </div>
          ))}
        {/**
          * **前提要说在前面。** `npx -y` 那两条要求机器上有 Node；
          * 不说的话，点下去得到的是一串 ENOENT，而那与「你没装 Node」
          * 之间隔着好几层。
          */}
        <p className="caveat">
          {t("上面两条走 npx，需要机器上有 Node。已经装好适配器的话，用下面的自定义命令直接指过去。")}
          {" "}
          {t("自定义的适配器默认只在本机运行。")}
        </p>
      </div>

      {自定义 ? (
        <form
          className="acp-custom"
          onSubmit={(e) => {
            e.preventDefault()
            onAdd({
              agentId: id.trim(),
              command: 命令.trim(),
              /**
               * **按空白切，空的都丢掉。** 这里刻意不做 shell 解析：
               * 带空格的路径请用下面那种写法（一行一个参数做不到时，
               * 直接改 `providers.yaml`）。**不假装我们会解析引号**——
               * 半个 shell 解析器比没有更坏。
               */
              args: 参数.split(/\s+/).filter(Boolean),
            })
            设id("")
            设命令("")
            设参数("")
            设自定义(false)
          }}
        >
          {/* **用既有的 `Row`**：设置里每一行长什么样已经有一个家了，
              另造一套 `.set-field` 就是同一件事的第二份实现 */}
          <Row name={t("名字")} desc={t("在配置与模型选择器里显示成什么")}>
            <input
              className="control"
              value={id}
              onChange={(e) => 设id(e.target.value)}
              placeholder="my-acp"
              aria-label={t("适配器名字")}
            />
          </Row>
          <Row name={t("命令")} desc={t("适配器的可执行文件，不是 claude / codex 本身")}>
            <input
              className="control"
              value={命令}
              onChange={(e) => 设命令(e.target.value)}
              placeholder="node"
              aria-label={t("适配器命令")}
            />
          </Row>
          <Row name={t("参数")} desc={t("按空格分开。带空格的路径请直接改 providers.yaml")}>
            <input
              className="control"
              value={参数}
              onChange={(e) => 设参数(e.target.value)}
              placeholder="/path/to/adapter/dist/index.js"
              aria-label={t("适配器参数")}
            />
          </Row>
          <div className="state-action">
            <Button type="submit" variant="primary" size="sm" disabled={!id.trim() || !命令.trim()}>
              {t("接入这个适配器")}
            </Button>
            {/* **不叫「取消」**：确认框上那颗就叫这个，两处同名会让按名字找变成靠运气 */}
            <Button variant="text" size="sm" onClick={() => 设自定义(false)}>
              {t("先不接")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="state-action">
          <Button variant="text" size="sm" onClick={() => 设自定义(true)}>
            {t("＋ 自定义一条命令")}
          </Button>
        </div>
      )}
    </section>
  )
}
