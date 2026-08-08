#!/usr/bin/env bash
# Spike B 用的 Claude Code Stop hook。
# 回合结束时被调用，往探针日志追加一行——这是「拿到回合结束信号」的证据。
# hook 从 stdin 收到事件 JSON；这里只记录事实，不解析。
set -u
[ -n "${DAWN_PROBE_LOG:-}" ] || exit 0
printf '{"kind":"hook","event":"Stop","at":"%s"}\n' "$(date -Iseconds)" >> "$DAWN_PROBE_LOG"
exit 0
