/**
 * 设置 · 桌面通知（2026-09-27，spec `2026-09-27-桌面通知-design.md` §2.4）。
 *
 * 四个开关与微信 / 飞书那组同一个形状（`{ done, error, permission, quietWhenFocused }`）。
 * 多一颗「发一条试试」：macOS 可能静静拦下未签名应用的通知，而 Electron 查不到授权状态——只能亲眼看一条（spec §0 第 9 条）。
 *
 * 每个勾选框的无障碍名 = 那一行的名字（`aria-label`）：旁边那个「开 / 关」四行一模一样，按它找就找不准。
 */
import { useEffect, useState } from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { Section, Row } from "./Settings.js"

export interface 桌面通知回执 {
  done: boolean
  error: boolean
  permission: boolean
  quietWhenFocused: boolean
  lang?: "zh" | "en"
  supported: boolean
}
type 开关 = "done" | "error" | "permission" | "quietWhenFocused"

export function DesktopNotifyPanel({
  load,
  save,
  test,
}: {
  load: () => Promise<桌面通知回执>
  save: (patch: Partial<Record<开关, boolean>>) => Promise<桌面通知回执>
  test: () => Promise<{ shown: boolean; reason?: "unsupported" | "no_exit" }>
}) {
  const [回执, 设回执] = useState<桌面通知回执 | undefined>(undefined)
  const [出错, 设出错] = useState<string | undefined>(undefined)
  const [试过, 设试过] = useState<string | undefined>(undefined)
  useEffect(() => {
    let 还在 = true
    load()
      .then((r) => {
        if (还在) 设回执(r)
      })
      .catch((e: unknown) => {
        if (还在) 设出错(e instanceof Error ? e.message : String(e))
      })
    return () => {
      还在 = false
    }
  }, [load])

  if (!回执) return 出错 ? <p className="caveat">{出错}</p> : <p className="hint">{t("正在问状态…")}</p>
  const 行 = [
    ["done", t("一轮做完"), t("这一轮收尾时弹一条。")],
    ["error", t("出错时"), t("模型调用失败、会话异常退出。")],
    ["permission", t("等我点头"), t("「请求批准」档下弹出权限卡时。")],
    ["quietWhenFocused", t("正看着那段时不弹"), t("窗口在前台、那段就在眼前时不弹。")],
  ] as const
  const 没弹的缘故 = (r?: "unsupported" | "no_exit") =>
    r === "unsupported" ? t("这台系统不支持桌面通知") : t("这次运行没有桌面通知出口")
  return (
    <Section>
      {回执.supported ? null : <p className="caveat">{t("这台系统不支持桌面通知")}</p>}
      {出错 ? <p className="caveat">{出错}</p> : null}
      {行.map(([k, 名, 说]) => (
        <Row key={k} name={名} desc={说}>
          <label className="at-toggle">
            <input
              type="checkbox"
              aria-label={名}
              checked={回执[k]}
              onChange={(e) => {
                const v = e.target.checked
                const 旧 = 回执
                设回执({ ...回执, [k]: v })
                设出错(undefined)
                save({ [k]: v })
                  .then(设回执)
                  .catch((err: unknown) => {
                    设回执(旧) // 失败回滚，不然屏显开而后端关（与微信那组 审查 debug J8 同一个做法）
                    设出错(err instanceof Error ? err.message : String(err))
                  })
              }}
            />
            <span>{回执[k] ? t("开") : t("关")}</span>
          </label>
        </Row>
      ))}
      <Row name={t("试一下")} desc={t("macOS 可能拦下未签名应用的通知，按一下看它弹不弹。")}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            test()
              .then((r) => 设试过(r.shown ? t("已发出——没看到的话，去系统设置的「通知」里允许 DAWN Science。") : tf("没弹出来：{0}", 没弹的缘故(r.reason))))
              .catch((e: unknown) => 设试过(e instanceof Error ? e.message : String(e)))
          }}
        >
          {t("发一条试试")}
        </Button>
        {试过 ? (
          <p className="hint" role="status">
            {试过}
          </p>
        ) : null}
      </Row>
    </Section>
  )
}
