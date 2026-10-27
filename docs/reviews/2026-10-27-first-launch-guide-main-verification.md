# 首次引导合并验收

用户授权重新测试并在无问题后合并本地 main。基线本地 main 与 fetch 后 origin/main 均为 ce2ec26c，开发分支 codex/first-launch-guide。

## 审查与修正

全分支只读复核发现并修复两类问题：混合协议目录必须按所选模型推导 API/基址，不能新增服务商级覆盖去改动兄弟模型；解释器保存错误必须显示在卡片内，不能藏在虚化状态栏。修复后只读复核未发现新的必须修复项。

目录通过协议 8.35 提供每模型元数据，各层复用响应类型。只补 Key 不改连接；自动模型选择保留原生目录地址/协议。补充了混合协议组件与运行时重载回归、Fireworks 目录实际 IPC 检测/保存/首聊请求断言，以及解释器错误卡片内可见、仍可跳过的 Electron 回归。协议版本固定值回归同步到 8.35。

## 合并前证据

- typecheck、build、git diff --check 通过；构建仍有大于 500 kB chunk 提示。
- UI 11 文件 240 项通过，覆盖向导、地址解析、解释器、设置、模型选择器、双语和设计契约。
- Node/配置/协议 21 文件 348 项通过，覆盖模型目录、连接存储、密钥验证、首选模型与协议契约。
- Electron 7 文件 25 项通过（49.3 秒）：setup-wizard、base-url、key-is-enough、model-switch、external-link、i18n、model-error。

自动化使用隔离数据与假服务，未验证真实供应商鉴权，不安装或替换发布应用。其他开发 worktree 和原始预览配置保持原状。命名限制适用于本分支新增代码、文档和提交文本。

## 本地 main 合并与复验

功能分支以 fast-forward 合并到本地 main，代码提交为 c7d293db。合并后 typecheck 通过，关键组件/模型回归 3 文件 34 项通过；完整 setup-wizard Electron 11 项通过（21.9 秒），包括混合协议与解释器错误分支。合并后未修改应用代码，工作区保持清洁；未推送、未发布或替换已安装应用。

原始日志位于 `/Users/liuyue/Documents/Codex/2026-10-27/dawn-first-launch-guide/main-merge/`。保留已合并功能分支供追溯，其他 worktree 不作清理。
