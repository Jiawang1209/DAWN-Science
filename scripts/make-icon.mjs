/**
 * 生成占位图标 `packaging/icon.png`（1024²）：绿圆底 + 白色「D」。
 * electron-builder 会自己从 png 派生 .icns / .ico。
 * 要用 Electron 的 nativeImage 渲 SVG，所以得这么跑：`npx electron scripts/make-icon.mjs`
 * 作者有正式图标时直接覆盖 packaging/icon.png，这个脚本就退休。
 */
import { app, nativeImage, BrowserWindow } from "electron"
import { writeFileSync, mkdirSync } from "node:fs"

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="64" y="64" width="896" height="896" rx="200" fill="#0f766e"/>
  <text x="512" y="700" font-family="Helvetica Neue, Arial, sans-serif" font-weight="700" font-size="560" fill="#ffffff" text-anchor="middle">D</text>
</svg>`

app.whenReady().then(async () => {
  // nativeImage 不认 SVG；开一个离屏窗口把 SVG 画成 PNG
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, webPreferences: { offscreen: true } })
  await win.loadURL(`data:text/html,<body style="margin:0">${encodeURIComponent(SVG)}</body>`)
  await new Promise((r) => setTimeout(r, 500))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  mkdirSync("packaging", { recursive: true })
  writeFileSync("packaging/icon.png", img.toPNG())
  console.log("已写 packaging/icon.png", img.getSize())
  void nativeImage
  app.quit()
})
