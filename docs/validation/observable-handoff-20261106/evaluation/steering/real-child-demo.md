# 实时纠偏实际子进程演示

本地确定性推理，只替换模型回复。运行安装的 Pi SDK、真实子进程和 bash。

- 慢工具执行期间 accepted；工具完成之后真实 user message_start 才 applied。
- 相同请求 ID 重发只返回原回执。
- 结果包含 corrected-blue。
- 第二个子任务在慢工具中接收纠偏后点名取消，回执 interrupted，工具进程已退出，未产生后续文件。
- 请求数：3；完整时序及回执见 real-child-demo.json。
