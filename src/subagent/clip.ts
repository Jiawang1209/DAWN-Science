/**
 * 按字节上限裁剪，但切在字符边界（①-B″ · S1 原在 `executor.ts`；2026-09-27 搬出来，子进程截工具结果也用它）。
 * 按字节硬切会切出半个汉字；`toString` 会把结尾不完整的多字节序列变成替换字符，逐个退到干净为止。
 */
export function 按字节截(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf8")
  if (buf.byteLength <= maxBytes) return text
  let end = maxBytes
  let out = buf.subarray(0, end).toString("utf8")
  while (end > 0 && out.endsWith("�")) {
    end--
    out = buf.subarray(0, end).toString("utf8")
  }
  return out
}
