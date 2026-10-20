# SSH 目录批量传输实施计划

> 使用 superpowers:executing-plans 在当前会话逐项执行；用户已授权开始。不得使用子 agent。预览阶段不合并、不推送；2026-10-21 用户随后授权核对功能后提交并本地合并 main，仍不推送。

**Goal:** 在独立分支交付可实际预览的目录上下行、逐文件状态、失败清单和重试。

**Architecture:** 复用 SSH 长连接与单文件流。目录服务独立持有队列和序列化快照，协议暴露摘要与分页明细，React 面板只投影这些状态。隔离用户配置和预览数据库。

**Tech Stack:** TypeScript、Node streams、ssh2、Zod、React、Vitest、Electron、Playwright。

## 1. 单文件可靠性

- [x] 在 `tests/remote/transfer-safety.test.ts` 注入 rename 失败、短读、静默流、元数据拒绝；先运行并确认原实现失败。
- [x] `src/remote/transfer-io.ts` 提供有界等待和带取消／空闲超时的 pipeline；`src/remote/ssh.ts` 使用唯一 part、大小和源变化检查、POSIX 覆盖、元数据超时、keepalive。新增目录／lstat／realpath 原语。
- [x] 更新 `src/remote/fake-ssh.ts` 的 mkdir、lstat、realpath、POSIX rename 和 SFTP 错误码，使假边界忠于协议。
- [x] 运行 `npm test -- tests/remote/transfer-safety.test.ts tests/remote/sftp.test.ts tests/remote/ssh.test.ts`，预期全部通过。

## 2. 目录服务

- [x] `tests/remote/transfer-batches.test.ts` 先验证目录层级、空目录、链接跳过、冲突、并发上限、取消、失败项重试、恢复 interrupted；运行确认缺失服务失败。
- [x] 新建 `src/remote/transfer-types.ts` 定义批次／条目 schema；新建 `src/remote/transfer-batches.ts` 实现扫描、目标检查、队列、持久化和按页读取。存储只含 JSON 数据；取连接用函数，每次操作确认连接可用。
- [x] 运行目录服务测试；分别断言成功文件字节和错误清单，不能只断言计数。

## 3. 后端与协议

- [x] `tests/workbench/directory-transfer.test.ts` 先调用新增操作并验证请求错误、目标和记账；运行观察失败。
- [x] 在 `src/protocol/operations.ts` 注册六个操作，在 `src/protocol/version.ts` 增加 minor；在 `src/workbench/backend.ts` 仅接服务，在 `src/electron/wiring.ts` 注入数据库同级持久化路径和退出取消钩子。
- [x] 同次补 `scripts/mock-inference-server.mjs` 的确定性操作分支。旧单文件 stat 仅对 ENOENT 判不存在。
- [x] 运行目录后端、协议、目标预留和 mock 回归。

## 4. 文件面板

- [x] 新建 `tests/ui/transfer-batches.test.tsx` 验证批次、逐文件状态、错误、取消、重试、冲突及分页；先红后实现。
- [x] 新建 `src/ui/transfer-batches.tsx` 和独立样式；用服务端状态驱动列表，展示服务器和完整目标；中英文文案接现有 i18n。
- [x] `src/ui/files.tsx` 加上传文件夹和下载文件夹入口；`src/ui/App.tsx` 接目录选择、开始确认和刷新；原有多文件上传等待上一项实际完成，不覆盖未结束任务的跟踪。
- [x] 运行组件与设计契约测试、类型检查，检查动态 props 不串服务器。

## 5. Electron 验收

- [x] 新建 `e2e/directory-transfer.spec.ts`，使用现有 fake SSH 和原生目录选择注入；真实点击上传和下载并核对磁盘内容、目录结构、冲突、取消、失败与重试。读取任务的实际目标路径。
- [x] `npm run typecheck`、`npm test`、`npm run build`；针对主路径执行目录传输和已有远端文件 Electron 用例，核对亮暗／窄窗截图。失败先查原因，不批量更新视觉基线。
- [x] 使用隔离数据库、配置和 userData 启动实际预览，保留窗口供用户操作；确认加载本工作树 dist。

## 6. 收尾

- [x] 检查 diff、安全覆盖、边界与测试证据；记录到 `docs/reviews/2026-10-21-ssh-directory-transfer-verification.md`，更新唯一开发历史和 CLAUDE 文档入口。
- [x] 报告实际测试数量和真实服务器未验证边界；停留当前分支，展示预览，不合并和推送。

## 实施结果（2026-10-21）

用户否定首版常驻清单后，已按确认方向重新设计：沿用原工具栏和 xfer 卡，文件夹上传收进「传到这里」菜单，底部默认仅一条摘要；批次、文件、完整路径依次展开。功能验收与既有失败基线见 `docs/reviews/2026-10-21-ssh-directory-transfer-verification.md`。保持独立分支，未提交、合并或推送。

### 用户追加授权后的最终检查

用户已要求核对功能后提交并本地合并main，仍不推送。复核修复目录传输的退出等待遗漏；最终全量448文件4881项通过、10项跳过，类型检查与构建通过，目录/远端及亮暗视觉基线44项通过，退出修复重建后目录Electron再验2/2通过。本地集成与main复验结果记录于上述验收文档末节。
