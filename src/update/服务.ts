/**
 * 更新那六个操作背后的东西（规格 U8）。
 *
 * **backend 只认这个接口**：真的那份坐在 GitHub 与本机文件系统上，
 * 假的那份（`DAWN_UPDATE_FEED` / `DAWN_FAKE_UPDATE_INSTALL`）由 `dev:mock` 与 e2e 共用——
 * 准入规则 1 要的正是「两边同一份」。
 */
import type { 更新状态 } from "../protocol/entities.js"

/** 六个操作共用的信封：完整状态 + 那个开关（规格 U1） */
export interface 更新回执 {
  状态: 更新状态
  自动检查: boolean
}

export interface 更新服务 {
  /** 不联网，读缓存 */
  状态(): 更新回执
  /** @param force 人亲手点的：无视 24 小时节流 */
  检查(force: boolean): Promise<更新回执>
  设偏好(改: { auto?: boolean | undefined; ignore?: string | undefined }): 更新回执
  下载(): Promise<更新回执>
  取消(): 更新回执
  /** 换包并重启。**回不来**（进程会退出），但失败时要回得来 */
  装(): Promise<更新回执>
}

import { 更新管家 } from "./检查.js"
import type { 更新盘面 } from "./状态.js"

export interface 建更新服务选项 {
  管家: 更新管家
  读盘: () => 更新盘面
  /** 装它的那一半（下载 / 换包 / 重启）。**这一轮先只接检查那一半** */
  安装器?: never
}

/**
 * 把管家包成 backend 认的那个接口。
 *
 * **`自动检查` 每次都从盘上现读**：它是一个人随时会在「关于」里改的开关，
 * 记一份在内存里，界面上就会出现「明明关了却还在查」这种没法解释的画面。
 */
export function 建更新服务(o: 建更新服务选项): 更新服务 {
  const 信封 = (状态: 更新状态): 更新回执 => ({ 状态, 自动检查: o.读盘().auto })
  const 还没接上 = () => {
    // 说清楚是「这一步还没接」，不是「更新坏了」（规格 7.5）
    throw new Error("下载与安装还没接上（本分支 T5 / T6）")
  }
  return {
    状态: () => 信封(o.管家.当前状态()),
    检查: async (force) => 信封(await o.管家.检查({ 自动: !force })),
    设偏好: (改) => 信封(o.管家.设偏好(改)),
    下载: async () => 还没接上(),
    取消: () => 还没接上(),
    装: async () => 还没接上(),
  }
}
