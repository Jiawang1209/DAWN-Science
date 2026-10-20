# M1首批验收：解释器保存错误原位提示

## 最终范围

用户要求优先使用已有报错机制，本批仅维护原设置的失败提示：保存解释器路径有问题时，对应字段显示一行红字，原始原因默认折叠；修改后撤下旧提示，正确保存后清除。不增加诊断区、检查按钮、常驻状态列表或新的配置流程。

功能代码仅修改 `src/ui/App.tsx`、`src/ui/Settings.tsx`、`src/ui/i18n/en.ts`。保留模型服务测试/弹窗、解释器检测/选择/保存、首启向导、内核、路线、Bot及产物交付；无协议、后端、样式、数据库或依赖版本改动。

## 证据

- TDD：`/tmp/dawn-interpreter-inline-red.log`中预期原位错误断言失败；实现后相关用例通过。
- 定向：`/tmp/dawn-interpreter-inline-focused.log`，5文件153项通过，含原设置、候选选择、双语和设计契约。
- 类型检查与构建：`/tmp/dawn-interpreter-inline-typecheck.log`、`/tmp/dawn-interpreter-inline-build.log`，退出0；构建保留既有chunk大小提示。
- 全量：`/tmp/dawn-interpreter-inline-full-tests.log`，440文件4,827项通过，10项原跳过，130.70秒。JSDOM canvas既有提示未算作功能错误。
- 实际Electron：`/tmp/dawn-interpreter-inline-e2e-final.log`，16项通过，58.2秒；覆盖原位错误/修正恢复/窄设置、首启、模型连通、环境、内核设置及科研交付。首次新测试误用了不存在的.footer定位，改用实际.statusbar后单独两项及最终16项均通过，未为通过测试改变产品行为。

## 实际预览

独立目录：`tmp/runtime-diagnostics-live-G14lwD/`，独立DB、配置、用户数据、技能/记忆/CLI目录，未更改安装版。

- `evidence/03-inline-error-final.png`：原输入框下的一行错误，默认收起详情。
- `evidence/04-corrected-final.png`：修正为本机现有路径后错误消失。
- `evidence/05-inline-error-dark.png`：暗色窄设置，错误行完整可见，横向溢出0。

预览通过真实保存与后端静态诊断触发；不安装包、不重启内核、不运行分析。模型相关自动验收使用共享mock，不表示本轮验证了真实模型连通或科研判断质量。

## 兼容与边界

字段错误只对应当前保存路径；按语言忽略迟到回执，保存一门语言不覆盖另一门。配置问题不再重复写入底栏，请求异常及首启仍沿用原有通知。错误回执只在当前窗口状态留存；本批不增加启动时自动检测或持久错误目录。

沿用既有静态检查能力，不宣称路径保存成功就代表内核/分析包可用；缺依赖仍由已有候选检测及运行错误机制反馈。

M0中恢复的锁定PDF依赖现已放回主目录node_modules实体目录，避免指向临时目录；旧失效链接保存在node_modules/.dawn-pdfjs-original-link。归档sha512与lockfile匹配，未改依赖声明或版本。

本地合并前基线为 `7d0da11a`；按用户授权提交、快进合并并复验，最终提交见开发历史及Git记录。保留独立分支、工作树与预览，不推送、不替换安装版，不开始M2。
