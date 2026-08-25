/**
 * 飞书 SDK 的注入面(2026-08-25,规格 `2026-08-25-飞书通道-design.md` §四;
 * 学自 dsh-feishu / dsh-im,解读 `ccb_hive_code_learn/dsh-feishu-im-解读.md`)。
 *
 * real = `@larksuiteoapi/node-sdk`(**锁 1.73.0**,动态 import——建会话链路不背它的加载成本)。
 * fake = HTTP 到 `scripts/fake-feishu-server.mjs`(`DAWN_FAKE_FEISHU`,与 `DAWN_FAKE_ILINK` 同惯例)。
 *
 * 依赖决策(规格 §拍板):设备流建应用与 WS 长连接只有官方 SDK 有,自实现不值;
 * 微信的 ilink 只有五个 HTTP 接口且官方实现绑在 OpenClaw 宿主上,才选了自写——
 * 两边不同,判断逻辑同一条:看协议面大小与依赖干净度。
 *
 * 已知风险(dsh-im 踩过、给 SDK 打过运行时补丁,我们先不预防性打):WSClient 重连
 * 竞态——重连后旧连接回来覆盖新连接,症状是消息重复或丢失。真撞到再处理。
 *
 * **SDK 错误文本不透传给上层**(dsh-feishu 的洁癖):它可能含 secret 片段,
 * 这里一律换成人话 + 错误类别。
 */
import type { Client, EventDispatcher, WSClient } from "@larksuiteoapi/node-sdk"

export interface Feishu凭据 {
  appId: string
  appSecret: string
  /** 国内 feishu / 国际 lark(设备流回执的 tenant_brand 定的) */
  domain: "feishu" | "lark"
}

export interface 设备流回执 {
  appId: string
  appSecret: string
  /** 扫码那个人——唯一被授权的说话人 */
  openId: string
  domain: "feishu" | "lark"
}

export interface 入站消息 {
  messageId: string
  openId: string
  text: string
  chatType: string
  messageType: string
}

export interface FeishuSdk {
  /**
   * 设备流建应用:onQr 给二维码 URL(界面自己画);resolve 即 confirmed。
   * reject 的 message 是给人看的话,不含 SDK 原始错误文本。
   */
  注册应用(
    声明: { name: string; desc: string },
    onQr: (url: string) => void,
    signal: AbortSignal,
  ): Promise<设备流回执>
  /** WS 长连接收 `im.message.receive_v1`;onState 报连接健康位。返回停止函数 */
  连接(
    凭: Feishu凭据,
    onMessage: (m: 入站消息) => void,
    onState: (s: "ready" | "reconnecting" | "closed") => void,
  ): { stop(): void }
  发文本(凭: Feishu凭据, openId: string, text: string): Promise<void>
  /** 打/撤 Reaction(处理中 OnIt → DONE/ERROR)。**失败要抛**,由调用方决定吞不吞(它是礼貌不是功能) */
  表情(凭: Feishu凭据, messageId: string, emoji: string, 动作: "create" | "delete"): Promise<void>
}

/**
 * v1 权限声明:**写死在这一处 = 权限即文档**(dsh-im 的纪律)。
 * CardKit 相关(cardkit:card:write / im:message:recall)第二批随流式卡片一起加。
 */
export const FEISHU_SCOPES = [
  "im:message.p2p_msg:readonly",
  "im:message:send_as_bot",
  "im:message.reactions:write_only",
] as const
export const FEISHU_EVENTS = ["im.message.receive_v1"] as const

/* ── real:官方 SDK ── */

type Lark = typeof import("@larksuiteoapi/node-sdk")

