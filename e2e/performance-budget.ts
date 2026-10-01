/** Fixed regression limits for a single streamed assistant turn. */
export const STREAMING_BUDGET = {
  /** A typed character should reach a frame within 150 ms at p95. */
  typingP95Ms: 150,
  /** UTF-8 JSON payload bytes received over the session event IPC channel. */
  ipcBytes: 1_000_000,
} as const

export interface StreamingMeasurement {
  typingP95Ms: number
  ipcBytes: number
}

/** Returns every violated limit; equality is within budget and has zero slack. */
export function evaluateStreamingBudget(measurement: StreamingMeasurement): string[] {
  const violations: string[] = []
  if (measurement.typingP95Ms > STREAMING_BUDGET.typingP95Ms) {
    violations.push(`typing p95 ${measurement.typingP95Ms} ms exceeds ${STREAMING_BUDGET.typingP95Ms}`)
  }
  if (measurement.ipcBytes > STREAMING_BUDGET.ipcBytes) {
    violations.push(`IPC payload ${measurement.ipcBytes} bytes exceeds ${STREAMING_BUDGET.ipcBytes}`)
  }
  return violations
}
