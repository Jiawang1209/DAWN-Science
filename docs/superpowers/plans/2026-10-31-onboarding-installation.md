# 安装引导实施与验收计划

**Goal:** 重装从四步引导第 1 步开始，普通重启与应用内升级保留完成状态。

**Architecture:** 主进程安装世代 → 同步 preload 字段 → 按安装隔离的向导键；成功换包后接续世代。独立 JSON 不读取或修改凭证明文和业务数据。

**Tech Stack:** Electron、Node fs/crypto、React、Vitest、Playwright、NSIS。

- [x] 在 `tests/ui/app-default-client.test.tsx` 写保留旧完成标记、凭证尚未返回的同步欢迎页回归；在 `tests/update/换包.test.ts` 要求 Windows 更新标记。运行 `npx vitest run tests/ui/app-default-client.test.tsx tests/update/换包.test.ts` 验证失败。
- [x] 新增 `src/electron/onboarding-installation.ts` 与真实文件系统单测，覆盖同版本替换、同实例重启、成功更新接续、后续手动安装再次重置、损坏元数据和失败写入。
- [x] 修改 `src/electron/main.ts` / `preload.ts` / `src/ui/client.ts` / `setup-wizard.tsx`：窗口前建立安装世代、同步只读 ID、完成键按安装隔离。测试同世代状态保留、不同世代旧状态不生效。
- [x] 在 `packaging/onboarding.nsh` 增加 NSIS 安装标记并配置 include；`src/update/换包.ts` 传递 `--updated`，成功换包重启时接续身份。编译实际 Windows NSIS，运行现有更新测试。
- [x] 顺序运行 `npm run typecheck`、`npm run build`、完整 `npm test`；再运行首启、向导、设置、更新 Electron 回归。测试运行期间不与完整单测里的浏览器争抢。
- [x] 构建实际 Mac 包，在临时位置保留同一 userData 依次验证新装、普通重启、同版本覆盖安装和受控更新，检查四步界面及数据保留，保存截图与结果。
- [ ] 复核差异和证据，更新验收文档；仅本地合并 main，保留用户已有预览数据，不推送、不替换已安装 App。
