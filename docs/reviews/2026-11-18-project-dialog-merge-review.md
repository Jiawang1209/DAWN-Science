# 新建项目弹窗效果与合并复核

日期：2026-11-18。结论：未发现本次改动的阻塞缺陷，已本地合并main，合并后复查通过。

## 源码与实际效果

功能提交`b0082a26`，补充回归提交`4d65bddd`；原main为`6c5a2b7e`。两边工作区干净，使用`git merge --ff-only`无冲突合并。添加本报告前，main与功能分支代码树完全一致。

检查简洁/展开两态、目录预览、收起保留选择、取消添加清空选择、原生目录选择器接线及路径预览。Agent Context输入和自定义请求字段已移除；预览与磁盘创建共用现有9个科研目录常量。确认前不写目录，普通项目保持空目录，取消不创建项目，重复目录拒绝且保留已有文件，创建失败保留表单。

源码复核没有发现需要修复的业务问题。本轮补充英文320px暗色窗口回归，检查所有输入/按钮不横向溢出、目录内容可滚动、底部确认按钮可见以及Escape关闭。已查看真实Electron亮色展开和英文窄窗截图，没有更新视觉基线或放宽断言。

## 合并前验证

- 全UI：244文件、2359测试通过。
- 磁盘创建/回滚/目录保护：22测试通过。
- typecheck、完整build和secret guard通过。
- project-create、app-home、science-layout实际Electron：10通过，无跳过。覆盖首页/四步引导/工作台衔接、原生目录选择器、完整科研目录一致、取消/重复目录保护、说明/收藏/重命名持久化、首轮工作目录，以及坞内原有初始化入口。

## main复查

- project-dialog、design-contract、i18n、project/create：4文件、139测试通过。
- typecheck、完整build和secret guard通过。
- 同一组Electron在main新构建产物上重新运行：10通过，无跳过。
- 保留既有构建direct-eval/大chunk提醒与UI Canvas环境提醒，不将其写成新增失败或调整配置掩盖。

日志：`/tmp/dawn-project-review-{ui,create,types,build,secrets,electron}.log`与`/tmp/dawn-project-main-review-{tests,types,build,secrets,electron}.log`。

main截图：`/Users/liuyue/.codex/visualizations/2026/11/15/01a1dd44-1bf3-7981-9109-f81e832a348e/dawn-project-dialog-merge-20261118/`，包含简洁、科研预览、英文320px暗色状态。

运行边界：只在macOS本地Electron与隔离profile/配置/DB/workspace及假模型内测试，未读取真实API Key或修改正式App配置和数据。原标准科研布局自动约定及协议兼容保持。未声称真实模型、远端服务、Windows/Linux或全后端验收。此次只本地合并，没有推送、发布或替换安装版。此前实现阶段报告记录的是分支当时状态，本报告记录合并后的结论。
