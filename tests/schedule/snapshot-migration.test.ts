import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, SCHEMA_VERSION } from '../../src/store/schema.js'
import { ScheduleStore } from '../../src/store/schedules.js'
import { 造到期运行, type 定义 } from '../../src/schedule/domain.js'

const dbs: Database.Database[] = []
afterEach(() => { for (const db of dbs.splice(0)) db.close() })
const definition: 定义 = {
  id: 'd1', revision: 1, name: 'test', prompt: 'old task', status: 'active',
  schedule: { kind: 'daily', time: '08:00', timeZone: 'Asia/Shanghai' },
  agentId: 'a', workspace: '/old', permission: 'deny-risky',
  createdAt: '2026-11-19T00:00:00Z', updatedAt: '2026-11-19T00:00:00Z',
}

describe('schedule execution snapshot migration', () => {
  it('adds a nullable snapshot to v19 without inventing historical configuration; migration is idempotent', () => {
    const db = new Database(':memory:'); dbs.push(db)
    migrate(db)
    const columns = db.prepare('PRAGMA table_info(schedule_runs)').all() as { name: string }[]
    if (columns.some(c => c.name === 'definition_snapshot')) db.exec('ALTER TABLE schedule_runs DROP COLUMN definition_snapshot')
    db.exec("UPDATE schema_meta SET value='19' WHERE key='version'")
    db.prepare(`INSERT INTO schedule_runs (id,schedule_id,revision,occurrence_key,trigger,scheduled_for,status,prompt)
      VALUES ('old','d1',1,'old','manual','2026-11-20T00:00:00Z','queued','old task')`).run()
    migrate(db); migrate(db)
    expect(db.prepare('PRAGMA table_info(schedule_runs)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'definition_snapshot' })]))
    expect(db.prepare('SELECT prompt,definition_snapshot FROM schedule_runs WHERE id=?').get('old')).toEqual({ prompt: 'old task', definition_snapshot: null })
    expect(new ScheduleStore(db).getRun('old')).not.toHaveProperty('definitionSnapshot')
    expect(db.prepare("SELECT value FROM schema_meta WHERE key='version'").get()).toEqual({ value: String(SCHEMA_VERSION) })
  })

  it('persists an automatic run snapshot through store reconstruction and status updates', () => {
    const db = new Database(':memory:'); dbs.push(db); migrate(db)
    const run = 造到期运行(definition, '2026-11-20T00:00:00Z')
    new ScheduleStore(db).putRun(run)
    const store = new ScheduleStore(db)
    expect(store.getRun(run.id)).toMatchObject({ definitionSnapshot: definition })
    store.putRun({ ...store.getRun(run.id)!, status: 'succeeded' })
    expect(store.getRun(run.id)).toMatchObject({ definitionSnapshot: definition, status: 'succeeded' })
  })
})
