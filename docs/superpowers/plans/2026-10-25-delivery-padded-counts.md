# 带空格计数字段比较补充

- [x] 为n_effective/count/sample_size/样本量的带空格表头补红测试，同时保持带空格测量字段的容差及原始表头差异断言。
- [x] 仅在字段角色推断前trim，保持原始表头身份与全部既有数字规则。
- [x] 复验交付模块、真实Python/Electron明确设置容差的场景及类型/构建，验证后独立提交合并本地main，不推送。

文件：src/delivery/verify.ts、tests/delivery/table-comparison.test.ts、e2e/delivery-table-parser.spec.ts。此项补齐严格解析与原精确数值策略的交互，不改变显示或协议。
