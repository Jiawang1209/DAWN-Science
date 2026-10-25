# 首启向导优化入口验收

基线main0f9f578d，独立codex/electron-setup-wizard；用户授权剩余Electron逐项修复/验证后本地合并，不推送。

后续批次23通过后，跳过向导用例寻找常驻优化button失败。DESIGN 2026-10-20已将优化/档位移入添加内容菜单，现有enhance用例也从menuitem访问。setup-wizard三处旧检查仍查button。

只改本验收为主区添加内容→优化输入menuitem可见且有子菜单语义，再Escape关闭/焦点返回，分别覆盖跳过后的首页、原样默认配置填key后的首页及首轮native回复后。保留向导重新入口、凭证门槛、解释器只检不装、假服务key验证、原样配置实际native回复/agentId等断言，不点击执行优化或改产品。
