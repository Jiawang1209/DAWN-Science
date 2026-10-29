import type { ImageContent, TextContent } from '@earendil-works/pi-ai'
import { getImageDimensions } from '@earendil-works/pi-tui'
import { resizeImage } from '@earendil-works/pi-coding-agent'

export interface McpModelResult {
  content: (TextContent | ImageContent)[]
  isError: boolean
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_IMAGES = 8
const supported = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
const visible = (block: Record<string, unknown>) => {
  const audience = record(block.annotations).audience
  return !Array.isArray(audience) || audience.includes('assistant')
}

function imageMime(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return undefined
}

/** Model projection only. Never fetch links, execute resources, or copy App-only metadata. */
export async function projectMcpResult(raw: unknown): Promise<McpModelResult> {
  const result = record(raw)
  const content: McpModelResult['content'] = []
  const text = (value: string) => content.push({ type: 'text', text: value })
  let imageCount = 0, totalImageBytes = 0
  for (const value of Array.isArray(result.content) ? result.content : []) {
    const block = record(value)
    if (!visible(block)) continue
    switch (block.type) {
      case 'text':
        if (typeof block.text === 'string') text(block.text)
        break
      case 'image': {
        try {
          if (!supported.has(String(block.mimeType))) throw new Error('不支持的图片格式')
          if (imageCount >= MAX_IMAGES) throw new Error(`超过 ${MAX_IMAGES} 张图片上限`)
          if (typeof block.data !== 'string' || block.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4
            || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(block.data)) throw new Error('图片过大或 base64 无效')
          const bytes = Buffer.from(block.data, 'base64')
          if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || totalImageBytes + bytes.length > MAX_TOTAL_IMAGE_BYTES) throw new Error('图片字节数超过上限')
          const mimeType = imageMime(bytes)
          if (!mimeType) throw new Error('无法识别图片内容')
          const dimensions = getImageDimensions(block.data, mimeType)
          if (!dimensions || dimensions.widthPx <= 0 || dimensions.heightPx <= 0 || dimensions.widthPx * dimensions.heightPx > 40_000_000) throw new Error('图片尺寸无效或超过 4000 万像素')
          const image = await resizeImage(bytes, mimeType, { maxWidth: 2048, maxHeight: 2048, maxBytes: Math.ceil(MAX_IMAGE_BYTES / 3) * 4 })
          if (!image) throw new Error('图片解码或缩放失败')
          const outputBytes = Buffer.byteLength(image.data, 'base64')
          if (totalImageBytes + outputBytes > MAX_TOTAL_IMAGE_BYTES) throw new Error('图片总字节数超过上限')
          totalImageBytes += Math.max(bytes.length, outputBytes)
          imageCount++
          content.push({ type: 'image', data: image.data, mimeType: image.mimeType })
          if (image.wasResized) text(`（MCP 图片模型副本已从 ${image.originalWidth}×${image.originalHeight} 缩放至 ${image.width}×${image.height}，细节可能丢失；原始结果未修改。）`)
        } catch (error) {
          text(`（MCP 图片未送入模型，未进行视觉检查：${error instanceof Error ? error.message : String(error)}。）`)
        }
        break
      }
      case 'resource_link':
        text(`MCP resource link: ${JSON.stringify({ uri: block.uri, name: block.name, description: block.description, mimeType: block.mimeType })}`)
        break
      case 'resource': {
        const resource = record(block.resource)
        if (!visible(resource)) break
        text(`MCP embedded resource: ${JSON.stringify({ uri: resource.uri, mimeType: resource.mimeType, text: resource.text })}`)
        if (resource.blob !== undefined) text('（嵌入的 binary 资源未送入模型。）')
        break
      }
      default:
        text(`（不支持的 MCP 内容块 ${String(block.type ?? 'unknown')} 未送入模型。）`)
    }
  }
  if (result.structuredContent !== undefined) {
    const structured = JSON.stringify(result.structuredContent)
    const duplicate = content.some(block => {
      if (block.type !== 'text') return false
      try { return JSON.stringify(JSON.parse(block.text)) === structured } catch { return false }
    })
    if (!duplicate) text(`MCP structuredContent: ${structured}`)
  }
  if (!content.length) text('（这次调用没有模型可见的内容。）')
  return { content, isError: result.isError === true }
}
