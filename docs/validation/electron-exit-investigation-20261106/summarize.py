"""Rebuild the exit evidence index. Reads lifecycle facts only; no general stderr."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
BATCHES = ['repeated-results', 'fixed-boundary-results', 'final-desktop-results', 'final-verified-results']


def facts(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line] if path.exists() else []


def elapsed(rows, start, end):
    first = next((r['ms'] for r in rows if r['event'] == start), None)
    last = next((r['ms'] for r in rows if r['event'] == end), None)
    return round(last - first, 3) if first is not None and last is not None else None


result = {}
table = ['# Actual exit timelines', '',
         'The deliberately vetoed quit is fault injection, not a historical reproduction.', '',
         '| Batch / case | PID | Cleanup branch | Cleanup ms | Native exit + stdio close | Watchdog |',
         '|---|---:|---|---:|---|---:|']
for batch in BATCHES:
    runs = []
    for host_file in sorted((ROOT / batch).rglob('exit-*.jsonl')):
        pid = int(host_file.stem.split('-')[1])
        host = facts(host_file)
        app_file = host_file.with_name(f'app-{pid}.jsonl')
        app = facts(app_file)
        events = [row['event'] for row in app]
        exits = [row['detail'] for row in host if row['event'] == 'child-exit']
        closes = [row['detail'] for row in host if row['event'] == 'child-close']
        branch = 'async' if 'shutdown-async-start' in events else 'sync' if 'shutdown-sync-start' in events else 'unobserved'
        normal = bool(exits and closes) and all(row['code'] == 0 and row['signal'] is None for row in exits + closes)
        fallback = 'shutdown-fallback-fired' in events
        deadline = 'shutdown-drain-timeout' in events
        failed = 'shutdown-drain-failed' in events or 'shutdown-async-failed' in events
        duration = elapsed(app, f'shutdown-{branch}-start', f'shutdown-{branch}-complete')
        stalled = sum(row['event'] == 'still-waiting-5s' for row in host)
        case = host_file.parent.parent.name
        run = dict(pid=pid, case=case, app=str(app_file.relative_to(ROOT)), host=str(host_file.relative_to(ROOT)),
                   cleanupBranch=branch, cleanupMs=duration, normalNativeAndStdioExit=normal,
                   fallbackUsed=fallback, drainDeadlineUsed=deadline, drainFailed=failed, watchdogCount=stalled,
                   hostCloseMs=elapsed(host, 'close-requested', 'child-close'),
                   quitVetoInjected=host_file.with_name(f'fault-{pid}.json').exists() or case.startswith('exit-lifecycle-diagnoses-a-'))
        runs.append(run)
        table.append(f'| {batch} / {case} | {pid} | {branch} | {duration} | {normal} | {stalled} |')
    result[batch] = dict(exits=len(runs), allNormal=bool(runs) and all(r['normalNativeAndStdioExit'] for r in runs),
                         fallbackCount=sum(r['fallbackUsed'] for r in runs),
                         deadlineCount=sum(r['drainDeadlineUsed'] for r in runs), failureCount=sum(r['drainFailed'] for r in runs),
                         unexpectedWatchdogs=sum(r['watchdogCount'] for r in runs if not r['quitVetoInjected']), runs=runs)

(ROOT / 'exit-summary.json').write_text(json.dumps(result, indent=2) + '\n')
(ROOT / 'timelines.md').write_text('\n'.join(table) + '\n')
print(json.dumps({batch: {k: v for k, v in group.items() if k != 'runs'} for batch, group in result.items()}))
