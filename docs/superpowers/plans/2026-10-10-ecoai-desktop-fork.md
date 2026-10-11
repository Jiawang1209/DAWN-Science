# EcoAI-Science Independent Desktop Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本文是待审阅的迁移计划；当前不执行新项目创建、代码迁移、打包或外部发布。

**Goal:** 从可追溯的 DAWN 版本创建独立目录、独立仓库、可与 DAWN 共存的 EcoAI-Science 桌面产品，初版保留同等科研工作台功能。

**Architecture:** 采用独立 Git 派生仓库，保留共同历史和一个只用于选择性同步的 dawn remote。集中 EcoAI 产品身份，分离安装、数据、全局目录与更新边界；底层协议和科研能力复用已有实现，单位接口以后单独接入。此阶段不抽取共享框架、不实现 Web 服务端。

**Tech Stack:** 沿用 DAWN 的 Electron / TypeScript / React / SQLite / SSH / Notebook 技术栈和 Vitest / Playwright 验证。

---

## 前提与范围

- 用户已明确偏好独立项目目录，不采用单仓库品牌切换作为交付结果。
- 推荐先完成 [界面刷新](2026-10-10-ui-refresh.md) 并验收，再选该提交派生。若先并行，已核实的稳定来源为 `207f9ff0` / DAWN 0.0.25，后续按批次同步 UI。
- 本计划的可执行目录创建示例使用已核实的 `207f9ff0`。若换为 UI 版本，先记录被用户验收的完整 SHA，再替换命令中的版本参数；不能猜测 main 已包含该改动。
- 新目录建议：`/Users/liuyue/Desktop/Github_repos/ecoai-science`。必须为空/不存在，不能覆盖现有同名目录。
- 不修改 DAWN 源目录、已安装应用和真实数据；不自动创建 GitHub 仓库或 origin、不推送、不替换安装。
- 目录创建与身份隔离属于后续实施任务，当前仅编写计划。EcoAI 名称、Logo、正式应用标识与单位发行主体可以在本地工程完成后再确定。

## E0：检查与可追溯迁移

**Source:** `/Users/liuyue/Desktop/Github_repos/dawn-science`。
**Create:** 新仓库及其 `docs/UPSTREAM.md`、`docs/PRODUCT.md`。

- [ ] 在源目录执行 `git status --short --branch`、`git show --no-patch --format=fuller 207f9ff0`、`git ls-files`。检查待派生提交是否跟踪了本地凭证/数据库/个人数据，仅报告路径、不打印秘密正文。工作区未提交内容不自动带入新仓库。
- [ ] 克隆 Git 历史并以明确基线创建 EcoAI 开发分支。`--no-hardlinks` 让新仓库不依赖源仓库对象硬链接；目标存在即停止，不删目录重试。

```bash
source_repo=/Users/liuyue/Desktop/Github_repos/dawn-science
ecoai_repo=/Users/liuyue/Desktop/Github_repos/ecoai-science
if [ -e "$ecoai_repo" ]; then
  echo "目标目录已存在，请保留并核对其归属。" >&2
  exit 1
fi
git clone --no-hardlinks --no-checkout "$source_repo" "$ecoai_repo"
git -C "$ecoai_repo" switch -c codex/ecoai-bootstrap 207f9ff0
git -C "$ecoai_repo" remote rename origin dawn
```

- [ ] 写 `docs/UPSTREAM.md`：`git rev-parse HEAD` 得到的完整源 SHA、源版本 0.0.25、源路径、派生日期、许可证、dawn remote 目的及下一次同步规则。保留原作者/历史，不把历史作者重写成 EcoAI。
- [ ] 验证 `git -C "$ecoai_repo" rev-parse --show-toplevel` 指向新目录，`git -C "$ecoai_repo" remote -v` 只有 dawn、无待发布的 origin。源目录 `git status --short --branch` 与操作前一致。
- [ ] 新项目仅含 Git 跟踪的源码历史；不复制 `.env`、node_modules、dist、release、tmp、用户配置/数据库、缓存与已安装软件。它们需要时各自重新建立。

## E1：集中产品身份与可见品牌

**Create:** `src/product/identity.ts`、`tests/product/identity.test.ts`、`docs/PRODUCT.md`。
**Modify:** `package.json`、`package-lock.json`、`electron-builder.yml`、`src/electron/main.ts`、`src/ui/App.tsx`、`src/ui/index.html`、图标资源与 `scripts/make-icon.mjs`；实现时先核对资源路径是否仍与基线一致。

- [ ] 新增身份模块；以下工程标识用于本地验证，正式 appId 与图标在发行前由单位确认。初版不设置可用更新源：

```ts
export const PRODUCT = {
  id: "ecoai-science",
  displayName: "EcoAI-Science",
  appId: "science.ecoai.app",
  dataDirectory: "EcoAI-Science",
  homeDirectory: "EcoAI",
  legacyDawnMigration: false,
  updatesEnabled: false,
} as const
```

