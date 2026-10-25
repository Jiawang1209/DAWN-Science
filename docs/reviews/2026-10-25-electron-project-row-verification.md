# 剩余 Electron · 项目单行验证

基线715570a4，独立codex/electron-project-row，复用隔离工作目录，只修改project-bulk及文档。后续27通过后旧行高<40断言遇到48失败；已查看失败截图确为单行，DESIGN主入口和CSS明确项目/服务器48px行高。

明确按现行48px验收行高，另用实际项目名Range验证仅一行。无常驻路径/计数sub、悬停完整项目名/路径图标/1段对话均保留，不通过单纯扩大上界替代单行检查，不改产品、超时或截图基线。

整份project-bulk6/6通过（12.7秒），相关项目动作/侧栏/设计契约3文件109/109及类型通过；git diff --check和自审通过。应用源码与已验证构建一致。主目录集成复验另记。

证据：/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-remaining-electron/project-row/，原始失败截图/trace见run-18-results，最终run-19.json。未推送。
