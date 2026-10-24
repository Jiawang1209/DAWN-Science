import { suggestLatestPrompt } from './next-prompt.js'
import { fileURLToPath } from 'node:url'
import { connectDesktopCli, listDesktopHistory } from './desktop-client.js'
import { chooseCliHistory } from './history-picker.js'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { getEnvApiKey } from '@earendil-works/pi-ai/compat'
import { loadRegistryOrDefault } from '../config/loader.js'
import { createWorkbench } from '../electron/wiring.js'
import type { CredentialsPort } from '../workbench/backend.js'
import type { OPERATIONS } from '../protocol/index.js'
import type { SessionPermission, SessionPermissionValue } from '../protocol/permissions.js'
import type { SessionPlan } from '../protocol/planning.js'
import { executeApprovedPlan } from './planning.js'
type Op = keyof typeof OPERATIONS

/** Each CLI owns its database: startup reconciliation must not touch another live host. */
export async function openCliContext(agentId?: string, resume?: string | true) {
  const discovery = process.env.DAWN_CLI_DESCRIPTOR || (!process.env.DAWN_CLI_HOME ? fileURLToPath(new URL(import.meta.url.includes('/dist/cli/') ? './desktop.json' : '../../dist/cli/desktop.json', import.meta.url)) : undefined)
  if (discovery && (process.env.DAWN_CLI_DESCRIPTOR || existsSync(discovery))) {
    const descriptor = JSON.parse(readFileSync(discovery, 'utf8'))
    const resumeSessionId = resume === true ? await chooseCliHistory(await listDesktopHistory(descriptor, process.cwd())) : resume
    return connectDesktopCli(descriptor, process.cwd(), process.env.DAWN_TERMINAL_ID, agentId, resumeSessionId)
  }
  if (resume) throw new Error('历史恢复需要连接正在运行的 DAWN 桌面，请从 DAWN 内置终端使用 dawn --resume')
  const home = resolve(process.env.DAWN_CLI_HOME || join(homedir(), '.dawn', 'cli'))
  const configPath = resolve(process.env.DAWN_CONFIG || join(home, 'providers.yaml'))
  const registry = loadRegistryOrDefault(configPath)
  const native = Object.entries(registry.agents).filter(([, def]) => def.kind === 'native')
  const selected = agentId || process.env.DAWN_AGENT || native.find(([, d]) => d.kind === 'native' && getEnvApiKey(d.provider))?.[0] || native[0]?.[0]
  const def = selected ? registry.agents[selected] : undefined
  if (!selected || def?.kind !== 'native') throw new Error('请选择本地 API Agent：dawn --agent <配置里的名称>')
  const providers = [...new Set(native.flatMap(([, d]) => d.kind === 'native' ? [d.provider] : []))]
  const key = (provider: string) => (provider === def.provider ? process.env.DAWN_API_KEY : undefined) || getEnvApiKey(provider)
  if (!key(def.provider)) throw new Error(`尚未配置 ${def.provider} 的 CLI 凭证。请设置该服务的标准 API key 环境变量，或 DAWN_API_KEY；配置文件：${configPath}`)
  const credentials: CredentialsPort = {
    get: key, configured: () => providers.filter(p => Boolean(key(p))), isEncrypted: () => undefined,
    set: () => { throw new Error('CLI 凭证通过环境变量提供') },
    delete: () => { throw new Error('CLI 凭证通过环境变量提供') },
  }
  const directory = join(home, 'sessions', randomUUID())
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const workbench = createWorkbench({ configPath, dbPath: join(directory, 'workbench.db'), credentials,
    scratchRoot: join(directory, 'scratch'), skillsDir: join(home, 'skills'), agentsDir: join(home, 'agents'), memoriesDir: join(home, 'memories'),
    cliHome: home, ...(process.env.DAWN_MODELS_JSON ? { modelsPath: process.env.DAWN_MODELS_JSON } : {}),
  })
  const call = async <T = unknown>(operation: Op, input: unknown): Promise<T> => {
    const sessionId = (input as { sessionId?: string } | undefined)?.sessionId
    const response = await workbench.nativeRuntime.withTerminalReply(sessionId ?? '', () => workbench.server.handle(operation, input))
    if (!response.ok) throw new Error(response.error.message)
    return response.data as T
  }
  try {
    await call('setPermissionMode', { mode: 'ask-risky' })
    const task = await call<{ sessionId: string }>('createTask', { agentId: selected, workspace: process.cwd() })
    await call('acquireLease', { sessionId: task.sessionId, holder: 'user' })
    return { call, sessionId: task.sessionId, model: `${def.provider}/${def.model}`, directory, resumed: false,
      history: async () => ({ items: [], pictures: [], truncated: false }),
      suggest: () => suggestLatestPrompt(workbench.events.peek(task.sessionId)?.items ?? [], turnId => call<{ text: string }>('suggestNextPrompt', { sessionId: task.sessionId, turnId })),
      usage: async () => workbench.sessionUsage(task.sessionId),
      planning: async (enabled?: boolean) => {
        if (enabled !== undefined) await call('setSessionConfigOption', { sessionId: task.sessionId, configId: 'dawn.plan', value: enabled ? '1' : '' })
        return call<SessionPlan>('getSessionPlan', { sessionId: task.sessionId })
      },
      answerPlan: (planId: string, action: 'approve' | 'discard') => call<{ savedPath?: string }>('answerPlan', { sessionId: task.sessionId, planId, action }),
      executePlan: (planId: string) => executeApprovedPlan(task.sessionId, planId, (op, input) => call(op as Op, input)),
      permissions: async (value?: SessionPermissionValue) => {
        if (value !== undefined) await call('setSessionConfigOption', { sessionId: task.sessionId, configId: 'dawn.permission', value })
        return call<SessionPermission>('getSessionPermission', { sessionId: task.sessionId })
      },
      attach: (sink: import('../runtime/types.js').EventSink) => workbench.sessions.attach(task.sessionId, sink),
      waitForIdle: () => workbench.nativeRuntime.waitForIdle(task.sessionId),
      onExit: (_callback: () => void) => () => {},
      close: () => workbench.closeAsync(),
    }
  } catch (error) { await workbench.closeAsync(); throw error }
}
export type CliContext = Awaited<ReturnType<typeof openCliContext>>
