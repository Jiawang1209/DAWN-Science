/**
 * 本会话产物登记（2026-08-23，学自 NanmiCoder/dsh-auto-mode 的 artifact registry）。
 *
 * 「删这段会话自己刚生成的文件」是可重来的低风险——科研里天天发生（清掉中间文件、重画一张图）；
 * 「删会话之前就有的」才是真删除。门要分得开这两件事，就得知道这段会话创建过什么。
 *
 * 登记的不是路径，是**身份**：设备号 + inode + 出生时间 + 类型。路径被改名、替换、换成软链之后
 * 身份就对不上，自动清理的资格随之失效——照它的做法。
 * 目录只登记「这段会话建的目录」；递归删目录时要求目录树里每个对象都对得上（简化：只查目录自身）。
 */
import { lstatSync, type Stats } from "node:fs"

interface 身份 {
  dev: number
  ino: number
  birth: number
  kind: "file" | "dir" | "other"
}

const 取身份 = (st: Stats): 身份 => ({
  dev: st.dev,
  ino: st.ino,
  birth: Math.floor(st.birthtimeMs),
  kind: st.isFile() ? "file" : st.isDirectory() ? "dir" : "other",
})

export class 产物登记 {
  private readonly 表 = new Map<string, 身份>()

  /** 某条路径在这次调用前存不存在（给「执行后登记新建的」用） */
  static 存在(path: string): boolean {
    try {
      lstatSync(path)
      return true
    } catch {
      return false
    }
  }

  /** 执行成功后登记：只登记**此前不存在、现在存在**的（覆盖已有文件不算新建） */
  登记新建(path: string, 之前存在: boolean): void {
    if (之前存在) return
    try {
      this.表.set(path, 取身份(lstatSync(path)))
    } catch {
      // 没建出来就不登记
    }
  }

  /** 这条路径是不是本会话建的、而且身份没变 */
  是本会话创建(path: string): boolean {
    const 记 = this.表.get(path)
    if (!记) return false
    try {
      const 现 = 取身份(lstatSync(path))
      return 现.dev === 记.dev && 现.ino === 记.ino && 现.birth === 记.birth && 现.kind === 记.kind
    } catch {
      return false
    }
  }

  几条(): number {
    return this.表.size
  }
}

/** 一条 shell 命令里 `>` / `>>` 写出的目标（只认最简单的形状；看不出来就不登记，宁缺毋滥） */
export function 重定向目标(cmd: string): string[] {
  const out: string[] = []
  for (const m of cmd.matchAll(/(?:^|[^<>])>{1,2}\s*(["']?)([^\s"'|&;>]+)\1/g)) {
    const t = m[2]!
    if (t.startsWith("/dev/") || t.startsWith("&")) continue
    out.push(t)
  }
  return out
}
