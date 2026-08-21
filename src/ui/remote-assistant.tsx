/**
 * 「远程助理」那一屏（2026-08-21，T2）。
 *
 * 作者：*「侧边栏叫远程助理，然后联系人叫做 DAWN-Science 吧。」*
 * 设计：`docs/superpowers/specs/2026-08-21-远程助理-design.md`「那一屏」一节。
 *
 * 状态是轮询拿的：这一屏开着时每秒问一次 `weixinGetStatus`（扫码中那几秒要逐态出声），
 * 绑定稳定后放慢到 5 秒。没有推送——绑定不属于任何会话，塞进 `SessionUpdate` 要造假 id。
 *
 * 二维码用 `qrcode` 出一张 SVG（MIT，只在渲染进程用，**不碰任何网络**）。
 */
import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import { Button, Field } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 年月日时分 } from "./format.js"
import type { ResponseOf } from "../protocol/index.js"

const CONTACT = "DAWN-Science"
export type WeixinStatus = ResponseOf<"weixinGetStatus">
export type NotifySettings = ResponseOf<"weixinGetNotify">

export function RemoteAssistantView({
  load,
  startLogin,
  submitCode,
  cancelLogin,
  unbind,
  sessions,
  bindSession,
  openSession,
  loadNotify,
  setNotify,
}: {
  load: () => Promise<WeixinStatus>
  startLogin: () => Promise<unknown>
  submitCode: (code: string) => Promise<unknown>
  cancelLogin: () => Promise<unknown>
  unbind: () => Promise<unknown>
  /** 可绑的会话（最近的几段），给「绑到哪段」那个下拉 */
  sessions: readonly { sessionId: string; title: string }[]
  bindSession: (sessionId: string) => Promise<unknown>
  openSession: (sessionId: string) => void
  loadNotify: () => Promise<NotifySettings>
  setNotify: (patch: Partial<NotifySettings>) => Promise<NotifySettings>
}) {
  const [通知, 设通知] = useState<NotifySettings | undefined>(undefined)
  useEffect(() => {
    loadNotify().then(设通知).catch(() => 设通知(undefined))
  }, [loadNotify])
  const [状态, 设状态] = useState<WeixinStatus | undefined>(undefined)
  const [出错, 设出错] = useState<string | undefined>(undefined)
  const [码, 设码] = useState("")

  // 轮询：扫码中 1 s，平时 5 s
  useEffect(() => {
    let 停 = false
    let 计时: ReturnType<typeof setTimeout> | undefined
    const 问 = async () => {
      try {
        const s = await load()
        if (停) return
        设状态(s)
        设出错(undefined)
        计时 = setTimeout(问, s.state === "logging_in" ? 1_000 : 5_000)
      } catch (e) {
        if (停) return
        设出错(e instanceof Error ? e.message : String(e))
        计时 = setTimeout(问, 5_000)
      }
    }
    void 问()
    return () => {
      停 = true
      if (计时) clearTimeout(计时)
    }
  }, [load])

  const 做 = (f: () => Promise<unknown>) => () => {
    设出错(undefined)
    f()
      .then(() => load().then(设状态))
      .catch((e: unknown) => 设出错(e instanceof Error ? e.message : String(e)))
  }

  return (
    <div className="skills-page ra-page">
      <header className="skills-head">
        <h1 className="panel-title">{t("远程助理")}</h1>
        <p>{t("人不在电脑前，也能跟 DAWN 说话。微信里那个联系人就是 DAWN 本人。")}</p>
        {/**
          * **名字是微信定的**：协议里没有改名接口（官方插件源码全篇没有 nickname 之类的字），
          * 所有接进去的都叫「微信ClawBot」。作者要叫 DAWN-Science——只能靠备注。说实话，不假装。
          */}
        <p className="hint">{tf("微信里它显示为「微信ClawBot」（这个名字微信不让改）；可以给它设个备注，比如「{0}」。", CONTACT)}</p>
      </header>

      {出错 ? <p className="caveat">{出错}</p> : null}

      <section className="ra-card" aria-labelledby="ra-weixin">
        <h2 id="ra-weixin" className="ra-card-title">
          {t("微信")}
          {状态 ? <span className={`ra-state ra-state-${状态.state}`}>{状态词(状态.state)}</span> : null}
        </h2>
        {!状态 ? (
          <p className="hint">{t("正在问状态…")}</p>
        ) : 状态.state === "logging_in" && 状态.login ? (
          <扫码中 login={状态.login} 码={码} 设码={设码} submit={做(() => submitCode(码))} cancel={做(cancelLogin)} />
        ) : 状态.state === "bound" || 状态.state === "stale" ? (
          <div className="ra-bound">
            {状态.state === "stale" ? (
              <p className="caveat">{状态.lastError ?? t("绑定失效了，重新扫码")}</p>
            ) : 状态.lastError ? (
              <p className="caveat">{状态.lastError}</p>
            ) : null}
            <dl className="ra-facts">
              <dt>{t("绑定的微信")}</dt>
              <dd className="mono">{状态.userId ?? "—"}</dd>
              {状态.boundAt ? (
                <>
                  <dt>{t("绑定时间")}</dt>
                  <dd>{年月日时分(状态.boundAt)}</dd>
                </>
              ) : null}
              <dt>{t("微信里的话落到")}</dt>
              <dd>
                {状态.sessionId ? (
                  <Button variant="text" size="inline" onClick={() => openSession(状态.sessionId!)}>
                    {sessions.find((s) => s.sessionId === 状态.sessionId)?.title ?? t("一段会话")}
                  </Button>
                ) : (
                  <span className="hint">{t("还没有——微信里说第一句话时会新建一段")}</span>
                )}
                {sessions.length > 0 ? (
                  <select
                    className="control ra-bind-select"
                    aria-label={t("绑到哪段会话")}
                    value=""
                    onChange={(e) => {
                      const id = e.target.value
                      if (id) 做(() => bindSession(id))()
                    }}
                  >
                    <option value="">{t("换一段…")}</option>
                    {sessions.map((s) => (
                      <option key={s.sessionId} value={s.sessionId}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                ) : null}
              </dd>
            </dl>
            <div className="ra-actions">
              {状态.state === "stale" ? (
                <Button variant="outline" size="sm" onClick={做(startLogin)}>
                  {t("重新扫码")}
                </Button>
              ) : null}
              <Button variant="text" size="sm" className="danger" onClick={做(unbind)}>
                {t("解绑微信")}
              </Button>
            </div>
            <p className="hint">
              {t("微信里发 /帮助 看能用的命令：/会话、/用 N、/新建 @服务器名、/停、/在哪。")}
            </p>
          </div>
        ) : (
          <div className="ra-unbound">
            <p>{t("用微信扫一扫，通讯录里会多一个联系人。")}</p>
            <Button variant="outline" size="sm" onClick={做(startLogin)}>
              {t("扫码绑定")}
            </Button>
            {状态.lastError ? <p className="caveat">{状态.lastError}</p> : null}
          </div>
        )}
      </section>

      <section className="ra-card" aria-labelledby="ra-notify">
        <h2 id="ra-notify" className="ra-card-title">{t("通知")}</h2>
        <p className="hint">{t("这几件事发生时，推一条到微信（不只绑着的那段，所有会话都算）。")}</p>
        {通知 ? (
          <ul className="ra-toggles">
            {(
              [
                ["done", t("任务跑完（超过 60 秒的）")],
                ["error", t("出错")],
                ["permission", t("等我点头——回「同意」或「拒绝」即可放行（只对 ACP 会话）")],
                ["quietWhenFocused", t("我正在电脑前（窗口在前台）时不推；等权限的照推")],
              ] as const
            ).map(([k, 文]) => (
              <li key={k}>
                <label className="ra-toggle">
                  <input
                    type="checkbox"
                    checked={通知[k]}
                    onChange={(e) => {
                      const v = e.target.checked
                      设通知({ ...通知, [k]: v })
                      setNotify({ [k]: v }).then(设通知).catch((err: unknown) => 设出错(err instanceof Error ? err.message : String(err)))
                    }}
                  />
                  <span>{文}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">{t("正在问状态…")}</p>
        )}
      </section>

      <section className="ra-card">
        <h2 className="ra-card-title">{t("飞书")}</h2>
        <p className="hint">{t("还没接。微信这条跑顺了再做。")}</p>
      </section>
    </div>
  )
}

function 状态词(s: WeixinStatus["state"]): string {
  switch (s) {
    case "bound":
      return t("已绑定")
    case "logging_in":
      return t("扫码中")
    case "stale":
      return t("绑定失效")
    default:
      return t("未绑定")
  }
}

function 扫码中({
  login,
  码,
  设码,
  submit,
  cancel,
}: {
  login: NonNullable<WeixinStatus["login"]>
  码: string
  设码: (v: string) => void
  submit: () => void
  cancel: () => void
}) {
  const [svg, 设svg] = useState<string | undefined>(undefined)
  useEffect(() => {
    let 停 = false
    QRCode.toString(login.qrUrl, { type: "svg", margin: 1, width: 200 })
      .then((s) => {
        if (!停) 设svg(s)
      })
      .catch(() => 设svg(undefined))
    return () => {
      停 = true
    }
  }, [login.qrUrl])
  const 要码 = login.step === "need_verifycode" || login.step === "verify_code_wrong"
  const 结束了 = login.step === "confirmed" || login.step === "failed"
  return (
    <div className="ra-login">
      {/* 二维码是 SVG 字符串：`qrcode` 生成、无外链、无脚本 */}
      {svg && !结束了 ? (
        <div className="ra-qr" role="img" aria-label={t("微信绑定二维码")} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : null}
      <div className="ra-login-text">
        {/* **逐态出声**：一个转圈什么都不说的二维码，和一个坏掉的二维码分不开 */}
        <p className={`ra-step ra-step-${login.step}`} aria-live="polite">
          {login.message}
        </p>
        {!结束了 && !svg ? (
          <p className="hint">
            {t("二维码画不出来，打开这个链接也行：")} <span className="mono">{login.qrUrl}</span>
          </p>
        ) : null}
        {要码 ? (
          <form
            className="ra-code"
            onSubmit={(e) => {
              e.preventDefault()
              if (码.trim()) submit()
            }}
          >
            <Field id="ra-code" label={t("手机上显示的配对码")}>
              <input id="ra-code" className="control" value={码} onChange={(e) => 设码(e.target.value)} inputMode="numeric" autoFocus />
            </Field>
            <Button type="submit" variant="outline" size="sm" disabled={!码.trim()}>
              {t("提交配对码")}
            </Button>
          </form>
        ) : null}
        {!结束了 ? (
          <Button variant="text" size="sm" onClick={cancel}>
            {t("不扫了")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** 给侧栏与别处的同一个记忆：这一屏的名字 */
export const REMOTE_ASSISTANT_TITLE = () => t("远程助理")

export function useSessionChoices(tasks: readonly { sessionId?: string | undefined; title?: string | undefined; createdAt: string }[]) {
  return useMemo(
    () =>
      [...tasks]
        .filter((x): x is typeof x & { sessionId: string } => Boolean(x.sessionId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 20)
        .map((x) => ({ sessionId: x.sessionId, title: x.title ?? t("新会话") })),
    [tasks],
  )
}
