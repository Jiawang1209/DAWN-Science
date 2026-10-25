# 2026-10-25 全仓审查问题逐项修复记录

用户授权每项独立分支，修复、验证后仅合并本地 main，再开启下一项。原审查基线 516f7486；原始报告与失败证据保留于 /Users/liuyue/Documents/Codex/2026-10-25/dawn-science-code-review/。

| 项目 | 已交付行为 | 修复提交 | 详细证据 |
|---|---|---|---|
| F1 定时提前成功 | 按完整请求 idle 结算，保留模型失败/取消/超时与最终摘要 | b4d587a2 | 2026-10-25-schedule-completion-verification.md |
| F2 交付核验误判 | 保留 CSV 身份与 JSON 数值原文，整数与已识别类别精确比较，防止精度折叠 | 6cbd5401 | 2026-10-25-delivery-comparison-verification.md |
| F3 SSH 启动取消 | 启动资源可取消，读私钥晚到/旧事件/旧 finally 不影响后继连接 | aa97562c | 2026-10-25-ssh-connect-cancellation-verification.md |
| F4 内核启动清理 | 等待晚到实例回收，旧队列不执行，Native stop 等待，退出计入启动中资源 | 3481f708 | 2026-10-25-kernel-startup-cleanup-verification.md |
| F5 设置长路径 | 保留说明和按钮空间，路径省略，窄窗单列，右栏设置保持 | f2b51321 | 2026-10-25-settings-path-layout-verification.md |
| F6 旧 E2E 契约 | 最小侧栏、操作列、文件菜单、独立搜索及远端恢复与当前契约对齐，保留目标行为断言 | 待提交补记 | 2026-10-25-e2e-contract-alignment-verification.md |

每项均有独立设计/计划、变更历史、验证日志与合并后主目录复验记录；各项日志及截图位于 /Users/liuyue/Documents/Codex/2026-10-25/dawn-science-fixes/ 下对应目录。功能分支保留，未推送、未发布、未替换安装版。

## 最终检查

最终应用源码的全量 Vitest：499 文件，5289 项通过、10 跳过（114.18 秒）。22 文件 130 项不同 Electron 用例已分批通过并按清单去重；另 2 项真实 Python 内核串行通过（9.2 秒）。类型与完整构建通过。中间失败及覆盖清单均保留；main 集成复验另记。

## 验证边界

- 当前 Electron 候选总数 838（208 文件）；本轮使用问题及相关主路径的选择集，不将选择集通过描述为全量 Electron 已通过。
- 真实构建、真实 IPC/数据库/文件及独立 Python 进程；模型和 SSH 对端采用共用确定性 mock。真内核验收使用本机既有 dawn-spike Python，检查旧标记未写与 PID 退出。
- 表格/JSON 的整数及不能安全表示的小数采用保守精确比较；未加入任意字段角色协议。未知名称的小数类别需选择零容差，不宣称科学结论已验证。
- 没有验收 Windows/Linux 真机、安装包升级、签名、公证或线上 CI；来源链、共享工作区隔离、跨重启变量持久性等架构议题不由本次缺陷修复自动补齐。
- 其他未纳入本轮的历史 E2E 仍需逐份核实；例如静态查看到 sidebar-columns、remote-kernel 留有旧服务器入口，本轮未执行，不把它们记为通过。
