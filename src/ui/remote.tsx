/** 服务器连接表单；连接目录与会话列表由 ServerSidebar 统一呈现。 */
import { useCallback, useState } from "react"
import { Button, Field } from "./primitives.js"
import { InterpreterPicker } from "./interpreter-picker.js"
import type { 探测结果 } from "./setup-wizard.js"
import { t } from "./i18n/index.js"

export interface ConnectionDraft {
  id?: string | undefined
  label: string
  group?: string | undefined
  host: string
  port?: number | undefined
  username: string
  privateKeyPath?: string | undefined
  secret?: string | undefined
}

/**
 * 添加 / 编辑一台服务器。
 *
 * ## 口令那个框**永远是空的**
 *
 * 它不回显——回显一次，它就落进了截图、日志和录屏（与模型 key 同一条纪律）。
 * 但空框有个坏处：人会以为「我没配」。所以配过的时候，
 * 占位符要明说**「已配置 · 留空则不改」**——
 * 否则「改一次分组顺手把口令清了」这条路就通了。
 */
export function ConnectionDialog({
  draft,
  onCancel,
  onSave,
  onRemove,
  saving,
  connectAfterSave = false,
  problem,
  interpreters,
  onProbeInterpreters,
  onPickInterpreter,
}: {
  draft: ConnectionDraft & { hasSecret?: boolean }
  onCancel: () => void
  onSave: (d: ConnectionDraft) => void
  /** 删掉这一台。**新建时不给**——没有的东西不该有删除键 */
  onRemove?: (() => void) | undefined
  saving?: boolean | undefined
  connectAfterSave?: boolean | undefined
  problem?: string | undefined
  /** 这台服务器上配好的解释器（远程内核）。只在编辑已有的那台时给 */
  interpreters?: { python?: string | undefined; r?: string | undefined } | undefined
  onProbeInterpreters?: (() => Promise<探测结果>) | undefined
  onPickInterpreter?: ((language: "python" | "R", path: string) => void) | undefined
}) {
  const [d, setD] = useState<ConnectionDraft>(draft)
  const 改 = (k: keyof ConnectionDraft, v: string) =>
    setD((x) => ({ ...x, [k]: v === "" ? undefined : v }))

  const [auth, setAuth] = useState<"password" | "key">(draft.privateKeyPath ? "key" : "password")
  const portValid = d.port === undefined || (Number.isInteger(d.port) && d.port >= 1 && d.port <= 65535)
  const 能存 = Boolean(d.host?.trim() && d.username?.trim() && portValid && (auth === "password" || d.privateKeyPath?.trim()))
  const changeAuth = (next: "password" | "key") => {
    if (auth === next) return
    setAuth(next)
    setD(prev => ({ ...prev, privateKeyPath: undefined, secret: "" }))
  }

  /**
   * 解释器探测（远程内核，2026-09-03）。**这里不自动探**：对话框是编辑连接信息的地方，
   * 一打开就去连一台服务器不是人要的；点了才探。（笔记本格那边相反——那里人已经想跑代码了。）
   */
  const [探到, 设探到] = useState<探测结果 | undefined>(undefined)
  const [探测中, 设探测中] = useState(false)
  const [探测错, 设探测错] = useState<string | undefined>(undefined)
  const 探 = useCallback(() => {
    if (!onProbeInterpreters) return
    设探测中(true)
    设探测错(undefined)
    onProbeInterpreters()
      .then(设探到)
      .catch((e: unknown) => 设探测错(e instanceof Error ? e.message : String(e)))
      .finally(() => 设探测中(false))
  }, [onProbeInterpreters])

  return (
    <div
      className="confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={connectAfterSave ? t("添加服务器") : draft.id ? t("编辑服务器") : t("添加服务器")}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !saving) onCancel()
      }}
    >
      <div className="confirm conn-dialog">
        <h2 className="confirm-title">{connectAfterSave ? t("添加服务器") : draft.id ? t("编辑服务器") : t("添加服务器")}</h2>

        {problem ? (
          <p className="remote-problem" role="alert">
            {problem}
          </p>
        ) : null}

        <fieldset className="conn-fields" disabled={saving}>
        <Field id="conn-label" label={t("名字")} hint={t("留空就用 用户名@主机")}>
          <input
            id="conn-label"
            className="control"
            value={d.label}
            onChange={(e) => setD((x) => ({ ...x, label: e.target.value }))}
          />
        </Field>
        <div className="conn-address">
        <Field id="conn-host" label={t("主机")} >
          <input
            id="conn-host"
            className="control"
            autoFocus
            value={d.host}
            onChange={(e) => setD((x) => ({ ...x, host: e.target.value }))}
            placeholder="gs191.example.com"
          />
        </Field>
        <Field id="conn-port" label={t("端口")} hint={t("留空就是 22")}>
          <input
            id="conn-port"
            className="control"
            inputMode="numeric"
            value={d.port === undefined ? "" : String(d.port)}
            onChange={(e) =>
              setD((x) => ({
                ...x,
                port: e.target.value.trim() === "" ? undefined : Number(e.target.value),
              }))
            }
          />
        </Field>
        </div>
        <Field id="conn-user" label={t("用户名")}>
          <input
            id="conn-user"
            className="control"
            value={d.username}
            onChange={(e) => setD((x) => ({ ...x, username: e.target.value }))}
          />
        </Field>
        {!portValid ? <p className="remote-problem" role="alert">{t("端口须为 1–65535 的整数")}</p> : null}
        <div className="conn-auth" role="group" aria-label={t("认证方式")}>
          <Button variant={auth === "password" ? "secondary" : "ghost"} size="sm" aria-pressed={auth === "password"} disabled={saving} onClick={() => changeAuth("password")}>{t("密码")}</Button>
          <Button variant={auth === "key" ? "secondary" : "ghost"} size="sm" aria-pressed={auth === "key"} disabled={saving} onClick={() => changeAuth("key")}>{t("SSH 私钥")}</Button>
        </div>
        {auth === "key" ? <>
        <Field
          id="conn-key"
          label={t("私钥路径")}

        >
          <input
            id="conn-key"
            className="control"
            value={d.privateKeyPath ?? ""}
            onChange={(e) => 改("privateKeyPath", e.target.value)}
            placeholder="~/.ssh/id_ed25519"
          />
        </Field>
        </> : null}
        <Field
          id="conn-secret"
          label={d.privateKeyPath ? t("私钥口令") : t("登录口令")}
          hint={
            draft.hasSecret
              ? t("已配置。留空则不改 —— 这个框永远不回显已存的口令")
              : t("存进系统钥匙串，不写进数据库")
          }
        >
          <input
            id="conn-secret"
            className="control"
            type="password"
            value={d.secret ?? ""}
            onChange={(e) => setD((x) => ({ ...x, secret: e.target.value }))}
            placeholder={draft.hasSecret ? t("已配置 · 留空则不改") : ""}
          />
        </Field>
        <details className="conn-advanced">
          <summary>{t("高级设置")}</summary>
          <p className="hint">{t("域名或 IP。不读 ~/.ssh/config —— 这里写什么就连什么")}</p>
        <Field id="conn-group" label={t("分组")} hint={t("比如「实验室」。留空就不分组")}>
          <input id="conn-group" className="control" value={d.group ?? ""} onChange={(e) => 改("group", e.target.value)} />
        </Field>
        {/**
          * 这台服务器上的解释器（远程内核，2026-09-03）。**只在编辑已有的那台时才有**——
          * 还没存下来的连接没有 id，探不了也存不了。
          */}
        {draft.id && onProbeInterpreters ? (
          <div className="conn-interpreters">
            <p className="hint">{t("这台服务器上的解释器（远程内核用；没配就在第一次跑代码时探测，唯一则自动记下）")}</p>
            <InterpreterPicker
              language="python"
              where={d.label || d.host}
              candidates={探到?.python}
              probing={探测中}
              error={探测错}
              current={interpreters?.python}
              onPick={(p) => onPickInterpreter?.("python", p)}
              onProbe={探}
            />
            <InterpreterPicker
              language="R"
              where={d.label || d.host}
              candidates={探到?.r}
              probing={探测中}
              /* 一次探测同时填两栏——失败也就同时是两栏的失败，只在 Python 底下说等于对 R 撒谎 */
              error={探测错}
              current={interpreters?.r}
              onPick={(p) => onPickInterpreter?.("R", p)}
              onProbe={探}
            />
          </div>
        ) : null}

        </details>
        </fieldset>
        <div className="confirm-actions">
          {onRemove ? (
            <Button variant="danger" size="sm" className="conn-remove" onClick={onRemove}>
              {t("删除")}
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
            {t("取消")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!能存 || saving === true}
            onClick={() =>
              onSave({
                ...d,
                ...(draft.id ? { id: draft.id } : {}),
                // 名字留空就用 `用户名@主机`——**不留一个空标签**，那在列表里是一行空白
                label: d.label.trim() || `${d.username}@${d.host}`,
              })
            }
          >
            {saving ? t("正在处理…") : connectAfterSave ? t("保存并连接") : t("保存")}
          </Button>
        </div>
      </div>
    </div>
  )
}
