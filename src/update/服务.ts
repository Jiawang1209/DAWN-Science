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
import type { 更新资源 } from "../protocol/entities.js"
import type { 下载进度 } from "./下载.js"
import type { 装参数 } from "./换包.js"

/** 装它的那一半。**真的那份坐在文件系统上，e2e 里是一份假的**（规格 U6） */
export interface 安装器 {
  下载(资源: 更新资源, 进度: (p: 下载进度) => void, signal: AbortSignal): Promise<string>
  /**
   * 换包。**「这个 app 装在哪儿」由安装器自己知道**——
   * 服务层不该也不必知道它（真机演练那次就是服务层漏传了它）。
   */
  换包(p: 装参数): Promise<void>
  /** 换完重启。**回不来**（进程会退出） */
  重启(): void
}

export interface 建更新服务选项 {
  管家: 更新管家
  读盘: () => 更新盘面
  /** 不给就是这台机器上装不了（无头、没打包）：下载与安装如实拒 */
  安装器?: 安装器
  /** 状态变了就推给界面（下载进度靠它，不靠界面轮询） */
  推?: (回执: 更新回执) => void
  /**
   * 换包**之前**把凭证交给下一版（规格 U5）。
   *
   * **在这一刻做，不在别的时刻**：这是最后一个「旧二进制还活着、还解得开」的瞬间。
   * 失败不拦更新——退回今天的行为（新版提示重填），但那一侧会出声。
   */
  交接?: (到版本: string) => void
  /**
   * 出事了记一行（2026-09-06 真机演练逼出来的）。
   *
   * **只推给界面是不够的**：换包失败时侧栏那一行会消失（`failed` 不在侧栏出现），
   * 于是一次失败在屏幕上什么都不剩，人只看到「点了没反应」。
   * 主进程把它写进 `startup.log`——那是打包版里唯一找得到的地方。
   */
  记?: (话: string) => void
}

/**
 * 把管家包成 backend 认的那个接口。
 *
 * **`自动检查` 每次都从盘上现读**：它是一个人随时会在「关于」里改的开关，
 * 记一份在内存里，界面上就会出现「明明关了却还在查」这种没法解释的画面。
 *
 * **下载是异步的，这条响应不等它**：立刻回一个 `downloading`，
 * 之后的每一步都推。让操作等到下完再回，界面会白等两分钟且没有进度。
 */
export function 建更新服务(o: 建更新服务选项): 更新服务 {
  const 信封 = (状态: 更新状态): 更新回执 => ({ 状态, 自动检查: o.读盘().auto })
  const 推 = (状态: 更新状态) => o.推?.(信封(状态))
  /** 正在下的那一次的闸。**取消要真的中断连接**，不是只把界面改回去 */
  let 闸: AbortController | undefined
  /**
   * 正在换包。**第二次点必须挡住**：解一个 223 MB 的 zip 要十几秒，
   * 这期间按钮还在那儿。两次换包同时跑，第二次的「备份旧的」会把
   * **刚换上去的新版**挪成 `.old`——那时人手上什么都没有了。
   */
  let 装着 = false

  const 要安装器 = (): 安装器 => {
    if (!o.安装器) throw new Error("这台机器上装不了（没打包 / 无头模式）——请从发布页自己下")
    return o.安装器
  }

  return {
    状态: () => 信封(o.管家.当前状态()),
    检查: async (force) => 信封(await o.管家.检查({ 自动: !force })),
    设偏好: (改) => 信封(o.管家.设偏好(改)),

    下载: async () => {
      const 安装器 = 要安装器()
      const s = o.管家.当前状态()
      if (s.阶段 !== "available" && s.阶段 !== "ignored") {
        throw new Error(`现在不是「有新版」这个状态（是 ${s.阶段}），下不了`)
      }
      // 装不了的平台连下都不下：下下来也没有用，只是白占 200 MB
      if (!s.安装.能) throw new Error(s.安装.因为)
      const 资源 = s.安装.资源
      闸 = new AbortController()
      const 开 = o.管家.开始下载(资源.size)
      推(开)
      安装器
        .下载(资源, (p) => 推(o.管家.下载进度(p.已下, p.共)), 闸.signal)
        .then((路径) => 推(o.管家.下好了(路径)))
        .catch((e) => {
          const 话 = e instanceof Error ? e.message : String(e)
          if (!话.includes("取消")) o.记?.(`下载失败：${话}`)
          // 人自己按的取消：退回「有新版」，不是报一个错
          推(话.includes("取消") ? o.管家.取消了() : o.管家.出错(话, "下载"))
        })
      return 信封(开)
    },

    取消: () => {
      闸?.abort()
      闸 = undefined
      return 信封(o.管家.当前状态())
    },

    装: async () => {
      const 安装器 = 要安装器()
      if (装着) throw new Error("正在装了，等它装完（解包要十几秒）")
      const s = o.管家.当前状态()
      if (s.阶段 !== "ready") throw new Error(`还没下好（现在是 ${s.阶段}），装不了`)
      if (!s.安装.能) throw new Error(s.安装.因为)
      装着 = true
      // **最后一个还解得开的瞬间**：旧二进制此刻还活着（规格 U5）
      o.交接?.(s.版本.replace(/^v/, ""))
      try {
        await 安装器.换包({
          方式: s.安装.方式,
          包路径: s.包路径,
          期望版本: s.版本.replace(/^v/, ""),
          当前版本: s.当前,
        })
      } catch (e) {
        装着 = false
        // **换包失败不许静默**：人此刻手上还是旧版，他得知道为什么
        const 话 = e instanceof Error ? (e.stack ?? e.message) : String(e)
        o.记?.(`换包失败：${话}`)
        const 状态 = o.管家.出错(e instanceof Error ? e.message : String(e), "安装")
        推(状态)
        return 信封(状态)
      }
      // 到这儿应用就要没了。回执是给「重启失败」那种极端情况留的
      安装器.重启()
      return 信封(s)
    },
  }
}
