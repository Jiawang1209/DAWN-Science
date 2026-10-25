/** pi 的显式技能展开把正文放在用户消息前；权限只能由其后的原请求改变。 */
export function skillUserRequest(content: unknown): string {
  const text = typeof content === 'string' ? content : Array.isArray(content)
    ? content.flatMap((b: {type?: string; text?: string}) => b?.type === 'text' && typeof b.text === 'string' ? [b.text] : []).join('\n') : ''
  const expanded = /^<skill name="[^"\n]+" location="[^"\n]+">\r?\n[\s\S]*?\r?\n<\/skill>(?:\r?\n\r?\n([\s\S]+))?$/.exec(text)
  return expanded ? expanded[1] ?? '' : text
}
