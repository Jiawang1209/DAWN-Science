/** Parse only the generated outer envelope, leaving user/source lookalikes inside intact. */
export function splitLinkedScriptPrompt(text: string): { instruction: string; context: string; label: string } | undefined {
  const ending = /\n\n<!-- dawn-linked-script-end:([A-Za-z0-9_-]{1,128}) -->$/.exec(text)
  if (!ending) return undefined
  const id = ending[1]!
  const prefix = `\n\n<!-- dawn-linked-script:${id}:`
  const from = text.indexOf(prefix)
  if (from < 0 || text.indexOf(prefix, from + prefix.length) !== -1) return undefined
  const labelFrom = from + prefix.length
  const labelTo = text.indexOf(' -->\n\n', labelFrom)
  if (labelTo < 0) return undefined
  const context = text.slice(labelTo + ' -->\n\n'.length, ending.index)
  if (!context.endsWith(`<!-- dawn-script-edit:${id} -->`)) return undefined
  try { return { instruction: text.slice(0, from), context, label: decodeURIComponent(text.slice(labelFrom, labelTo)) } }
  catch { return undefined }
}

