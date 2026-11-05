import {execFileSync,type ChildProcess} from "node:child_process"
interface ProcRow {
  pid: number
  ppid: number
  pgid: number
}

/** 快照当前进程表。失败返回空表——拿不到就退回只杀进程组，不让 stop 整体失败。 */
function processTable(): ProcRow[] {
  try {
    return execFileSync("ps", ["-A", "-o", "pid=,ppid=,pgid="], { encoding: "utf8" })
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/).map(Number))
      .filter((n) => n.length >= 3 && n.every(Number.isFinite))
      .map(([pid, ppid, pgid]) => ({ pid: pid!, ppid: ppid!, pgid: pgid! }))
  } catch {
    return []
  }
}

/**
 * 收集 root 及其全部后代的 pid 与它们所属的进程组。
 *
 * **必须在杀之前快照**——进程一死，它的孩子会被 reparent 到 init(1)，
 * 那时再遍历就找不到亲子关系了。
 */
export function collectTree(rootPid: number): { pids: number[]; pgids: number[] } {
  const table = processTable()
  const childrenOf = new Map<number, ProcRow[]>()
  for (const row of table) {
    const list = childrenOf.get(row.ppid) ?? []
    list.push(row)
    childrenOf.set(row.ppid, list)
  }

  const pids = new Set<number>([rootPid])
  const pgids = new Set<number>()
  const self = table.find((r) => r.pid === rootPid)
  if (self) pgids.add(self.pgid)

  const queue = [rootPid]
  while (queue.length > 0) {
    for (const child of childrenOf.get(queue.shift()!) ?? []) {
      if (pids.has(child.pid)) continue
      pids.add(child.pid)
      pgids.add(child.pgid)
      queue.push(child.pid)
    }
  }
  return { pids: [...pids], pgids: [...pgids] }
}

/** Caller owns a detached root. Snapshot before killing so nested groups cannot be orphaned. */
export function killOwnedProcessTree(child:ChildProcess):void {
 const pid=child.pid;if(!pid)return
 if(process.platform==='win32'){try{execFileSync(`${process.env.SystemRoot??'C:\\Windows'}\\System32\\taskkill.exe`,['/F','/T','/PID',String(pid)],{stdio:'ignore',timeout:5000})}catch{try{child.kill('SIGKILL')}catch{}};return}
 const {pids,pgids}=collectTree(pid)
 for(const group of new Set([pid,...pgids.filter(id=>pids.includes(id))]))try{process.kill(-group,'SIGKILL')}catch{}
 for(const id of pids)if(id!==process.pid)try{process.kill(id,'SIGKILL')}catch{}
}
