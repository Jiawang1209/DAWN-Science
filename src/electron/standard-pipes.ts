/** Standard pipes may outlive their launcher. Network/process errors keep their normal policy. */
interface StandardPipe {
  on(event: 'error', listener: (error: Error & { code?: string }) => void): unknown
  off(event: 'error', listener: (error: Error & { code?: string }) => void): unknown
}

export function guardStandardPipes(stdout: StandardPipe, stderr: StandardPipe, onClosed: (stream: 'stdout' | 'stderr') => void = () => {}) {
  const handlers = ([['stdout', stdout], ['stderr', stderr]] as const).map(([name, stream]) => {
    let reported = false
    const error = (cause: Error & { code?: string }) => {
      if (cause.code !== 'EPIPE') throw cause
      if (!reported) { reported = true; onClosed(name) }
    }
    stream.on('error', error)
    return () => stream.off('error', error)
  })
  return () => { for (const remove of handlers) remove() }
}
