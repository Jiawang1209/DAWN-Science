/** 输入框的内核快捷入口。界面和主进程共用，不依赖 Node。 */
export type 快捷语言 = "R" | "python"
export const 内核快捷们 = [
  { token: "RPython", languages: ["R", "python"], description: "使用 R 或 Python 内核运行代码" },
  { token: "R", languages: ["R"], description: "使用 R 内核运行代码" },
  { token: "Py", languages: ["python"], description: "使用 Python 内核运行代码" },
] as const

export function 认内核快捷(token: string) {
  return 内核快捷们.find(x => x.token.toLowerCase() === token.toLowerCase())
}

/** 附在模型收到的消息末尾；界面转录仍只保留原话。 */
export function 内核请求标记(languages: readonly 快捷语言[]): string {
  return `<run-code-request languages="${languages.join(",")}">\n` +
    `本次任务请使用 run_code 实际运行代码，允许的语言：${languages.join("、")}。` +
    "使用本会话已配置的解释器；不要改用 bash、另选解释器或只给未执行的代码。" +
    "需要两种语言配合时分别调用，两台内核的变量不互通。" +
    "解释器未配置或内核启动失败时如实说明；任务不明确时先询问。" +
    "若当前处于生成方案阶段，先遵守方案审批流程，不提前执行。\n</run-code-request>"
}

/** 按已经送达的最后一条用户消息读取，不读取待发单，也不沿用上一轮选择。 */
export function 本轮内核语言(messages: readonly unknown[]): readonly 快捷语言[] | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { role?: string; content?: unknown }
    if (message.role !== "user") continue
    const text = typeof message.content === "string" ? message.content : Array.isArray(message.content)
      ? message.content.filter((b): b is { type: "text"; text: string } => b?.type === "text" && typeof b.text === "string").map(b => b.text).join("\n")
      : ""
    const tail = text.slice(text.lastIndexOf("<run-code-request languages="))
    const m = /^<run-code-request languages="(R|python|R,python)">[^]*<\/run-code-request>\s*$/.exec(tail)
    return m ? m[1]!.split(",") as 快捷语言[] : undefined
  }
  return undefined
}
