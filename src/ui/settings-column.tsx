/**
 * 设置那一栏（2026-09-16，规格 `2026-09-16-设置右栏-design.md`）。
 *
 * **它是整页那两栏「在时间上错开」，不是另一套页面。** 整页是
 * `分类列 | 内容` 并排；这里是同样的分类、同样的分组、同样的顺序、同样的计数，
 * 只是一次只画一个。所以 `sections` 是同一份（`App.tsx` 的 `设置分区`）。
 *
 * ## 「我在哪一块」由谁回答
 *
 * 整页里那一列分类一直亮着，这个问题不用想。窄栏里由**标题 + 返回箭头**扛。
 * 这一列宽 280–720px（`RIGHT_DOCK_MIN/MAX`，默认 380，与 `RightDock` 同一套上下界）：
 * 再宽也容不下「分类列 | 内容」并排，所以一次只答一个问题是标准取舍，不是将就。
 *
 * ## 这个文件只管画
 *
 * 开合、互斥、回程全在 `state/settings-column.ts`。**这里一个 store 都不写**——
 * 状态散进组件之后，「关掉设置为什么没把面板还回来」就没有唯一的地方可查。
 *
 * ## 三处没有照抄计划原文（Task 5 审查时定的，都被 `design-contract.test.ts` /
 * `i18n.test.ts` 现场抓到过一次）
 *
 * - `✕`：`RightDock`（`views.tsx`）的 `.dock-close` 已经用 `关闭图标` 而不是
 *   裸字符——这个组件明确要当 `.dock-close` 的同类，就该用同一个图标，
 *   不然两个长得一样的东西第一眼就不一样。**它的 `aria-label` 也直接借
 *   `t("关闭面板")`**（同一颗 `RightDock` 已经在用）——新造一句「关闭设置」
 *   会把「设置」这个已经在用的按钮名塞进另一个按钮的名字里，`getByRole` 一按
 *   名字找就会连着「设置」那条侧栏入口一起撞上。
 * - 返回：**画成 `返回图标`，不是裸 `‹`**（2026-09-16 作者定的：*「图标也要保持
 *   我原来图标的样式才行」*）。头上这两颗于是都是图标组件，与全 app 一致。
 *   此前它是裸字符，理由是 `web.tsx` 前进/后退那两颗也这么写——那是真的先例，
 *   但作者已经说了他要哪一种，**先例让位于他的偏好**。
 *   `返回图标` 与 `下拉图标` 共用 `icons.tsx` 里那一条 `雪佛龙`（差 90°），
 *   所以描边粗细与圆角天生一样。**`aria-label` 仍然要留**（这颗没有可见文字），
 *   借用 `t("回到清单")`（`artifacts.tsx` 详情页回名单那颗的原话）——
 *   同一个动作（从详情退回名单），不必新造一句还带着「返回」两个字的文案，
 *   「返回」已经是 `App.tsx` 里另一颗按钮的名字，子串照样会撞。
 *
 * ## Round 2（code review）：那条能拖的缝长在这儿，不是 Task 6
 *
 * `RightDock` 的宽度可拖（`SideSash`，`side="right"` + `attach="edge"` 贴自己的
 * 真实左缘——与下面 JSX 里那条 `SideSash` 自己的注释一致，也是 `views.tsx:1162`
 * 那条的同一个理由）。
 * 这条缝**只能长在被拖的元素自己身上**——`attach="edge"` 按父元素的样式定位，
 * 挪成 `<SettingsColumn>` 的兄弟就会贴错东西。所以宽度与拖拽跟 `RightDock`
 * 一样是这个组件自己的 props，不是 Task 6 拼出来的外层布局。
 *
 * ## Round 3（code review）：I1 的注释指错了对象
 *
 * `.settings-column .dock-title` 的 `margin: 0` 不是在对齐 `.right-dock
 * .dock-title`——**那条规则没有任何东西在用**：`RightDock` 的头部是
 * `.dock-tabs-row` + `.dock-close`（`views.tsx:1175-1208`），从不渲染
 * `.dock-title`；这个类名今天只有两处调用点，`dock.tsx:61`（底部终端 dock 头上
 * 一个 `<span>`，没有 UA 外距可言）与这个文件自己的 `<h2>`。真正的原因是
 * **项目里没有一条全局的标题重置**——`<h2>` 天生带着 UA 的 `margin: 0.83em 0`，
 * 不清掉它，头部高度就会被这段外距撑大。
 */
import { Fragment } from "react"
import { Button } from "./primitives.js"
import type { SettingsSection } from "./Settings.js"
import { 关闭图标, 返回图标 } from "./icons.js"
import { t } from "./i18n/index.js"
import { SideSash } from "./sash.js"
import { RIGHT_DOCK_MAX, RIGHT_DOCK_MIN } from "./state/right-dock.js"

