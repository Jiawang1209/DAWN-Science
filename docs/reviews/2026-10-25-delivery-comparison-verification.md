# 交付比较误判修复验证

用户授权：codex/delivery-comparison 独立修复、验证、合并本地 main，再另开分支处理下一项。基线 de6ebf84；主目录保持 main，开发位于独立 worktree。

## 行为与边界

CSV 编号/文本和前导零不再经过 Number 折叠；已识别编号/编码/类别/分组/标签字段精确匹配；样本量精确数值比较。JSON 用运行时 reviver context.source 保留数值原文，数组与对象类型也必须一致。十进制规范比较先于 Number；即使零容差，大整数末位、高精度小数和下溢值也不会丢失后再被判同。

无字段角色协议时，任一侧为整数的数值差异采用精确比较；其他小数沿用原相对容差公式。不能忠实往返 Number 的十进制原文也采用精确比较。此规则较保守：整数形式的连续测量值差异仍会失败，高精度数值不会因为用户给出容差就忽略差异。未构建任意语义字段识别器；未知名称的小数类别仍需使用零容差。UI 中英文已如实说明默认规则；没有新增协议操作或依赖。

## 验证证据

- 原 compare 基线 3 项通过。新增比较回归 23 项，其中首轮复现 18 项误判；自审补充 JSON 数组/对象两项先失败后修正。26 项比较回归全部通过。
- 新增 3 项 DeliveryService + 真实 /usr/bin/python3 独立进程回归：进程 exit 0 但编号/类别变化必须 failed，保留原参照、重跑输出、verification.json 与持久记录。
- 最终 delivery / UI / 后端 / 翻译定向：8 文件 70 项通过；类型检查、完整 Electron / CLI / UI 构建通过。
- 最终全量：497 文件，5272 项通过、10 跳过，102.87 秒。原有 jsdom canvas 提示与大 chunk 构建提示保留，无失败。
- 真实 Electron：e2e/analysis-delivery.spec.ts 5 项通过，19.0 秒；含原正常重跑与缺项部分验证，新增前导零、大整数及类别变更。界面显示“运行验证失败”，原 CSV 未改写；失败状态截图已实际查看。模型服务为共用确定性 mock，Python 文件与比较入口真实执行；没有验证真实供应商的科研解读能力或跨平台安装包。
- 首次 Electron 运行因新增断言错用“核验失败”而主动中断，修正为现有实际文案“运行验证失败”后全部通过；最后一次构建与复验涵盖 JSON 类型修正。
- 最后自审：保留全部行/表头/行序检查，不改变既定容差上限；不混淆数字与字符串、数组与对象；原文缺失时明确未比较；未使用 Number 对不安全整数判同。

原始日志、3 张截图和源文件 SHA256：/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-fixes/delivery-comparison/。red.log、json-type-red.log 为失败证据，focused-final.log、typecheck-final.log、build-final.log、full-final.log、e2e-final.log 为最终验证。源文件哈希已在提交前核对一致。

## 本地集成

修复提交 6cbd5401 已从 de6ebf84 快进合并本地 main。主目录重新 typecheck / 完整 build 通过，定向 8 文件 70 项通过（2.83 秒），真实 Electron 5 项通过（18.5 秒）；main-typecheck.log、main-build.log、main-focused.log、main-e2e.log 保存于同一证据目录。代码树与修复分支一致。仅本地提交/合并，不推送、不替换已安装应用。下一项 SSH 握手期间断开的资源清理使用新分支 codex/ssh-connect-cancellation。
