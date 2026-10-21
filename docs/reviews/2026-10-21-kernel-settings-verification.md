# 内核设置预览核验

分支：codex/kernel-settings-review；基线：ee1b7690。用户要求查看上一轮布局建议的实际效果，并已明确认可实际预览，授权复核后提交并合并本地main，继续不推送。

Python/R各一组：状态与描边检测按钮在上，唯一路径及主题色保存按钮居中，依赖说明在下。检测候选选择只更新路径草稿，保存后才调用原配置动作。共享选择器默认模式仍选中即用，首启及远程入口未更改。

| 检查 | 结果 |
| --- | --- |
| 新回归先红 | 旧实现3项失败，复现重复手填入口、缺少分组和检测错误出口 |
| 相关单测 | 5文件155项通过，含3项新回归及原选择器、设置、i18n、设计契约 |
| 合并前全量测试 | 450文件4897项通过，10项跳过，100.34秒 |
| 类型检查 | 合并前重新执行npm run typecheck通过 |
| 构建 | 合并前重新执行npm run build通过；保留既有大块体积提示 |
| 预览Electron | 新内核设置及既有Jupyter路径清单2项通过，5.3秒 |
| 合并前Electron | 内核设置、Jupyter路径清单和设置栏全部11项通过，33.3秒 |
| diff | git diff --check通过 |

Electron用例通过真实点击验证每门语言唯一输入、保存回写、保存后禁用、清空回写和最窄侧栏。保存使用隔离目录中的普通标记文件，仅校验路径存在，不执行标记文件或启动内核。候选只填草稿、检测失败保留路径和错误原话由组件测试验证；本轮未执行真实本机探测、真实Python/R内核或SSH操作。

实际预览加载本分支dist，复用此前独立临时配置、数据库、userData和本机假模型/发布源，与生产配置隔离。已检查亮暗、整页及最窄侧栏，输入/保存键完整可见，无横向溢出。窗口最终停在亮色整页内核分类，Python/R均未配置。状态“已配置”仅代表路径已保存，未承诺内核包可用。

截图与参数见[artifacts/kernel-settings](../../artifacts/kernel-settings/)，局部图为preview-content.png。主工作区main仍保持ee1b7690，本次工作不含main变更。

最终核验命令：`npm test`、`npm run typecheck`、`npm run build`、`npx playwright test e2e/kernel-settings.spec.ts e2e/kernels.spec.ts e2e/settings-column.spec.ts`及`git diff --check`全部通过。设置栏回归覆盖分类进退、整页展开/收回、原坞恢复、关闭及各分类默认宽度无溢出。按用户授权执行本地提交和快进合并，main集成核验另补于文末。

## main集成核验

用户确认后，功能提交`d14ff13b`已从`ee1b7690`快进合并本地main。主工作区重新完整构建通过；相关5文件155项通过（1.99秒）；基于main构建的内核设置及Jupyter路径清单真实Electron2项通过（4.2秒）。不推送、不替换安装版，保留已验收工作树及隔离预览。参数见`artifacts/kernel-settings/main-integration.json`。新一轮设置展示研究独立开分支，保留分类内部内容和排版，仅讨论进入与切换方式。
