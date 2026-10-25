# 剩余 Electron 用例与逐项修复总验收 — 2026-10-25

起点为本地 main `e3701483`。原始清单为208文件838项，其中此前已验证132项，本轮继续其余706项；用户授权一项一分支、验证后本地合并main，明确不推送。

## 最终结果

| 范围 | 通过 | 跳过 | 失败 | 未跑 |
|---|---:|---:|---:|---:|
| 本轮剩余706项 | 705 | 1 | 0 | 0 |
| 原已通过132项，修复后再次复验 | 132 | 0 | 0 | 0 |
| 原始838项去重合计 | 837 | 1 | 0 | 0 |

这是多批次累计覆盖，不是一次838项整跑。原始catalog/inventory、改名映射、每项最终结果与来源run均可核对；重复回归不重复计数。唯一Electron跳过项是原有 `sidebar-collapse.spec.ts`「展开的过程中同样不被压（已按取舍放弃）」；本轮未加skip或放宽失败断言。

最终代码点 `6d6b3c91`：类型检查通过；全量Vitest为499文件、5290通过/10跳过（119.51秒）。最终复验为run-69 129项、run-70补1项、run-71/72各1条真实内核，合计132通过。补跑是因为清单选择遗漏标题含`›`的设置列用例，未把未选中项当通过。

最近完整主目录构建已在产品修复`fcd486b8`后通过；`git diff fcd486b8 HEAD -- src scripts package.json package-lock.json`确认最终产品源码/构建输入一致。后续均为E2E、基线或文档，不拿另一份未验证源码替代当前产物。

## 本轮修复的三个产品问题

1. 归档临时会话的搜索命中打开后丢失。临时摘要尚未刷新就选中，稍后项目列表刷新使对话短暂卸载并消耗掉高亮目标；现在摘要就绪后再选中。新增App异步gate回归先红后绿，原Electron搜索断言不改，包含实际打开/高亮保持回归。最终产品只在App原流程补一次摘要加载。
2. 主侧输入卡相差约10px。主区环境栏被32px目录按钮撑到40px，侧边无按钮时只有29.695px；文字区/底栏相同。共用环境栏保留既有控件与留白的最小高度。1280/1920实屏、输入增高与清空后等高及底边对齐均通过。
3. 服务器内会话时间/菜单比其他会话偏左12px。父机器行已右缩12px，内层列表重复计算；只补回列表宽度，左侧层级保持。原等列断言保留，服务器/项目/会话/归档及窄栏回归通过，截图已检查。

其余18项是用例与已经批准的界面契约不同步；没有为通过测试改回旧布局。产品源码差异仅`src/ui/App.tsx`及`src/ui/styles.css`，另有一份App测试夹具/回归。未保留早期无效的search-jump DOM观察器尝试；该尝试虽然单测通过，真实Electron仍失败，已撤回并留存证据。

## 独立分支与记录

每项均有独立spec/plan/验证记录，提交后快进本地main。以下21个分支均经祖先检查确认已进入main，另9个文档提交记录较早各项主目录验收。

