# 四张首次使用卡片验收

分支：`codex/first-launch-guide`，基线：`ce2ec26c`。用户确认首次介绍、功能、模型连接、可选计算环境四步，并在查看后要求每次显示一张居中紧凑卡片；语言选择沿用到主应用，连接支持 URL/Key 和直接检测。

## 实现与审查

- 卡片最大宽 36rem，顶部语言和跳过、底部四个进度圆点与导航均位于卡片内。一次只显示当前内容；卡片正文可滚动，导航保持可达。跳过密钥显示暂缓状态。
- 保留原有保存验证、hard/soft 归类、凭证异常及模型目录错误。检测不落盘，输入改变后清除旧结论；连接保存失败不继续存凭证。
- 从运行时目录读取不含凭证的默认地址/协议；规范化常见接口路径。未知 URL 允许填写模型 ID 和协议，不通过 Key 前缀猜测服务商。API Key 仅走既有凭证存储。
- 检测、保存验证与自动 agent 使用同一明确模型；模型协议覆盖持久化，补填 Key 保留已有其他模型。
- 向导中切换语言不重挂步骤，保留密钥草稿；方向键/Home/End 与单 Tab 入口可用。语言使用主应用已有偏好键。
- 只读审查提出的模型选择、协议覆盖、多模型保留问题均修复并增加回归，最终静态复核未发现必须修复项。

## 自动验证

`npm run typecheck`、`git diff --check` 通过，`npm run build` 通过。构建仍报告大于 500 kB 的 chunk 提示。

UI 定向测试 7 文件、170 项通过：setup-wizard、setup-endpoint、interpreter-picker、i18n、design-contract、app-mvp、app-default-client。

Node 定向测试 6 文件、111 项通过：native、setup-model、credential-agent、test-provider-key、key-validate、protocol/operations。

`npx playwright test e2e/setup-wizard.spec.ts`：6 项通过，覆盖卡片宽度、四步切换、解释器检测落设置、跳过后重启及补填入口、中英文沿用、自定义端点失败/成功检测、默认配置首次 native 对话，以及显式模型/协议在检测、保存验证、对话中的实际请求一致性。

## 实机界面

使用已构建 Electron 应用、独立临时配置/数据库/userData 和本地假服务检查。默认 1280×808，卡片宽 576 CSS px；960×640 下导航可见且无横向溢出。检查了四张卡片、中英文、深色样式和窄窗口，未发现输入框压缩或导航遮挡。

实机操作验证：第三张卡片切换英文后步骤和密钥草稿保留；进入工作台后关闭重启，语言仍为英文。预览恢复中文欢迎卡片并保持窗口打开供用户体验。

本地截图和原始日志：`/Users/liuyue/Documents/Codex/2026-10-27/dawn-first-launch-guide/`。预览目录为独立的临时 `dawn-guide-preview-*`。本轮使用假密钥和本地假推理，未验证真实供应商鉴权，也未安装或替换发布应用。

代码、开发文档与新增提交文本已按用户命名约束检查。保留功能分支，不合并、不推送。

## 后续增量：全窗口背景虚化和外链说明

用户要求引导时 App 桌面整体虚化。引导已改为全窗口固定遮罩，卡片清晰；补充模态语义、焦点循环和 Escape 防误跳。新增 Electron 回归先复现旧版未覆盖全窗口的失败，再验证修正。

本轮 UI 定向 4 文件 153 项通过；Electron setup-wizard 8 项通过（16.9 秒），新增检查遮罩覆盖完整视口、backdrop blur 生效、卡片 filter 保持 none、焦点循环，以及密钥链接交给系统浏览器分发而不创建新的 Electron 窗口。typecheck、build、diff 检查通过。只读复核未发现必须修复项。

链接未打开的原因是交互预览误带了测试用 DAWN_NO_EXTERNAL=1。当前已有配置的预览仅解除该进程开关，未改动保存的连接；另开的干净预览不设置该开关。产品外链处理代码无需修改。API URL 灰字是 placeholder，输入实际为空；DeepSeek 正式目录默认地址经本地 pi 目录读取为 https://api.deepseek.com，假服务预览则展示本地测试端点。

本轮截图和原始日志：`/Users/liuyue/Documents/Codex/2026-10-27/dawn-first-launch-guide/blur-background/`。此前填写的预览配置保留在原 `dawn-guide-preview-hGpXlN` 临时目录，新预览使用独立 `dawn-guide-blur-iDj1WG` 临时目录。

## 后续增量：API URL 真实自动填充

初始 DeepSeek 地址直接写入输入值，切换服务商同步更新；手动草稿与自动跟随分开，避免异步目录覆盖用户修改。无默认地址的服务商清空输入。提示文案同步更新中英文。

本轮 4 个 UI 文件 138 项通过；Electron setup-wizard 9 项通过（18.7 秒），覆盖实际输入值、服务商切换、手动改址后检测、旧检测结论失效，以及完整保存/对话回归。typecheck、build 和 diff 检查通过。新增用例先在旧实现下因实际输入为空失败，修正后通过。

实际 Electron 预览使用原生正式目录，确认 DeepSeek 自动填 https://api.deepseek.com，切换 Anthropic 自动填 https://api.anthropic.com；返回 DeepSeek 恢复默认地址。交互预览没有模型假服务覆盖和外链抑制；使用独立临时目录 dawn-autofill-preview-ybBED4，未迁移或修改此前配置，未发起真实供应商鉴权。截图与日志存放在 `/Users/liuyue/Documents/Codex/2026-10-27/dawn-first-launch-guide/url-autofill/`。
