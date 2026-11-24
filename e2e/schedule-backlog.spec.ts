import Database from 'better-sqlite3'
import { ScheduleStore } from '../src/store/schedules.js'
import { 造手动运行 } from '../src/schedule/domain.js'
import { test, expect, 在项目里开会话 } from './fixtures.js'

test('较早排队的定时运行在500条较新历史之外仍能从真实调度器执行', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const id = await page.evaluate(async workspace => {
    const invoke = async (op: string, request: unknown): Promise<any> => {
      const result = await window.dawn!.invoke(op, request)
      if (!result.ok) throw new Error(JSON.stringify(result.error))
      return result.data
    }
    const { agents } = await invoke('getProviders', {})
    const definition = await invoke('createSchedule', { name: '排队恢复回归', prompt: '检查排队数据', agentId: agents.find((a: { kind: string }) => a.kind === 'native').agentId,
      workspace, permission: 'deny-risky', schedule: { kind: 'daily', time: '09:00', timeZone: 'UTC' } })
    await invoke('updateSchedule', { id: definition.id, status: 'paused' })
    return definition.id as string
  }, dawn.workspace)

  const db = new Database(dawn.dbPath)
  let queuedId: string
  try {
    const store = new ScheduleStore(db)
    const definition = store.get(id)!
    const queuedAt = Date.now() - 86_400_000
    const queued = 造手动运行(definition, new Date(queuedAt).toISOString())
    queuedId = queued.id
    db.transaction(() => {
      store.putRun(queued)
      for (let index = 0; index < 500; index++) {
        const history = 造手动运行({ ...definition, id: 'historical-definition' }, new Date(queuedAt + (index + 1) * 1000).toISOString())
        store.putRun({ ...history, status: 'succeeded', finishedAt: history.scheduledFor })
      }
    })()
  } finally { db.close() }

  const manual = await page.evaluate(async id => {
    const result = await window.dawn!.invoke('runScheduleNow', { id })
    if (!result.ok) throw new Error(JSON.stringify(result.error))
    return result.data as { id: string }
  }, id)
  await expect.poll(async () => page.evaluate(async id => {
    const result = await window.dawn!.invoke('listScheduleRuns', { id, limit: 10 })
    if (!result.ok) throw new Error(JSON.stringify(result.error))
    return (result.data as { runs: { id: string; status: string }[] }).runs.map(run => ({ id: run.id, status: run.status }))
  }, id)).toEqual([{ id: manual.id, status: 'succeeded' }, { id: queuedId!, status: 'succeeded' }])
  await page.getByRole('button', { name: '定时', exact: true }).click()
  await page.getByRole('button', { name: '定时任务操作：排队恢复回归', exact: true }).click()
  await page.getByRole('menuitem', { name: '看它的记录', exact: true }).click()
  await expect(page.locator('.schedule-runs .skill-row')).toHaveCount(2)
  await expect(page.locator('.schedule-runs')).toContainText('成功')
})
