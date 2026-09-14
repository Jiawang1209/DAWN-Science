/**
 * 换包（规格 U3）。**自己下、自己换、自己重启**——不走 Squirrel.Mac，
 * 因为它要求新旧包用同一张证书签名，而我们这一轮不签名。
 *
 * 这条路成立的前提是 2026-09-06 实测的两件事：
 * node 的 `fetch` 下下来的包**不带 `com.apple.quarantine`**，
 * 而没有 quarantine 的未签名 `.app` 走 LaunchServices 起得来、零弹窗。
 *
 * ## 顺序与回滚
 *
 * 解开 → **核对新包的版本** → 备份旧的 → 换上新的。任何一步失败都要
 * **原样滚回**：一个半换的应用意味着人手上既不是旧版也不是新版，而且他不知道。
 *
 * ## 依赖全部注入
 *
 * 真的那份坐在 `node:fs` 与 `ditto` 上；测试里是一份记账的替身——
 * 否则验一次「换包」就要动 `/Applications`。
 */
import { dirname, join } from "node:path"
import type { 换包方式 } from "../protocol/entities.js"

export interface 换包依赖 {
  运行(cmd: string, args: string[]): Promise<void>
  改名(从: string, 到: string): Promise<void>
  拷贝(从: string, 到: string): Promise<void>
  chmod(路径: string, 模式: number): Promise<void>
  删(路径: string): Promise<void>
  /** 解开之后那个目录里的 `*.app` */
  找app(目录: string): string | undefined
  /** 读 `X.app/Contents/Resources/app/package.json` 的 version */
  读包版本(app路径: string): string | undefined
}

/** 服务层给得出的那些（它不知道这个 app 装在哪儿——那是安装器的事） */
export interface 装参数 {
  方式: 换包方式
  /** 下下来的那个文件 */
  包路径: string
  期望版本: string
  当前版本: string
}

/**
 * 换包真正要的参数。
 *
 * **`应用路径` 用判别式变成必填**（2026-09-06 真机演练逼出来的）：
 * 它原先是可选的，于是服务层拼参数时漏了它，**编译器一个字都没说**，
 * 十个单测全绿——因为每个用例都自己把它写进去了。
 * 真机上的表现是「点了重启并更新，什么都没发生」。
 */
export type 换包参数 =
  | (装参数 & { 方式: "win-nsis" })
  | (装参数 & { 方式: "mac-zip" | "appimage"; 应用路径: string })

export async function 换包(p: 换包参数, 依赖: 换包依赖): Promise<void> {
  if (p.方式 === "win-nsis") {
    // NSIS 的静默安装。**装完由它自己拉起新版**，我们只负责退出
    await 依赖.运行(p.包路径, ["/S"])
    return
  }

  if (p.方式 === "appimage") {
    await 依赖.拷贝(p.包路径, p.应用路径)
    // **执行位不能少**：少了它下一次根本起不来，而那时应用已经退了，
    // 人看到的只是「点了没反应」
    await 依赖.chmod(p.应用路径, 0o755)
    return
  }

  // ── mac：zip ──────────────────────────────────────────────────
  const 解到 = join(dirname(p.包路径), "staged")
  await 依赖.删(解到)
  // `ditto -x -k` 是 macOS 自带的解 zip 方式，**会保留 .app 里的符号链接与权限**
  //（`unzip` 不保留，解出来的 app 起不来）
  await 依赖.运行("/usr/bin/ditto", ["-x", "-k", p.包路径, 解到])

  const 新app = 依赖.找app(解到)
  if (!新app) throw new Error(`包里没有 .app（解开的是 ${p.包路径}）——这个包不是我们要的东西`)

  /**
   * **核对版本**。宁可不更新，也不能把一个不知道是什么的东西装上去：
   * 资源名可能被换过、Release 可能被重传过，而这两件都不会有任何报错。
   */
  const 里面的 = 依赖.读包版本(新app)
  if (里面的 !== p.期望版本) {
    throw new Error(`包里的版本是 ${里面的 ?? "读不出来"}，与 Release 说的 ${p.期望版本} 对不上，没敢换`)
  }

  const 备份 = `${p.应用路径}.old-${p.当前版本}`
  await 依赖.删(备份)
  await 依赖.改名(p.应用路径, 备份)
  try {
    await 依赖.改名(新app, p.应用路径)
  } catch (e) {
    // **滚回原位**，然后把原话抛出去
    await 依赖.改名(备份, p.应用路径)
    throw e
  }
}
