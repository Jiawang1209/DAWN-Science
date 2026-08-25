/** 假飞书的类型面（实现在同名 .mjs）。只给测试与 e2e 夹具用 */
export const FAKE_APP_ID: string
export const FAKE_APP_SECRET: string
export const FAKE_OPEN_ID: string

export interface FakeFeishuServer {
  url: string
  确认扫码: () => Promise<Response>
  码过期: () => Promise<Response>
  发来: (text: string, extra?: Record<string, unknown>) => Promise<Response>
  发出的: () => Promise<Array<Record<string, unknown>>>
  reset: () => Promise<Response>
  close: () => Promise<void>
}

export function startFakeFeishuServer(opts?: { longPollMs?: number }): Promise<FakeFeishuServer>