export function realFeishuSdk(): FeishuSdk {
  let sdk: Promise<Lark> | undefined
  const 载 = () => (sdk ??= import("@larksuiteoapi/node-sdk"))
  const 建客户端 = async (凭: Feishu凭据): Promise<Client> => {
    const lark = await 载()
    return new lark.Client({
      appId: 凭.appId,
      appSecret: 凭.appSecret,
      domain: 凭.domain === "lark" ? lark.Domain.Lark : lark.Domain.Feishu,
    })
  }
  /** create 出的 reaction_id,撤回时要用(按 messageId:emoji 记) */
  const reactionIds = new Map<string, string>()

  return {
    async 注册应用(声明, onQr, signal) {
      const lark = await 载()
      try {
        const r = await lark.registerApp({
          source: "dawn-science",
          createOnly: true,
          signal,
          onQRCodeReady: (info) => onQr(info.url),
          appPreset: { name: 声明.name, desc: 声明.desc },
          addons: {
            preset: false,
            scopes: { tenant: [...FEISHU_SCOPES] },
            events: { items: { tenant: [...FEISHU_EVENTS] } },
          },
        })
        const openId = r.user_info?.open_id
        if (!openId) throw new Error("扫码成功但没拿到扫码人的 open_id——没有授权人,这次绑定不算数")
        return {
          appId: r.client_id,
          appSecret: r.client_secret,
          openId,
          domain: r.user_info?.tenant_brand === "lark" ? "lark" : "feishu",
        }
      } catch (e) {
        // SDK 错误文本不透传(可能含敏感串);类别 + 人话
        const 名 = e instanceof Error ? e.name : ""
        if (signal.aborted) throw new Error("已取消")
        if (/expired/i.test(名) || /expired/i.test(String((e as Error)?.message ?? ""))) {
          throw new Error("二维码过期了,再点一次「添加飞书机器人」")
        }
        if (e instanceof Error && e.message.includes("open_id")) throw e
        throw new Error("飞书那边没走完(拒绝授权或网络问题),再试一次")
      }
    },

    连接(凭, onMessage, onState) {
      let stopped = false
      let ws: WSClient | undefined
      void (async () => {
        const lark = await 载()
        if (stopped) return
        const dispatcher: EventDispatcher = new lark.EventDispatcher({}).register({
          "im.message.receive_v1": (data) => {
            const m = data.message
            let text = ""
            try {
              text = String((JSON.parse(m.content) as { text?: string }).text ?? "")
            } catch {
              /* 非 text 类型的 content 不是 JSON 文本——按空处理,类型过滤在通道层 */
            }
            onMessage({
              messageId: m.message_id,
              openId: data.sender?.sender_id?.open_id ?? "",
              text,
              chatType: m.chat_type,
              messageType: m.message_type,
            })
          },
        })
        ws = new lark.WSClient({
          appId: 凭.appId,
          appSecret: 凭.appSecret,
          domain: 凭.domain === "lark" ? lark.Domain.Lark : lark.Domain.Feishu,
          onReady: () => onState("ready"),
          onReconnecting: () => onState("reconnecting"),
          onReconnected: () => onState("ready"),
          onError: () => onState("closed"),
        })
        await ws.start({ eventDispatcher: dispatcher })
      })().catch(() => onState("closed"))
      return {
        stop() {
          stopped = true
          try {
            ;(ws as unknown as { stop?: (p?: { force?: boolean }) => void })?.stop?.({ force: true })
          } catch {
            /* 停就是停,不为收尾报错 */
          }
        },
      }
    },

    async 发文本(凭, openId, text) {
      const client = await 建客户端(凭)
      await client.im.v1.message.create({
        params: { receive_id_type: "open_id" },
        data: { receive_id: openId, msg_type: "text", content: JSON.stringify({ text }) },
      })
    },

    async 表情(凭, messageId, emoji, 动作) {
      const client = await 建客户端(凭)
      const 键 = `${messageId}:${emoji}`
      if (动作 === "create") {
        const r = await client.im.v1.messageReaction.create({
          path: { message_id: messageId },
          data: { reaction_type: { emoji_type: emoji } },
        })
        const id = (r as { data?: { reaction_id?: string } }).data?.reaction_id
        if (id) reactionIds.set(键, id)
      } else {
        const id = reactionIds.get(键)
        if (!id) return // 没记过就没法撤——静默跳过(撤不掉一个不存在的表情不算错)
        reactionIds.delete(键)
        await client.im.v1.messageReaction.delete({ path: { message_id: messageId, reaction_id: id } })
      }
    },
  }
}

/* ── fake:HTTP 到假服务器(dev:mock 与 e2e 共用同一份) ── */

export function fakeFeishuSdk(baseUrl: string): FeishuSdk {
  const 根 = baseUrl.replace(/\/$/, "")
  const post = async (p: string, body?: unknown) => {
    const r = await fetch(`${根}${p}`, {
      method: "POST",
      ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
    })
    if (!r.ok) throw new Error(`假飞书 ${p} 回了 ${r.status}`)
    return (await r.json()) as Record<string, unknown>
  }
  return {
    async 注册应用(_声明, onQr, signal) {
      const { qrUrl } = (await post("/register/start")) as { qrUrl: string }
      onQr(qrUrl)
      for (;;) {
        if (signal.aborted) throw new Error("已取消")
        const st = (await (await fetch(`${根}/register/status`)).json()) as {
          status: string
          appId?: string
          appSecret?: string
          openId?: string
          domain?: string
        }
        if (st.status === "confirmed") {
          return {
            appId: st.appId!,
            appSecret: st.appSecret!,
            openId: st.openId!,
            domain: st.domain === "lark" ? "lark" : "feishu",
          }
        }
        if (st.status === "expired") throw new Error("二维码过期了,再点一次「添加飞书机器人」")
      }
    },
    连接(_凭, onMessage, onState) {
      const 中止 = new AbortController()
      void (async () => {
        onState("ready")
        let cursor = "0"
        while (!中止.signal.aborted) {
          try {
            const r = await fetch(`${根}/inbox?cursor=${cursor}`, { signal: 中止.signal })
            const d = (await r.json()) as { cursor: string; msgs: 入站消息[] }
            cursor = d.cursor
            for (const m of d.msgs) onMessage(m)
          } catch {
            if (中止.signal.aborted) return
            onState("reconnecting")
            await new Promise((成) => setTimeout(成, 200))
          }
        }
      })()
      return {
        stop() {
          中止.abort()
        },
      }
    },
    async 发文本(_凭, openId, text) {
      await post("/send", { openId, text })
    },
    async 表情(_凭, messageId, emoji, 动作) {
      await post("/reaction", { messageId, emoji, action: 动作 })
    },
  }
}
