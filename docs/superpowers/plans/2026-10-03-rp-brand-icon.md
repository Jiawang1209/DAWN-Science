# RP 图标落地计划

**Goal:** 落地用户确认的蓝 R、黄 P、深蓝圆角底，字母完整清晰。
**Architecture:** packaging/rp-mark.svg 为唯一字形源；Electron 生成应用 PNG 和透明托盘 PNG，沿用 macOS template image。
**Tech Stack:** SVG paths、Electron、现有 electron-builder。

- [x] 制作无字体依赖的 RP 矢量源。
- [x] 更新生成脚本，运行 npm run make-icon。
- [x] 检查尺寸、透明度和大小图标视觉效果。
- [x] 运行 typecheck、build 和托盘 Electron e2e。
- [x] 更新开发历史，不发布或修改已安装应用。
