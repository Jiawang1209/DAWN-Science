# 交付表格严格解析修复

目标：比较原始CSV/TSV/分号表格的字段身份、空记录和引号内换行；语法损坏不能重跑通过。预览仍沿用当前宽松展示。数字/类别既有精确比较与容差保持。

- [x] 新增失败回归：原始表头空格/预览占位名碰撞、丢失末尾空记录、引号内CRLF变化、未闭合及非法引号。
- [x] 新增仅供交付比较的严格记录解析器，复用现有分隔符检测，保留20,000行预算；原始表头不trim/替换，合法无名索引列保留。
- [x] 运行完整交付/预览解析测试；真实Python落盘状态及Electron同时验证差异失败、非法语法部分验证、正确数据通过。
- [x] 类型、构建及相关回归通过后独立提交、合并main并复验，不推送。

文件：src/delivery/comparison-table.ts、src/delivery/verify.ts、tests/delivery/table-comparison.test.ts、tests/delivery/verify.test.ts、e2e/delivery-table-parser.spec.ts。非法CSV以可读原因标记未比较，复用现有partial规则，不伪造失败/成功。
