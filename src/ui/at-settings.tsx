/**
 * 设置里的「文件引用」一格（2026-08-23，学自 dsh-at-file 的第二档）：
 * - 粘贴进来的 `@` 算不算；
 * - 文件名过滤规则：**全局一套 + 当前工作区一套**，每条「精确文件名 / 正则 + 区分大小写」；
 *   工作区那一栏同时把继承来的全局规则摆出来（灰的），人一眼看到「此刻到底滤了什么」。
 * **无效正则在存之前就说**（`规则的毛病`），服务端也再验一次。
 */
import { useState } from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 删除图标 } from "./icons.js"
import { Section, Row } from "./Settings.js"
import { 规则的毛病, type 文件规则 } from "../files/mentions.js"

export interface 艾特设置 {
  ignorePasted: boolean
  globalRules: 文件规则[]
  workspaceRules?: 文件规则[] | undefined
}

function 规则行({ r, onRemove, 继承 }: { r: 文件规则; onRemove?: (() => void) | undefined; 继承?: boolean }) {
  return (
    <li className={`at-rule${继承 ? " inherited" : ""}`}>
      <span className="tag">{r.kind === "exact" ? t("精确") : t("正则")}</span>
      <code className="at-rule-pattern">{r.pattern}</code>
      {r.caseSensitive ? <span className="hint">{t("区分大小写")}</span> : null}
      {继承 ? <span className="hint">{t("（全局）")}</span> : null}
      {onRemove ? (
        <Button variant="ghost" size="icon" aria-label={tf("删掉规则 {0}", r.pattern)} onClick={onRemove}>
          <删除图标 />
        </Button>
      ) : null}
    </li>
  )
}

/** 加一条的小表单。存之前验；坏了就在旁边说 */
function 加规则({ onAdd, 标签 }: { onAdd: (r: 文件规则) => void; 标签: string }) {
  const [kind, 设kind] = useState<"exact" | "regex">("exact")
  const [pattern, 设pattern] = useState("")
  const [cs, 设cs] = useState(false)
  const 病 = pattern ? 规则的毛病({ kind, pattern, caseSensitive: cs }) : undefined
  return (
    <form
      className="at-rule-add"
      aria-label={标签}
      onSubmit={(e) => {
        e.preventDefault()
        if (!pattern || 病) return
        onAdd({ kind, pattern, caseSensitive: cs })
        设pattern("")
      }}
    >
      <select className="control" value={kind} onChange={(e) => 设kind(e.target.value as "exact" | "regex")} aria-label={t("匹配方式")}>
        <option value="exact">{t("精确")}</option>
        <option value="regex">{t("正则")}</option>
      </select>
      <input className="control" value={pattern} onChange={(e) => 设pattern(e.target.value)} placeholder={kind === "exact" ? t("文件名，如 .DS_Store") : t("正则，如 \\.tmp$")} aria-label={t("规则")} />
      <label className="at-rule-cs">
        <input type="checkbox" checked={cs} onChange={(e) => 设cs(e.target.checked)} />
        <span>{t("区分大小写")}</span>
      </label>
      <Button type="submit" variant="secondary" size="sm" disabled={!pattern || Boolean(病)}>
        {标签}
      </Button>
      {病 ? <span className="caveat">{病}</span> : null}
    </form>
  )
}

export function AtFilePanel({
  设置,
  workspace,
  onChange,
}: {
  设置: 艾特设置
  /** 当前项目的工作区；没有就不画那一栏 */
  workspace?: string | undefined
  onChange: (patch: { ignorePasted?: boolean; globalRules?: 文件规则[]; workspaceRules?: 文件规则[] }) => void
}) {
  return (
    <Section>
      <Row name={t("粘贴进来的 @ 不算引用")} desc={t("从别处复制来的一段话里有 @alice、甚至有真实存在的 @路径，都不开菜单、不发给模型。关掉则一视同仁。")}>
        <label className="at-toggle">
          <input type="checkbox" checked={设置.ignorePasted} onChange={(e) => onChange({ ignorePasted: e.target.checked })} />
          <span>{设置.ignorePasted ? t("开") : t("关")}</span>
        </label>
      </Row>

      <Row name={t("全局过滤规则")} desc={t("@ 菜单里不列这些文件名。只看文件名，不看父目录。所有工作区共用。")}>
        <div className="at-rules-block">
          <ul className="at-rules" aria-label={t("全局过滤规则")}>
            {设置.globalRules.map((r, i) => (
              <规则行 key={`${r.kind}:${r.pattern}:${i}`} r={r} onRemove={() => onChange({ globalRules: 设置.globalRules.filter((_, j) => j !== i) })} />
            ))}
            {设置.globalRules.length === 0 ? <li className="hint">{t("还没有规则——内置的忽略目录（.git、node_modules 这类）不在这里，它们一直生效")}</li> : null}
          </ul>
          <加规则 标签={t("加一条全局规则")} onAdd={(r) => onChange({ globalRules: [...设置.globalRules, r] })} />
          {设置.globalRules.length > 0 ? (
            <Button variant="text" size="sm" onClick={() => onChange({ globalRules: [] })}>
              {t("清空全局规则")}
            </Button>
          ) : null}
        </div>
      </Row>

      {workspace && 设置.workspaceRules ? (
        <Row name={t("这个工作区的规则")} desc={<code>{workspace}</code>}>
          <div className="at-rules-block">
            <ul className="at-rules" aria-label={t("这个工作区的规则")}>
              {设置.globalRules.map((r, i) => (
                <规则行 key={`g:${i}`} r={r} 继承 />
              ))}
              {设置.workspaceRules.map((r, i) => (
                <规则行 key={`${r.kind}:${r.pattern}:${i}`} r={r} onRemove={() => onChange({ workspaceRules: 设置.workspaceRules!.filter((_, j) => j !== i) })} />
              ))}
              {设置.workspaceRules.length === 0 && 设置.globalRules.length === 0 ? <li className="hint">{t("还没有规则")}</li> : null}
            </ul>
            <加规则 标签={t("加一条工作区规则")} onAdd={(r) => onChange({ workspaceRules: [...(设置.workspaceRules ?? []), r] })} />
            {设置.workspaceRules.length > 0 ? (
              <Button variant="text" size="sm" onClick={() => onChange({ workspaceRules: [] })}>
                {t("清空工作区规则")}
              </Button>
            ) : null}
          </div>
        </Row>
      ) : (
        <p className="hint">{t("选中一个项目之后，这里还能给那个工作区单独加规则。")}</p>
      )}
    </Section>
  )
}
