# 输入区布局与菜单整合验收（2026-10-20）

用户已验看分支预览，并授权功能验收通过后本地合并 main。不推送远端，不替换安装应用，保留独立预览工作树。

## 验收结果

- 类型检查、Electron/UI完整构建、`git diff --check`通过。
- 全量Vitest：440个测试文件，4834项通过、10项跳过。
- 110项输入相关Electron功能用例逐项通过；初轮108项通过，另两项经修正验收步骤/既有顶栏断言后复测通过。
- 另3项Bot派单与1项ACP切回API兼容用例通过，相关功能覆盖合计114项。
- 14张macOS亮暗主题视觉基线更新后复验全部通过；暗色空态额外连续复验2次通过。
- 合并前独立代码审查发现1项P2，已修复并用真实Electron复现前后结果验证，无未解决阻断项。

## 功能覆盖

| 功能 | 主要验收文件 | 关键判据 |
|---|---|---|
| 工作目录、本机/服务器 | composer-layout、pick-workspace；composer-layout单元测试 | 本机选择实际目录，远端显示真实路径，草稿不丢失 |
| 附件、图片、粘贴、拖入 | attach、composer-paste | 路径引用保留原文，图片真实进入共享假模型请求 |
| 优化三档、取消、撤回、快捷键 | enhance、composer-layout | 基础/标准/专家参考范围正确，晚回结果不覆盖已发送草稿 |
| 生成方案 | plan-mode、user-questions | 保存方案、批准执行、拒绝、只读门、主侧隔离及澄清后状态保留 |
| 模型与推理 | model-switch、composer-config-layout | 下一次请求实际使用新模型，窄栏推理与适配器开关可点击 |
| 权限 | permission | 三档持久化、确认/拒绝实际生效 |
| 上下文与统计 | context-compaction、composer-meta | 真实累计、手动/自动压缩、ACP不可读说明、主侧底边对齐 |
| 终端 | terminal-dock、empty-repo、composer-ready | 进程实际cwd、打开/关闭、标签与会话隔离 |
| 中文、多行与高亮 | ime、composer-sizing、composer-highlight | 组词回车不误发、换行保留、滚动与镜像对齐 |
| 亮暗、自定义主题与窄栏 | composer-layout、ui-layout-final、visual | 悬停沿用主题色，按钮不重叠、不出卡，首页/主侧会话均可操作 |

## 发现与修正

1. **极窄侧栏挤压模型按钮**：真实ACP侧会话在280px宽且有推理/其他开关时，模型按钮仅17px。360px以下遇到这些配置时，模型/推理/发送独占第二行；新增测试检查按钮宽度、两两不重叠，并实际操作模型、推理与其他配置菜单。普通单行布局不变。
2. **旧测试入口与布局预期**：独立优化/方案/终端按钮已按用户要求进入添加菜单，旧用例改走实际新入口，保留原有请求、文件、权限及工作目录断言。占位提示的定位文案同步更新。
3. **既有顶栏断言与视觉内容漂移**：main的按钮间距原本为4px、品牌额外留4px，旧测试统一写8px；按现有源样式修正测试，未改产品顶栏。仓库已含analysis-delivery在内8个技能，旧视觉计数仍是7；核对8份SKILL.md与main历史后同步测试和基线。
4. **暗色空态阴影稳定帧**：先查看像素diff，再将稳定化后的actual帧用作该基线，并连续复验两次，随后14张整组复验通过。截图差异阈值未放宽。

## 命令与证据

- `npm test`
- `npm run typecheck`、`npm run build`
- Playwright相关功能清单与逐项结果：`tmp/composer-layout/final-e2e.log`、`final-layout-rerun.log`、`final-config-layout.log`
- 兼容用例和14张视觉整组复验：`tmp/composer-layout/final-compat-visual.log`
- 视觉初轮、更新、复验与稳定帧记录：`tmp/composer-layout/final-visual-*.log`
- 极窄栏实际截图：`tmp/composer-layout/e2e/side-280-config.png`

上述临时证据保留在独立工作树。Electron用例使用隔离配置、数据库和userData；模型回复来自共享mock。验收验证界面、协议接线及本地工具行为，不代表真实模型科研判断质量。