- [ ] 先写身份测试，验证独立名称/appId、默认无自动更新、禁止 DAWN 首启迁移。该测试在新模块未创建时应因缺少模块失败；创建后通过。

```ts
import { describe, expect, it } from "vitest"
import { PRODUCT } from "../../src/product/identity.js"

describe("EcoAI identity", () => {
  it("uses its own install/data identity", () => {
    expect(PRODUCT.id).toBe("ecoai-science")
    expect(PRODUCT.appId).not.toBe("science.dawn.app")
    expect(PRODUCT.dataDirectory).toBe("EcoAI-Science")
  })
  it("does not inherit DAWN migration or updates", () => {
    expect(PRODUCT.legacyDawnMigration).toBe(false)
    expect(PRODUCT.updatesEnabled).toBe(false)
  })
})
```

- [ ] package name 改为 ecoai-science，产品版本建议从 `0.1.0-dev.0` 起，源版本留在 UPSTREAM；保留实际许可声明和依赖版本。用 `npm install --package-lock-only --ignore-scripts` 同步 lock，不做无关依赖升级。
- [ ] electron-builder 设置独立 appId/productName/executableName/artifactName；主进程的 setAppUserModelId、托盘/退出菜单、通知/报错标题、顶栏和关于页读取同一产品身份。图标资源使用 EcoAI 明确的新素材，不沿用 DAWN 的 D 图标假装完成品牌迁移。
- [ ] `docs/PRODUCT.md` 记录本地工程标识、正式发行需确认的项目，以及“基于 DAWN”的源码/许可信息。用户看到的产品名统一；`window.dawn` IPC 名、`.dawn` 科研项目格式、工具调用 ID 不做全局文本替换。
- [ ] 运行 `npx vitest run tests/product/identity.test.ts tests/packaging-config.test.ts` 和 `npm run typecheck`。更新包装配置测试为 EcoAI 的真实断言，不删除原安装/依赖打包校验。

## E2：数据与默认目录隔离

**Create:** `src/product/paths.ts`、`tests/product/paths.test.ts`。
**Modify:** `src/electron/main.ts`、`src/electron/wiring.ts`、`src/electron/migrate-userdata.ts` 的调用边界、`src/workbench/backend.ts` 中默认目录、`src/cli.ts`、隔离夹具 `e2e/fixtures.ts` 与 `scripts/dev-mock.mjs`。
**Reuse tests:** `tests/electron/migrate-userdata.test.ts`、`tests/electron/credentials.test.ts`、`tests/electron/single-instance.test.ts`、`tests/workbench/credential-store.test.ts`。

- [ ] 用纯函数集中默认目录，先测试 EcoAI 与已知 DAWN 默认路径不同；Electron 的 appData/home 由外部传入，不让测试读取真实个人目录。

```ts
import { join } from "node:path"
import { PRODUCT } from "./identity.js"

export function productPaths(appData: string, home: string) {
  const userData = join(appData, PRODUCT.dataDirectory)
  const root = join(home, PRODUCT.homeDirectory)
  return {
    userData,
    workspace: join(root, "workspace"),
    scratch: join(root, "scratch"),
    skills: join(root, "skills"),
    agents: join(root, "agents"),
    memories: join(root, "memories"),
    cliHome: join(root, "cli"),
  }
}
```

- [ ] 入口最早阶段设置 app 名称、userData 与 Chromium sessionData（可由 userData 派生），然后才计算 CONFIG、DB、startup.log、凭证路径与更新路径。检查顶层 import 是否提前求值旧路径；若有则延后初始化，不能只在 whenReady 后 setPath。
- [ ] 通过现有 opts 显式向 wiring 传 workspace/scratch/skills/agents/memories/cliHome；排除 `~/DAWN` 和 `~/.pi` 等后备默认意外继承。backend.ts 非 Windows 的默认目录和 CLI 默认 providers/db 同步产品化。
- [ ] EcoAI 不调用 DAWN 的 `打包版首启迁移`。测试构造一个含哨兵的旧 Electron/DAWN 假目录，启动 EcoAI 后原文件未动，EcoAI 数据库不含哨兵会话/凭证；不能对真实 userData 做此实验。
- [ ] 定义 EcoAI 自己的环境覆盖项，夹具只注入 EcoAI 对应路径。若暂时保留 DAWN 测试开关别名，写清仅用于测试且显式路径优先，不允许普通启动继承 DAWN 的 DB/CONFIG 环境配置。
- [ ] 两产品全局 Local Storage 必须来自各自 Chromium 存储；存储 key 是否沿用 dawn.global 不影响物理隔离，但不让测试通过共用 sessionData 串偏好。显式选中的科研项目格式保持兼容，不自动扫描导入 DAWN 项目。
- [ ] 运行 `npx vitest run tests/product/paths.test.ts tests/electron/migrate-userdata.test.ts tests/electron/credentials.test.ts tests/electron/single-instance.test.ts tests/workbench/credential-store.test.ts`，再通过隔离 Electron 用例核对数据库、凭证、默认目录与窗口偏好。

