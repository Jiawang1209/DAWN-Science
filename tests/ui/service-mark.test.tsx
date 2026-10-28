import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ServiceMark } from '../../src/ui/service-mark.js'
import { serviceMarkBrand } from '../../src/ui/service-mark-catalog.js'
import { SERVICE_MARK_ASSETS } from '../../src/ui/service-mark-assets.js'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

it('DeepSeek 用鲸鱼，Kimi/Moonshot 用 K；按实际服务识别而非所托管模型名', () => {
  const { container, rerender } = render(<ServiceMark provider="deepseek" label="DeepSeek" />)
  expect(container.querySelector('[data-service-mark="deepseek"] svg path')).toBeTruthy()
  rerender(<ServiceMark provider="moonshot" label="月之暗面" />)
  expect(container.querySelector('[data-service-mark="kimi"]')?.textContent).toBe('K')
  rerender(<ServiceMark provider="custom" label="Research" />)
  expect(container.querySelector('[data-service-mark="initial"]')?.textContent).toBe('R')
  rerender(<ServiceMark provider="openrouter" label="DeepSeek" />)
  expect(container.querySelector('[data-service-mark="openrouter"] .service-mark-icon')).toBeTruthy()
  expect(container.querySelector('[data-service-mark="deepseek"]')).toBeNull()
})

it('名称兼容大小写和空格；空名称安全回退，图标不重复读出', () => {
  const { container, rerender } = render(<ServiceMark label=" deepseek " />)
  expect(container.querySelector('[data-service-mark="deepseek"]')?.getAttribute('aria-hidden')).toBe('true')
  rerender(<ServiceMark label="Kimi" />)
  expect(container.textContent).toBe('K')
  rerender(<ServiceMark />)
  expect(container.textContent).toBe('?')
})

const catalog = {
  'amazon-bedrock': 'bedrock', 'ant-ling': 'ling', anthropic: 'anthropic', 'azure-openai-responses': 'azure',
  baseten: 'baseten', cerebras: 'cerebras', 'cloudflare-ai-gateway': 'cloudflare', 'cloudflare-workers-ai': 'cloudflare',
  deepseek: 'deepseek', fireworks: 'fireworks', 'github-copilot': 'copilot', google: 'gemini', 'google-vertex': 'google',
  groq: 'groq', huggingface: 'huggingface', 'kimi-coding': 'kimi', minimax: 'minimax', 'minimax-cn': 'minimax', mistral: 'mistral',
  moonshotai: 'kimi', 'moonshotai-cn': 'kimi', nvidia: 'nvidia', openai: 'openai', 'openai-codex': 'openai',
  opencode: 'opencode', 'opencode-go': 'opencode', openrouter: 'openrouter', 'qwen-token-plan': 'qwen',
  'qwen-token-plan-cn': 'qwen', 'qwen-token-plan-individual': 'qwen', together: 'together', 'vercel-ai-gateway': 'vercel',
  xai: 'xai', xiaomi: 'xiaomimimo', 'xiaomi-token-plan-ams': 'xiaomimimo', 'xiaomi-token-plan-cn': 'xiaomimimo',
  'xiaomi-token-plan-sgp': 'xiaomimimo', zai: 'zai', 'zai-coding-cn': 'zai',
}
it.each(Object.entries(catalog))('内置入口 %s 识别为 %s，且有实际图标或明确的 K 标识', (provider, brand) => {
  expect(serviceMarkBrand(provider)).toBe(brand)
  if (!['deepseek', 'kimi'].includes(brand)) expect(SERVICE_MARK_ASSETS[brand]).toBeTruthy()
})

it('没有找到素材的 Radius 和自定义服务保持首字母；常见额外服务有本地图标', () => {
  expect(serviceMarkBrand('radius')).toBeUndefined()
  const { container } = render(<ServiceMark provider="radius" label="Radius" />)
  expect(container.textContent).toBe('R')
  for (const name of ['cohere', 'doubao', 'hunyuan', 'ollama', 'perplexity', 'siliconflow', 'stepfun', 'volcengine', 'claude-code-acp']) {
    expect(SERVICE_MARK_ASSETS[serviceMarkBrand(name)!]).toBeTruthy()
  }
})

it('本地矢量与注明版本和散列的来源清单一致，不引入脚本或外链', () => {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../docs/licenses/provider-marks-sources.json'), 'utf8'))
  expect(manifest.assets).toHaveLength(42)
  for (const asset of manifest.assets) {
    const svg = readFileSync(resolve(import.meta.dirname, `../../src/ui/brand-assets/${asset.brand}.svg`), 'utf8')
    expect(createHash('sha256').update(svg).digest('hex')).toBe(asset.sha256)
    expect(svg).not.toMatch(/<script|<foreignObject|\son\w+=|(?:href|src)=["']https?:/i)
    expect(new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')).toBeNull()
  }
})
