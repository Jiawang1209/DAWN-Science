/** Select the authoritative last turn before reusing the conversation suggestion API. */
export async function suggestLatestPrompt(items: readonly { type: string; id?: string; who?: string; final?: boolean }[], ask: (turnId: string) => Promise<{ text: string }>): Promise<{ text: string }> {
  const last = items.filter(item => item.type === 'turn').at(-1)
  return last?.who === 'agent' && last.final && last.id ? ask(last.id) : { text: '' }
}

/** One tool-free request per idle turn. Text never enters a draft or the transcript. */
export class CliNextPrompt {
  private timer: ReturnType<typeof setTimeout> | undefined
  private request: Promise<string> | undefined
  private generation = 0
  private eligible = false
  private closed = false
  constructor(private readonly load: () => Promise<{ text: string }>, private readonly show: (text: string) => void) {}
  update(eligible: boolean) {
    this.eligible = eligible
    clearTimeout(this.timer)
    if (this.closed) return
    if (!eligible) { this.show(''); return }
    const generation = this.generation
    this.timer = setTimeout(() => {
      this.request ??= this.load().then(result => result.text, () => '')
      void this.request.then(text => {
        if (!this.closed && this.eligible && generation === this.generation) this.show(text)
      })
    }, 400)
  }
  reset() {
    this.generation++; clearTimeout(this.timer); this.request = undefined; this.eligible = false; this.show('')
  }
  close() { this.reset(); this.closed = true }
}
