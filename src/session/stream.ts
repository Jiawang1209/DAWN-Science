/**
 * 终端流：scrollback ring buffer + 节流合并投递（Task 1.8）。
 *
 * **Spike C 的实测结论决定了这里的默认取值**：四终端并发灌 29 MB，冻结帧 0、
 * 卡顿帧 0、最长单帧 59.2 ms——**当前规模不需要节流**，故 `flushIntervalMs`
 * 默认为 0（立即投递）。但帧率确实从 60fps 掉到约 27fps，故保留节流能力，
 * 并以「单帧 100ms」为将来的触发线。
 *
 * 另一条 Spike C 结论：**scrollback 是内存的主控参数，不是显示偏好**。
 * xterm 的 5000 行上限是 20 万行输入下内存仍稳在 526 MB 的原因。
 */
export type ChunkSink = (chunk: string) => void

export interface TerminalStreamOptions {
  /**
   * scrollback 上限，按**字符**计。超出从头丢弃。
   *
   * 计划初稿叫 `maxBytes`，但实现是字符切片，两者在 CJK 下会差 3 倍。
   * 改名为 `maxChars` 而非改成按字节切，理由是：JS 字符串是 UTF-16，
   * 内存占用与**字符数**成正比而非 UTF-8 字节数——所以字符计数本就是
   * 更准的内存代理量；而按字节切还会有把多字节字符截半的风险。
   */
  maxChars: number
  /** 0 表示不节流，立即投递；>0 表示合并该毫秒数内的输出 */
  flushIntervalMs: number
}

export class TerminalStream {
  private buffer = ""
  private pending = ""
  private timer: NodeJS.Timeout | undefined
  private readonly sinks = new Set<ChunkSink>()

  constructor(private readonly opts: TerminalStreamOptions) {}

  /** 当前 scrollback 快照 */
  snapshot(): string {
    return this.buffer
  }

  push(chunk: string): void {
    // scrollback 立即更新，与投递节奏无关——UI 卡顿不该导致历史丢失
    this.buffer = (this.buffer + chunk).slice(-this.opts.maxChars)

    if (this.opts.flushIntervalMs <= 0) {
      this.deliver(chunk)
      return
    }
    this.pending += chunk
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), this.opts.flushIntervalMs)
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    const merged = this.pending
    this.pending = ""
    if (merged) this.deliver(merged)
  }

  private deliver(chunk: string): void {
    // 复制一份再遍历：sink 若在回调里退订，会在遍历中修改集合
    for (const sink of [...this.sinks]) sink(chunk)
  }

  /**
   * 订阅。立即收到一次 scrollback 快照（若非空），之后收增量。
   *
   * **订阅前先冲掉 pending**，否则新观察者会拿到重复数据——
   * 快照里已经含着 pending（scrollback 是即时更新的），
   * 定时器到期时又会把 pending 投递一遍。这是计划初稿的一处真实缺陷。
   */
  subscribe(sink: ChunkSink): () => void {
    if (this.pending) this.flush()
    this.sinks.add(sink)
    if (this.buffer) sink(this.buffer)
    return () => {
      this.sinks.delete(sink)
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.pending = ""
    this.sinks.clear()
  }
}
