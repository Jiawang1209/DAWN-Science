# 原生网页宽度/位置验证

基线41ac3f0c，独立codex/electron-web-preview-bounds。原run-55期待增宽>100，实际456→520，原因是当前292px侧栏下窄窗口把坞夹到544。用例改为先1600px真实内容窗，保留写620偏好并重载及>100增宽断言；增加初始/加宽/缩1280的原生WebContentsView bounds与DOM slot四维零差，并确认缩窗收回。不改产品或夹边逻辑/超时。

完整web-preview 13/13（28.5秒），包括懒建、本机导航、浮层/agent旁观显隐、外网导航入口、安全拒绝、下载/账本；坞状态组件1文件27项、类型通过。自审/diff检查通过。证据：/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-remaining-electron/web-preview-bounds/、run-55红/run-56绿。实际本机HTTP页面与原生视图已运行；外网案例仅证明开始导航，不宣称公共网站加载成功。按授权本地合并，不推送。
