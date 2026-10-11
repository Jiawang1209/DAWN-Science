import type { RemoteConnection, TaskSummary } from "../protocol/index.js"

/** 连接是目录来源；任务只补充归属，不能让空服务器消失。 */
export type ServerGroup<T> = { id: string; connection?: RemoteConnection; tasks: T[] }

export function buildServerGroups<T extends Pick<TaskSummary, "connectionId">>(
  connections: readonly RemoteConnection[], tasks: readonly T[],
): ServerGroup<T>[] {
  const groups = new Map<string, ServerGroup<T>>()
  for (const connection of [...connections].sort((a, b) => a.sortOrder - b.sortOrder)) {
    groups.set(connection.id, { id: connection.id, connection, tasks: [] })
  }
  for (const task of tasks) {
    if (!task.connectionId) continue
    let group = groups.get(task.connectionId)
    if (!group) {
      group = { id: task.connectionId, tasks: [] }
      groups.set(task.connectionId, group)
    }
    group.tasks.push(task)
  }
  return [...groups.values()]
}
