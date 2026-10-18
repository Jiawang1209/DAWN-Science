/** A replacement character can collapse distinct category labels into the same value. */
export function decodeDeliveryText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      "文本不是有效的 UTF-8；未读取或比较可能损坏的正文，请明确转换编码后重试。",
    );
  }
}
