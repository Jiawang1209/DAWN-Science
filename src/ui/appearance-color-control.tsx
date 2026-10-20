/** 主题色与各区域背景色共用的预设/色盘/屏幕取色/HEX-RGB控件。 */
import { useEffect, useState } from "react"
import { Button } from "./primitives.js"
import { 复制图标, 回退图标 } from "./icons.js"
import { 在组词 } from "./ime.js"
import { ACCENT_PRESETS, isHex, hex转三元组, 三元组转hex } from "./state/accent.js"
import { Eyedropper } from "./eyedropper.js"
import { ColorPanel } from "./color-panel.js"
import { t, tf } from "./i18n/index.js"

/** 预置色的名字走静态 `t`，让 i18n 的孤儿扫描看得见它们 */
const 预置色名 = (n: string): string =>
  ({ 绿: t("绿"), 蓝: t("蓝"), 紫: t("紫"), 橙: t("橙"), 粉: t("粉"), 灰: t("灰") })[n] ?? n

export function AppearanceColorControl({ kind, value: accent, onChange, onReset, selected = true }: {
  kind: "accent" | "background" | "chat" | "settings"
  value: string
  onChange: (hex: string) => void
  onReset?: (() => void) | undefined
  selected?: boolean
}) {
  const labels = {
    accent: { presets: t("强调色选择"), palette: t("色盘"), value: t("颜色值，可输入 HEX 或 RGB"), copy: t("复制颜色值"), reset: "" },
    background: { presets: t("背景色选择"), palette: t("背景色色盘"), value: t("背景颜色值，可输入 HEX 或 RGB"), copy: t("复制背景颜色值"), reset: t("重置背景") },
    chat: { presets: t("对话内容背景色选择"), palette: t("对话内容色盘"), value: t("对话内容颜色值，可输入 HEX 或 RGB"), copy: t("复制对话内容颜色值"), reset: t("重置对话内容") },
    settings: { presets: t("设置页背景色选择"), palette: t("设置页色盘"), value: t("设置页颜色值，可输入 HEX 或 RGB"), copy: t("复制设置页颜色值"), reset: t("重置设置页") },
  }[kind]
  const presetName = (name: string) => kind === "accent" ? 预置色名(name)
    : kind === "background" ? tf("背景色：{0}", 预置色名(name))
    : kind === "chat" ? tf("对话内容：{0}", 预置色名(name)) : tf("设置页：{0}", 预置色名(name))
  /**
   * 颜色值只有**一格**（2026-08-24 作者定的）：它既显示也能改——收 HEX 或 RGB，回车生效、Esc 放弃；
   * 悬停或聚焦时按 Shift 切换 HEX / RGB；右边一颗图标复制。悬上去立刻冒提示说清这三件事。
   */
  const [色格式, 设色格式] = useState<"hex" | "rgb">("hex")
  const [已复制, 设已复制] = useState(false)
  // 复制失败要出声（审查 debug J4：files.tsx 同动作会说，这里此前只 console.error——剪贴板被拒时人以为复制成了）
  const [复制出错, 设复制出错] = useState<string | undefined>(undefined)
  const 色值 = 色格式 === "hex" ? accent : hex转三元组(accent)
  const [色草稿, 设色草稿] = useState<string | undefined>(undefined)
  const 解色 = (v: string): string | undefined => (isHex(v.trim()) ? v.trim().toLowerCase() : 三元组转hex(v))
  const 色坏了 = 色草稿 !== undefined && 色草稿.trim() !== "" && 解色(色草稿) === undefined
  const 提交色 = () => {
    const v = 色草稿 ?? ""
    const hex = 解色(v)
    if (hex) onChange(hex)
    // 格式不对就留着红框，**不悄悄吞掉**；清空等于放弃
    if (hex || v.trim() === "") 设色草稿(undefined)
  }
  const [取色中, 设取色中] = useState(false)
  /** 自绘色盘开没开（2026-08-24）；键盘与关闭都在 ColorPanel 里自理 */
  const [色盘中, 设色盘中] = useState(false)
  const [悬着, 设悬着] = useState(false)
  const [聚焦着, 设聚焦着] = useState(false)
  useEffect(() => {
    if (!悬着 && !聚焦着) return
    const 听 = (e: KeyboardEvent) => {
      // **焦点在输入框里时,Shift 是打字不是切格式**(审查 debug J1):`#`(Shift+3)与
      // 每个大写 A–F 都会先发一次 Shift keydown,旧实现据此翻转格式并清空草稿 →
      // 「颜色值」框根本打不进 HEX。只在悬停色卡(未聚焦输入框)时才用 Shift 切 hex/rgb。
      if (e.key === "Shift" && !(document.activeElement instanceof HTMLInputElement)) {
        设色格式((f) => (f === "hex" ? "rgb" : "hex"))
        设色草稿(undefined)
      }
    }
    window.addEventListener("keydown", 听)
    return () => window.removeEventListener("keydown", 听)
  })
  const 复制色值 = () =>
    void navigator.clipboard.writeText(色值).then(() => {
      设复制出错(undefined)
      设已复制(true)
      setTimeout(() => 设已复制(false), 1200)
    }).catch((e: unknown) => {
      // 出声，不只 console：剪贴板被拒（焦点不在窗口）时，人以为粘出来的是这个色值
      设复制出错(tf("复制不了：{0}", e instanceof Error ? e.message : String(e)))
      setTimeout(() => 设复制出错(undefined), 2400)
    })

  return (<>
        <div className="accent-choices" data-color-setting={kind}>
          {/* 各项颜色共用相同的预设、色值与操作列。 */}
          <div className="accent-row" role="radiogroup" aria-label={labels.presets}>
          {ACCENT_PRESETS.map((o) => (
            <button
              key={o.hex}
              type="button"
              className={`accent-swatch${selected && accent === o.hex ? " current" : ""}`}
              style={{ background: o.hex }}
              role="radio"
              aria-checked={selected && accent === o.hex}
              aria-label={presetName(o.name)}
              title={预置色名(o.name)}
              onClick={() => { 设色草稿(undefined); onChange(o.hex) }}
            />
          ))}
          </div>
          {/* 自定义色盘、颜色值与复制。 */}
          <div className="accent-row">
          {/* 色盘（2026-08-24 作者拍板自绘）：C 复制 / Shift 切格式 / 点一下定色 / Esc，都长在面板里——系统面板是另一个窗口，这些键够不着它 */}
          <span className="accent-custom-wrap">
            <button
              type="button"
              className={`accent-swatch accent-custom${!selected || ACCENT_PRESETS.some((o) => o.hex === accent) ? "" : " current"}`}
              aria-label={labels.palette}
              onClick={() => 设色盘中((v) => !v)}
            />
            {色盘中 ? (
              <ColorPanel
                accent={accent}
                onPick={onChange}
                onClose={() => 设色盘中(false)}
                onEyedropper={() => {
                  设色盘中(false)
                  设取色中(true)
                }}
              />
            ) : null}
          </span>
          <span
            className="accent-value-wrap"
            onMouseEnter={() => 设悬着(true)}
            onMouseLeave={() => 设悬着(false)}
          >
            <input
              className="control accent-value"
              data-format={色格式}
              data-invalid={色坏了 ? "1" : undefined}
              value={色草稿 ?? 色值}
              spellCheck={false}
              aria-label={labels.value}
              aria-invalid={色坏了 || undefined}
              onChange={(e) => 设色草稿(e.target.value)}
              onFocus={() => 设聚焦着(true)}
              onBlur={() => {
                设聚焦着(false)
                提交色()
              }}
              onKeyDown={(e) => {
                // 输入法组词途中那一下按键属于输入法（2026-09-06，`src/ui/ime.ts`）
                if (在组词(e)) return
                if (e.key === "Enter") 提交色()
                if (e.key === "Escape") 设色草稿(undefined)
              }}
            />
            <Button variant="ghost" size="icon" className="accent-copy" aria-label={labels.copy} onClick={复制色值}>
              <复制图标 />
            </Button>
            {/* 悬上去就说清三件事；复制完换成「已复制」。role=status 让读屏也听到 */}
            <span className={`${kind === "accent" ? "accent-tip" : "background-tip"}${复制出错 ? " caveat" : ""}`} role="status" aria-live="polite">
              {复制出错 ?? (已复制 ? t("已复制") : 悬着 || 聚焦着 ? t("可输入 HEX 或 RGB，回车生效 · 点图标复制 · Shift 切换格式") : "")}
            </span>
          </span>
          </div>
          {onReset ? <span className="color-reset-wrap">
            <Button variant="ghost" size="icon" className="accent-copy" aria-label={labels.reset} disabled={!selected} onClick={() => { 设色草稿(undefined); onReset() }}><回退图标 /></Button>
            <span role="tooltip" className="color-reset-tip">{labels.reset}</span>
          </span> : null}
        </div>
    {取色中 ? <Eyedropper onPick={onChange} onClose={() => 设取色中(false)} /> : null}
  </>)
}
