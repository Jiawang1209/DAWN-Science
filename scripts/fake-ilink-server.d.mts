/** 假微信的类型面（实现在同名 .mjs）。只给测试与 e2e 夹具用 */
export const FAKE_BOT_TOKEN: string
export const FAKE_BOT_ID: string
export const FAKE_USER_ID: string

export interface FakeIlinkServer {
  url: string
  port: number
  推进扫码: (步: "scan" | "need_code" | "confirm" | "expire") => Promise<Response>
  发来: (text: string, extra?: Record<string, unknown>) => Promise<Response>
  发出的: () => Promise<Array<Record<string, unknown>>>
  让失效: () => Promise<Response>
  close: () => Promise<void>
}

export function startFakeIlinkServer(opts?: { longPollMs?: number }): Promise<FakeIlinkServer>