## E3：更新与安装边界

**Modify:** `src/update/发布源.ts`、`src/update/资源.ts`、`src/update/本机安装器.ts`、`src/update/换包.ts`、`src/electron/main.ts`、`src/ui/update-panel.tsx`、`electron-builder.yml`。
**Tests:** `tests/update/发布源.test.ts`、`tests/update/资源.test.ts`、`tests/update/换包.test.ts`、`tests/ui/update-panel.test.tsx`、`e2e/update.spec.ts`。

- [ ] 先写回归：EcoAI 未配置 feed 时不请求 DAWN GitHub Releases，也不能进入换包；界面显示“尚未配置更新来源”。检查更新服务初始化和 UI 检查入口的实际调用链，禁用必须作用于服务而非只隐藏按钮。
- [ ] 用 PRODUCT.updatesEnabled 控制服务创建/检查入口；未启用返回明确不可用状态，不用 DAWN GITHUB_LATEST 兜底。后续单位指定 feed 后才打开并验证包身份。
- [ ] 安装器/资源匹配只接受 EcoAI 的包名与平台/架构；遇到 DAWN 包拒绝操作。数据交接文件、盐、下载目录与安装目标都绑定 EcoAI。
- [ ] `npm run pack` 先验证未发布目录包，人工核对名称、图标、应用标识与资源。测试前保留原 DAWN 软件；不把包复制进 /Applications，也不执行真实 updater 换包。
- [ ] 运行上述定向单测与隔离 `e2e/update.spec.ts`，验证假更新请求与拒绝跨产品包；不把关闭更新按钮当成验证通过。

## E4：两个产品共存与功能等价验收

**Create:** `e2e/product-isolation.spec.ts`；使用隔离路径与两个不同构建输出，不能共用 dist。
**Evidence:** EcoAI 仓库内 `tmp/ecoai-bootstrap-verification/`。

- [ ] 在同一台机器同时启动 DAWN 与 EcoAI 的隔离测试实例。各自新建不同项目/会话/模型配置，断言对方的会话、凭证和主题未出现；退出一边不终止另一边。
- [ ] 先在两个隔离 Chromium userData 写不同偏好，重启后仍各自恢复；再验证独立单实例锁、通知/托盘标识，不只比较顶栏文字。
- [ ] EcoAI 执行 `npm run typecheck`、`npm run build`、身份/目录/包装/迁移/更新单测及 `npx playwright test e2e/product-isolation.spec.ts e2e/composer-ready.spec.ts e2e/plan-mode.spec.ts e2e/user-questions.spec.ts e2e/artifacts.spec.ts e2e/side-session.spec.ts`。远端走假 SSH；科研内核有条件另跑已有隔离用例。
- [ ] 截图交付 EcoAI 空态、主对话、右侧结果、服务器界面，以及两个产品同时运行的共存图。记录实际通过数、包路径、源 SHA 和未验证平台。
- [ ] 文档说明初版哪些能力与源 DAWN 等价，哪些发行项仍未配置。通过本机测试不能宣称已完成 Windows/Linux 正式发行或网页平台。

## E5：通用改动同步工作流

**Files:** `docs/UPSTREAM.md`、EcoAI 开发历史；此任务不增加运行时框架。

- [ ] 把公共修复与 EcoAI 专属改动分开提交，更新日志记录源 SHA；执行提交以届时用户授权为准，不自动推送。
- [ ] 每次同步先 `git fetch dawn`，查看指定源提交影响，再开 EcoAI 同步分支。不要整仓覆盖或自动合并对方默认分支。
- [ ] 对审阅过的公共提交执行 cherry-pick，发生冲突时按 EcoAI 身份/数据隔离约束解决；运行触及功能的测试和本产品身份回归。记录成功/跳过/冲突解决的提交。
- [ ] UI 首次刷新若晚于派生，单独作为一个同步批次，复核署名、输入工具、项目/服务器顺序与右侧菜单；保留 EcoAI 品牌配置。
- [ ] 只有当重复同步已形成明确成本且共性接口稳定时，另写共享包抽取计划；不在这一轮直接搬迁 runtime/protocol 大目录。

## 交付与许可边界

交付物为独立 EcoAI 源码仓库、来源记录、独立身份/目录配置、可本机预览的目录包与验证证据。现有 AGPL 声明和第三方 notices 保留；正式单位许可/归属与发布方案在发行前根据真实权属确定。

本计划没有开始实施。目录创建、Logo 选定、外部仓库、单位账号接入、正式签名发布与网页化均有清楚的后续阶段，不把仅改产品名记为迁移完成。
