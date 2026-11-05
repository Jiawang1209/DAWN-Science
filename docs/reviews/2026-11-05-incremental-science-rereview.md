# 增量科研编排：合并前复审

用户本轮授权：重点复用失效、可执行验收、执行者冻结、取消、产物锁及恢复；发现问题修复补测，确认无阻塞后本地提交并合并main；不推送、不发布，最后展示实际效果。基线main为ce5ae5dd；实现保留在codex/incremental-science-acceptance专项worktree，按授权验证后集成，不清理历史分支/证据，不替换安装应用。

## 已复现并修复

| 问题 | 结果 |
|---|---|
| runpy读取未声明helper却签发复用证明 | 受控CPython增加文件审计；TaskTools与Native传完整冻结路径，执行证明必须有dependencyBound；未声明读取、目录/元数据依赖及未支持的文件搬移保守无证明。已声明内容读取可绑定，依赖mtime即使文件声明也无证明。 |
| 短命中介的后台孙进程已reparent，临时PPID树无法排空 | 同步受控模式在标准创建/替换进程API之前拒绝，不依靠事后树快照认定完成。覆盖subprocess、fork、posix_spawn、exec及Windows公开启动事件族。普通执行保持原能力，无此复用证明。 |
| runpy返回即SIGKILL跳过正常线程/atexit输出 | 在握手前按CPython顺序等待non-daemon线程和退出回调；线程/atexit期间Abort、timeout均无迟到写入且无证明。 |
| 执行提示里的步骤标题/用户notes/blockers没进签名 | 签名及提示共用科学语义。只过滤宿主标记和其自动历史说明，实际Pi验证方法备注失效、重复采用与单项输入变化均正确。 |
| 宽松CSV预览把1"2"转换12，宿主误认证 | 保留预览兼容；完整数值验收额外检查严格quote状态，不合法字段开引号或闭引号后的字符直接受阻。 |
| 新工具参数对普通会话frozenTask为空未保护 | 修复第5实参条件默认[]；原普通主会话bash执行、证据重置、取消和preflight测试通过。 |
| Python3.9 pathlib把包装后的函数当descriptor，多出self | 元数据适配器改无function descriptor的callable对象；保留真实pathlib写入/查询行为，未声明依赖仍无证明。 |
| 系统自动记账使新签名过度失效 | 仅排除带有效science-pipeline标记的固定注记和执行/审查历史，用户任意普通备注保留。真实批次对照重新通过。 |

原执行者定义同份冻结、公共快照剥离内部正文、源身份与修订复查、等待共享占用后复查取消/路线、attempt fencing、历史内容版本复核、固定宿主汇总和路线CAS在本轮未发现额外阻塞，相关回归纳入最终检查。

## 复验与范围

两位独立只读reviewer分别检查依赖/契约/冻结与取消/锁/恢复。最后依赖复验5文件72项通过，进程边界复验2文件21项及真实execv/shutdown取消探针通过，无剩余重要阻塞。主代理保留各轮真红/真绿证据，而非只根据静态意见改代码。

Windows进程入口按 [CPython官方审计事件表](https://docs.python.org/3/library/audit_events.html) 补齐拒绝逻辑，并通过sys.audit事件契约测试；未进行Windows实机进程验证。该机制限定受控CPython同步执行，不承诺OS sandbox或对恶意/native代码的隔离。R仍可普通执行和结构/数值验收，暂不签发尚未核实的依赖/生命周期复用证明。普通shell也不冒充已证明环境。

## 最终检查

证据目录：[incremental-science-rereview-20261105](../validation/incremental-science-rereview-20261105/)。

- 类型检查：[typecheck-final.txt](../validation/incremental-science-rereview-20261105/typecheck-final.txt)。
- 完整构建：[build-final.txt](../validation/incremental-science-rereview-20261105/build-final.txt)。
- 全量测试：[unit-final.txt](../validation/incremental-science-rereview-20261105/unit-final.txt)，冻结源码630文件全部通过，6246项通过、11跳过；无未处理异常。
- 原5对及增量对照：[evaluation-final.txt](../validation/incremental-science-rereview-20261105/evaluation-final.txt)、[增量报告](../validation/incremental-science-rereview-20261105/evaluation/incremental.md)。新路线约束场景单独记录，非真实模型质量/费用实验。
- 真实Electron主路径：[electron-final.txt](../validation/incremental-science-rereview-20261105/electron-final.txt)。推理来自localhost确定性夹具，Pi/Python、Bot/SQLite、文件与宿主验收真实执行。
- 冻结清单：[source-manifest.json](../validation/incremental-science-rereview-20261105/source-manifest.json)。提交前复核无源码漂移。

## 本地集成

合并前类型检查、完整构建、全量630文件/6246项（11跳过）、7个Electron场景、原5对及10条增量评测均通过；1469个源码/脚本/测试/配置清单复核无漂移。用户已授权，下一步本地提交并快进合并main；合并后证据单独追加。无推送、发布、标签或安装应用替换。
