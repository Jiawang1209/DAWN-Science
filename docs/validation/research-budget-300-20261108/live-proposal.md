# 已授权300次真实复验

用户明确要求将请求数由30设为300。本轮只做同一个carbon-missing自制任务一次单/多对照；当前受支持模型deepseek/deepseek-flash，模型设置、科学方法、单位、验收、权限与工具均不改。

新轮总上限300、单/多各150，工作110（规划计入）、独立审阅40不可借用；每组30分钟，单请求90秒。完成即停止，不必用满，无SDK自动重试、无整组重跑。旧26次作为独立旧报告保留，不混算为新轮模型效果或重复计数。候选及旧报告冻结；不与重测试并跑。

代码只扩展评测预算入口；没有为普通DAWN任务增加新的300次限制。默认入口仍30，显式尾参300时启用已授权新轮。

```sh
npm run evaluate:science -- --research-current-api docs/validation/research-budget-300-20261108/live-01 '/Users/liuyue/Library/Application Support/dawn-science' deepseek deepseek-flash automatic-plan 300
```

正式profile只读，宿主使用系统临时userData与自制任务目录，不安装、不替换正式App，不提交/合并、推送、发布。系统钥匙串需人工允许时只在系统提示输入；聊天不接收密码。历史退出与PTY问题保持OPEN，原退出阈值不变。
