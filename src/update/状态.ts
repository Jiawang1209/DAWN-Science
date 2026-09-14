/**
 * 更新状态的类型**来自协议**（`src/protocol/entities.ts` 的 `更新状态Schema`），
 * 这里只放「落在盘上的那一份」。
 *
 * 不在这里再定义一遍：界面读的是协议里那个形状，后端算的是这里这个形状，
 * **两份手抄的东西漂开时编译器一个字都不会说**——它比对的是两份各自自洽的类型。
 */
export type { 更新状态, 可装性, 更新资源, 换包方式 } from "../protocol/entities.js"

/** 落在 `userData/update.json` 的东西。**机器写的状态，不进 `providers.yaml`**（那份是给人手写的） */
export interface 更新盘面 {
  /** 启动时自动检查 */
  auto: boolean
  /** 上一次**成功**查完的时刻。失败不前移它 */
  lastCheckedAt?: number
  /** 「这一版不再提醒」记下的版本号 */
  ignored?: string
  /** 已经下好、等着装的那个包 */
  ready?: { 版本: string; 包路径: string }
}

export const 盘面默认值: 更新盘面 = { auto: true }
