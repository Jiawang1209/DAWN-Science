/**
 * 远端内核的心跳（猝死察觉，2026-09-04，规格定案 1/2）。
 *
 * **报警，不是结论。** ipykernel 的心跳线程忙时也答；IRkernel 单线程，长计算期间不答——
 * 所以「没回音」只触发一次 `沉默()` 确认（生产里是 SSH `kill -0`），结论由确认给：
 * 「死了」才停，「活着」「不知道」都继续。
 *
 * 这个文件不认识 zmq 以外的任何东西：状态机把 `ping` 注入进来，好用假时钟测；
 * `开心跳口` 是唯一碰 zmq 的地方，只会 `send` 一个序号、等回音。
 */

export interface 心跳选项 {
  /** 发一次 ping，回音算 true；超时 / 任何异常算 false */
  ping: () => Promise<boolean>
  /** 这台内核此刻在跑代码吗（决定间隔） */
  忙着: () => boolean
  /** 没回音之后的确认。「死了」= 停心跳；「活着」「不知道」= 继续 */
  沉默: () => Promise<"活着" | "死了" | "不知道">
  空闲间隔ms?: number
  忙时间隔ms?: number
  /** 两次确认之间至少隔这么久（R 忙时每分钟一次 SSH 探针已经够多了） */
  确认最小间隔ms?: number
  now?: () => number
}

export interface 心跳 {
  停(): void
  停了(): boolean
  /** 累计几次没回音（诊断用） */
  沉默过几次(): number
}

export function 起心跳(o: 心跳选项): 心跳 {
  const 空闲 = o.空闲间隔ms ?? 10_000
  const 忙 = o.忙时间隔ms ?? 60_000
  const 最小 = o.确认最小间隔ms ?? 60_000
  const now = o.now ?? Date.now
  let 停了 = false
  let 定时: ReturnType<typeof setTimeout> | undefined
  let 沉默次数 = 0
  let 上次确认: number | undefined
  let 上次ping = now()

  /**
   * 醒来的节奏固定是空闲间隔；「忙不忙」在醒来那一刻看，不在排定时看——
   * 内核是在两次心跳之间变忙的，排定时看到的还是上一刻的状态。
   */
  const 排下一次 = (等ms = 空闲) => {
    if (停了) return
    定时 = setTimeout(() => void 跳(), 等ms)
  }
  const 跳 = async () => {
    if (停了) return
    const 间隔 = o.忙着() ? 忙 : 空闲
    const 过了 = now() - 上次ping
    if (过了 < 间隔) {
      排下一次(Math.min(空闲, 间隔 - 过了))
      return
    }
    上次ping = now()
    let 有回音 = false
    try {
      有回音 = await o.ping()
    } catch {
      有回音 = false
    }
    if (停了) return
    if (有回音) {
      排下一次()
      return
    }
    沉默次数++
    const t = now()
    if (上次确认 === undefined || t - 上次确认 >= 最小) {
      上次确认 = t
      let 结论: "活着" | "死了" | "不知道" = "不知道"
      try {
        结论 = await o.沉默()
      } catch {
        结论 = "不知道"
      }
      if (停了) return
      if (结论 === "死了") {
        停()
        return
      }
    }
    排下一次()
  }
  const 停 = () => {
    停了 = true
    if (定时) clearTimeout(定时)
    定时 = undefined
  }
  排下一次()
  return { 停, 停了: () => 停了, 沉默过几次: () => 沉默次数 }
}

/**
 * 在一个本地端口（hb 隧道的本地这头）上开 zmq REQ 口。
 *
 * `relaxed` + `correlate`：REQ 默认「发一次必须等到回一次」，超时之后整只 socket 就废了；
 * 这两个选项让它超时后还能再发，并按序号丢掉迟到的旧回音。
 * `import("zeromq")` 是动态的，与 `channel.ts` 一样——不让主进程包为它买单。
 */
export async function 开心跳口(
  端口: number,
  超时ms = 5000,
): Promise<{ ping: () => Promise<boolean>; 关: () => void }> {
  const { Request } = await import("zeromq")
  const s = new Request({ receiveTimeout: 超时ms, sendTimeout: 1000, linger: 0, correlate: true, relaxed: true })
  s.connect(`tcp://127.0.0.1:${端口}`)
  let 序 = 0
  return {
    ping: async () => {
      try {
        await s.send(String(++序))
        await s.receive()
        return true
      } catch {
        return false
      }
    },
    关: () => {
      try {
        s.close()
      } catch {
        // 已经关了
      }
    },
  }
}