export function SettingsColumn({
  sections,
  selected,
  onSelect,
  onBack,
  onExpand,
  onClose,
  width,
  onWidth,
}: {
  sections: SettingsSection[]
  /**
   * `undefined` = 停在名单上。**缺失就是「还没挑」**，不是某个具体分类。
   *
   * **认不出来的 id 也退回名单**（2026-09-16 审查提的）：`loadSettingsSection`
   * 不校验存下来的字符串——校验就得在 state 里再存一份分类 id 名单，
   * 而「同一份名单两个地方各存一遍」正是本项目当成「没有判据」的那种重复。
   * 所以判据放在这儿：`.find()` 本身找不到就是 `undefined`，不用再补一次。
   */
  selected: string | undefined
  onSelect: (id: string) => void
  onBack: () => void
  onExpand: () => void
  onClose: () => void
  /** 这一列此刻的宽度，与 `RightDock` 同一条缝、同一套上下界（`RIGHT_DOCK_MIN/MAX`） */
  width: number
  /** 拖动中每帧一次「drag」，抬手/键盘一步是「commit」——与 `RightDock` 的 `onWidth` 同一份契约 */
  onWidth: (px: number, 记住: boolean) => void
}) {
  const 当前 = selected === undefined ? undefined : sections.find((s) => s.id === selected)
  return (
    <aside className="settings-column" aria-label={t("设置")}>
      <SideSash
        width={width}
        min={RIGHT_DOCK_MIN}
        max={RIGHT_DOCK_MAX}
        onResize={(px, phase) => onWidth(px, phase === "commit")}
        side="right"
        /* 贴自己的真实左缘，不按 `width` 算偏移——与 `RightDock` 那条缝同一个理由（2026-08-21） */
        attach="edge"
        label={t("调整面板宽度")}
      />
      <header className="dock-head">
        {当前 ? (
          <Button variant="ghost" size="icon" className="settings-column-back" onClick={onBack} aria-label={t("回到清单")}>
            <返回图标 />
          </Button>
        ) : null}
        <h2 className="dock-title">{当前 ? 当前.title : t("设置")}</h2>
        <div className="settings-column-tools">
          {/* **可见文案 = 可及名字**（`dock.tsx` 那条纪律）：不另写 `aria-label`，
              免得眼睛读到的与读屏念到的不是一句话 */}
          <Button variant="ghost" size="sm" className="settings-column-expand" onClick={onExpand}>
            {t("展开")}
          </Button>
          <Button variant="ghost" size="icon" className="dock-close" onClick={onClose} aria-label={t("关闭面板")}>
            <关闭图标 />
          </Button>
        </div>
      </header>
      <div className="dock-body">
        {当前 ? (
          当前.body
        ) : (
          /**
           * 名单。**沿用 `settings-nav-item` 现成的长相与 `side-count`**——
           * 同一种东西不该有两种样子，而且整页那边改了这边自动跟上。
           *
           * 这个组件有两处可访问名与别处重了：这个 `nav` 的 `aria-label`
           * 跟 `Settings.tsx:676` 的 `.settings-nav` 撞了同一句「设置分类」；
           * 上面那条 `SideSash` 的 `label` 跟 `RightDock`（`views.tsx:1164`）
           * 撞了同一句「调整面板宽度」。**想过是不是「没有判据」**，结论都
           * 是安全的，但理由不是同一条不变式：
           * - 这个 `nav` 对整页 `SettingsShell`：由 `state/settings-column.ts`
           *   的 `开设置栏` / `展开设置` / `收起设置` 保证——三个函数都在
           *   切进窄栏或整页之前先把另一个的 `$view`/`$settingsColumnOpen`
           *   状态收掉，两种形状不会同屏（**不是**「那一列只有一个位置」
           *   那条——那条管的是窄栏 vs. 坞，不是窄栏 vs. 整页）。
           * - `SideSash` 对 `RightDock` 的那条：由「那一列只有一个位置」
           *   这条不变式保证——`$settingsColumnOpen && $rightDockOpen` 不能
           *   同时为真，两条缝天生不会同屏。
           */
          <nav className="settings-column-list" aria-label={t("设置分类")}>
            {sections.map((s, i) => (
              <Fragment key={s.id}>
                {s.group && sections[i - 1]?.group !== s.group ? (
                  <p className="settings-nav-group">{s.group}</p>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="row settings-nav-item"
                  onClick={() => onSelect(s.id)}
                >
                  {s.icon}
                  <span className="name">{s.title}</span>
                  {s.count !== undefined ? (
                    <span className="side-count" aria-hidden="true">
                      {s.count}
                    </span>
                  ) : null}
                  <span className="settings-column-arrow" aria-hidden="true">
                    ›
                  </span>
                </Button>
              </Fragment>
            ))}
          </nav>
        )}
      </div>
    </aside>
  )
}
