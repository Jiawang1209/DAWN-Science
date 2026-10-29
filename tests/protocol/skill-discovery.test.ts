import {expect,it} from 'vitest'
import {OPERATIONS} from '../../src/protocol/operations.js'
it('online skill installation is a strict mutating operation with a backend preview identity',()=>{
  const operation=(OPERATIONS as Record<string,any>).installGithubSkill
  expect(operation).toBeDefined()
  expect(operation.mutating).toBe(true)
  expect(operation.request.safeParse({previewId:'x',to:'global',body:'injected'}).success).toBe(false)
  expect(operation.request.safeParse({previewId:'x',to:'global'}).success).toBe(true)
})
