import {expect, it} from 'vitest'
import {建团队, 加成员, 加任务, 领取, 开始做} from '../../src/team/state.js'
import {recoverTeamExecution} from '../../src/team/recovery.js'
it('reconciles legacy member execution without replaying unknown filesystem effects', () => {
  const team = 建团队({name: 't', goal: 'g', captainSessionId: 'p'})
  加成员(team, {name: 'a', agent: 'analyst'})
  加任务(team, {id: 'running', subject: 'running', assignee: 'a'})
  加任务(team, {id: 'queued', subject: 'queued'})
  const {attemptId} = 领取(team, 'running', 'a')
  开始做(team, 'running', attemptId)
  team.members[0]!.status = 'working'
  expect(recoverTeamExecution(team)).toBe(true)
  expect(team.tasks[0]).toMatchObject({status: 'failed', output: expect.stringContaining('未自动重放')})
  expect(team.tasks[0]?.attemptId).toBeUndefined()
  expect(team.tasks[1]?.status).toBe('pending')
  expect(team.members[0]?.status).toBe('idle')
  expect(recoverTeamExecution(team)).toBe(false)
})
