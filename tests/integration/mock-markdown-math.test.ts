import { expect, it } from 'vitest'
// @ts-expect-error Shared development and Electron inference fixture.
import { startMockInferenceServer, CANNED_REPLY } from '../../scripts/mock-inference-server.mjs'
// @ts-expect-error Shared deterministic Markdown fixture.
import { MATH_REPLY } from '../../scripts/mock-markdown-math.mjs'

async function response(content: string, system = '') {
  const server = await startMockInferenceServer()
  try {
    const res = await fetch(server.url + '/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-flash', stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content }] }),
    })
    return (await res.json()).choices[0].message.content
  } finally { await server.close() }
}

it('a worktree path containing markdown does not turn an ordinary request into the Markdown demo', async () => {
  expect(await response('请说一句话', '工作目录：/worktrees/markdown-math/dawn-science')).toBe(CANNED_REPLY)
})

it('the explicit math request returns the same fixture for Electron and dev:mock', async () => {
  expect(await response('数学公式排版验收')).toBe(MATH_REPLY)
})
