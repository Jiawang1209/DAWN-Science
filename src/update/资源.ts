/**
 * 「这台机器该下哪个包、下完能不能自己装上」（规格 U3）。
 *
 * 两件事分开答，因为它们的失败方式不同：
 *   - **挑不到包**（这个平台没出、Release 里少了一个）→ 我们能做的只有下载页；
 *   - **挑到了但装不上**（deb 要 root、便携版换不了自己、装在写不进去的地方）→ 同样退下载页，
 *     但**原因完全不同，必须原样说给人听**。报成一句笼统的「更新失败」，
 *     人第一反应是去查网络——而问题在别处。
 *
 * 判据全部来自**环境自己给的事实**，不来自猜测：
 * `APPIMAGE` 与 `PORTABLE_EXECUTABLE_FILE` 都是 electron-builder 亲自设的环境变量。
 */
export interface 资源一个 {
  name: string
  size: number
  url: string
}

export interface 平台事实 {
  platform: NodeJS.Platform | string
  /** `process.arch`：`arm64` / `x64` */
  arch: string
  /** 从 AppImage 跑起来的时候有值（electron-builder 设的） */
  appImage?: string
  /** Windows 便携版跑起来的时候有值（electron-builder 设的） */
  portableExe?: string
  /** mac：`.app` 的路径；换包要动它的父目录 */
  appPath?: string
  可写: (路径: string) => boolean
}

export type 换包方式 = "mac-zip" | "win-nsis" | "appimage"

export type 挑选结论 =
  | { 能自装: true; 资源: 资源一个; 方式: 换包方式 }
  | { 能自装: false; 原因: string }

/** 按后缀找。**不按版本号拼名字**——线上产物与模板对不上过一次就够了 */
const 找 = (资源们: readonly 资源一个[], 后缀: string): 资源一个 | undefined =>
  资源们.find((a) => a.name.endsWith(后缀))

const 缺 = (后缀: string): 挑选结论 => ({
  能自装: false,
  原因: `这一版的发布里没有 ${后缀}——只能从下载页自己挑一个`,
})

export function 挑资源(资源们: readonly 资源一个[], 事实: 平台事实): 挑选结论 {
  if (事实.platform === "darwin") {
    // dmg 也在 Release 里，但那是给人拖的；zip 才是我们能自己解开换上去的形状
    const 后缀 = `-mac-${事实.arch}.zip`
    const 它 = 找(资源们, 后缀)
    if (!它) return 缺(后缀)
    // **没有 `.app` = 开发模式**（`electron dist/electron/main.js` 这么跑的）。
    // 说清楚是这个，别报成「没有写权限」——那句话会把人送去 chmod 一个不存在的东西
    if (!事实.appPath) {
      return { 能自装: false, 原因: "开发模式下跑的（不是一个 .app），换不了包——打包版里才有这条路" }
    }
    // 换 `.app` 是在它的父目录里做 rename，所以要写的是父目录，不是 `.app` 本身
    const 父 = 事实.appPath.replace(/\/[^/]+$/, "")
    if (!事实.可写(父 || "/")) {
      return { 能自装: false, 原因: `没有写 ${父 || "应用所在目录"} 的权限，装不上——权限问题，不是网络问题` }
    }
    return { 能自装: true, 资源: 它, 方式: "mac-zip" }
  }

  if (事实.platform === "win32") {
    if (事实.portableExe) {
      return { 能自装: false, 原因: "便携版换不了自己（运行中的 .exe 被系统锁着）——请从下载页下新的一份" }
    }
    const 后缀 = `-win-${事实.arch}.exe`
    const 它 = 资源们.find((a) => a.name.endsWith(后缀) && !a.name.includes("-portable"))
    if (!它) return 缺(后缀)
    return { 能自装: true, 资源: 它, 方式: "win-nsis" }
  }

  if (事实.platform === "linux") {
    if (!事实.appImage) {
      return { 能自装: false, 原因: "deb 装的版本要 root 才能换（`sudo dpkg -i`），应用自己做不了" }
    }
    // AppImage 那边 x64 叫 x86_64，arm64 还叫 arm64——两套命名，写死映射
    const 架构 = 事实.arch === "x64" ? "x86_64" : 事实.arch
    const 后缀 = `-linux-${架构}.AppImage`
    const 它 = 找(资源们, 后缀)
    if (!它) return 缺(后缀)
    return { 能自装: true, 资源: 它, 方式: "appimage" }
  }

  return { 能自装: false, 原因: `${事实.platform} 上没有出过包` }
}
