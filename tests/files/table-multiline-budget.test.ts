import {expect,it} from 'vitest'
import {读成表} from '../../src/files/table.js'
it('parses a large single multiline quoted cell without quadratic rescanning',()=>{const csv='x,y\n3,"'+'text\n'.repeat(200000)+'end"\n',start=performance.now(),table=读成表(csv,true,100000);expect(table.totalRows).toBe(1);expect(table.rows[0]?.[1]).toContain('end');expect(performance.now()-start).toBeLessThan(1500)},20000)