| 分支 | 修复提交 | 范围 | 证据 |
|---|---|---|---|
| `codex/electron-chat-size` | `f4b1b601` | 用户动作固定尺寸与回答缩放 | [记录](2026-10-25-electron-chat-size-verification.md) |
| `codex/electron-desktop-cli` | `f59f5886` | CLI模型名称/实际绑定 | [记录](2026-10-25-electron-desktop-cli-verification.md) |
| `codex/electron-file-preview-heading` | `17a05a1e` | 文件名字形与滚动条高度分开测量 | [记录](2026-10-25-electron-file-preview-heading-verification.md) |
| `codex/electron-version-placement` | `9b7d9804` | 全局状态栏版本位置 | [记录](2026-10-25-electron-version-placement-verification.md) |
| `codex/electron-shortcut-reference` | `a4151e2d` | 含会话查找的完整快捷键 | [记录](2026-10-25-electron-shortcut-reference-verification.md) |
| `codex/electron-project-row` | `49b1fc02` | 48px入口与文字单行 | [记录](2026-10-25-electron-project-row-verification.md) |
| `codex/electron-script-reading` | `501b3747` | 脚本预览语义底色 | [记录](2026-10-25-electron-script-reading-verification.md) |
| `codex/electron-archived-search` | `22d88d62` | 修复归档临时会话搜索命中丢失 | [记录](2026-10-25-electron-archived-search-verification.md) |
| `codex/electron-setup-wizard` | `35c44e48` | 向导中的添加菜单优化入口 | [记录](2026-10-25-electron-setup-wizard-verification.md) |
| `codex/electron-side-session-tabs` | `5b470e21` | 主侧切换按顶栏页签验收 | [记录](2026-10-25-electron-side-session-tabs-verification.md) |
| `codex/side-composer-alignment` | `76be5ef9` | 修复主侧输入卡高度差 | [记录](2026-10-25-side-composer-alignment-verification.md) |
| `codex/sidebar-session-columns` | `fcd486b8` | 修复服务器会话时间/菜单列错位 | [记录](2026-10-25-sidebar-session-columns-verification.md) |
| `codex/electron-scroll-input` | `a70f0ad2` | 多轮滚动不依赖动态占位文字 | [记录](2026-10-25-electron-scroll-input-verification.md) |
| `codex/electron-subagent-readback` | `4b17594a` | 子agent读回工具身份与原入参 | [记录](2026-10-25-electron-subagent-readback-verification.md) |
| `codex/electron-subagent-dock-tabs` | `eb368d6d` | 自适应标签与完整溢出入口 | [记录](2026-10-25-electron-subagent-dock-tabs-verification.md) |
| `codex/electron-tray-home` | `d58c1536` | 托盘回当前首页且保留草稿 | [记录](2026-10-25-electron-tray-home-verification.md) |
| `codex/electron-pane-surfaces` | `6b4f80b0` | 亮暗三工作面语义令牌 | [记录](2026-10-25-electron-pane-surfaces-verification.md) |
| `codex/electron-visual-baselines` | `41ac3f0c` | 逐类核对后同步8张视觉基线 | [记录](2026-10-25-electron-visual-baselines-verification.md) |
| `codex/electron-web-preview-bounds` | `51a94384` | 原生网页四维位置与宽度同步 | [记录](2026-10-25-electron-web-preview-bounds-verification.md) |
| `codex/electron-remote-kernel-navigation` | `8e36a387` | 远端内核现行导航/输入契约 | [记录](2026-10-25-electron-remote-kernel-navigation-verification.md) |
| `codex/electron-interpreter-placeholder` | `6d6b3c91` | 解释器状态与输入提示分开验收 | [记录](2026-10-25-electron-interpreter-placeholder-verification.md) |

## 关键验证边界

- 14张macOS视觉基线：先看亮暗expected/actual/diff并核对已合入文字/表面/外框/版本，只同步8张过期图；使用失败验证轮稳定actual。原mask、threshold=0、maxDiffPixels=100保持，更新后全14项连续两遍通过，main再14/14。未宣称Windows/Linux视觉验证。
- 23项内核相关场景单独分进程串行，包含18项实际使用本机Python/R的场景及5项假模型调整方向/CLI无内核入口场景。真实双内核R连续重启3次不重复输出、Python实例保持；真实sleep(30)可中止；启动中停止后的晚到内核回收/旧代码不执行；笔记本与agent共享内核均通过。
- remote-kernel在main完整8/8：主动断开重建，意外掉线原变量43接回，后台杀核30秒内报警并重建，掉线期间死核识别，解释器重开回显，Python/R计算42及png。SSH身份/链路为夹具，内核和端口转发真实在本机运行，不冒称真实外部服务器验证。系统R来自`/usr/local/bin/Rscript`，未安装/升级解释器。
- 本地kernel-session在main完整6/6无跳过。隔离工作树首次缺少相对`.venv-kernel`导致2项跳过，已仅链接主目录已有环境重跑，并在主目录再次6/6；这两次临时跳过没有计入最终跳过。
- 真Electron验证使用源码构建产物和隔离测试数据；推理/SSH等替身范围见各记录。覆盖本机UI、原生WebContentsView、Shell/CLI、数据库及内核，不等同于真实供应商鉴权、签名安装包或发布验收。

## 可复核证据

本机根目录：`/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-remaining-electron/`。

- `catalog-baseline.json`、`inventory.json`：原始838/剩余706项。
- `aliases.json`：仅3处同一用例改名映射。
- `run-01`至`run-72`相应JSON/日志/失败截图/trace：含初次失败和修正过程；补充目标/主目录复验日志在各问题子目录。
- `final/all-coverage.json`和`.csv`：838项逐条最终状态、来源run及132项复验对账；`final/coverage.py`可重算并严格断言837通过/1跳过。
- `visual-baselines/updates.json`：8图前后sha256和稳定帧路径；旧expected/diff保留。
- `final/dawn-final-typecheck.log`、`final/dawn-final-vitest.log`：最终类型与全量Vitest。

所有21项修复已本地合入main。未推送远端，未替换安装版应用，未修改系统/网络配置。
