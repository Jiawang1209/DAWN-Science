"""Rebuild the native/protocol exit index for the frozen candidate verification."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
BAD = {'shutdown-drain-timeout', 'shutdown-drain-failed', 'shutdown-async-failed', 'shutdown-fallback-fired'}


def facts(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line] if path.exists() else []


result = {}
lines = ['# Verified exit facts', '', '| Batch / case | PID | Cleanup | ms | Native + pipes | Verified |', '|---|---:|---|---:|---|---|']
for batch in ['desktop-frozen-results']:
    runs = []
    for file in sorted((ROOT / batch).rglob('exit-*.jsonl')):
        pid = int(file.stem.split('-')[1])
        host, app = facts(file), facts(file.with_name(f'app-{pid}.jsonl'))
        events = [row['event'] for row in app]
        terminal = [row['detail'] for row in host if row['event'] in ['child-exit', 'child-close']]
        normal = len(terminal) == 2 and all(row['code'] == 0 and row['signal'] is None for row in terminal)
        problems = sorted(set(events) & BAD)
        branch = 'async' if 'shutdown-async-start' in events else 'sync' if 'shutdown-sync-start' in events else 'unobserved'
        verified = normal and bool(app) and 'diagnostics-attached' in events and not problems and (branch == 'sync' or branch == 'async' and 'shutdown-drained' in events)
        starts = [row['ms'] for row in app if row['event'] == f'shutdown-{branch}-start']
        ends = [row['ms'] for row in app if row['event'] == ('shutdown-drained' if branch == 'async' else 'shutdown-sync-complete')]
        duration = round(ends[0] - starts[0], 3) if starts and ends else None
        veto = file.with_name(f'fault-{pid}.json').exists()
        stalled = any(row['event'] == 'still-waiting-5s' for row in host)
        case = file.parent.parent.name
        runs.append(dict(pid=pid, case=case, branch=branch, cleanupMs=duration, normalNativeAndPipes=normal,
                         verified=bool(verified), problems=problems, unexpectedWatchdog=stalled and not veto,
                         deliberateVeto=veto, host=str(file.relative_to(ROOT))))
        lines.append(f'| {batch} / {case} | {pid} | {branch} | {duration} | {normal} | {bool(verified)} |')
    result[batch] = dict(exits=len(runs), allVerified=bool(runs) and all(row['verified'] for row in runs),
                         problemCount=sum(len(row['problems']) for row in runs),
                         unexpectedWatchdogs=sum(row['unexpectedWatchdog'] for row in runs), runs=runs)

(ROOT / 'exit-summary.json').write_text(json.dumps(result, indent=2) + '\n')
(ROOT / 'timelines.md').write_text('\n'.join(lines) + '\n')
print(json.dumps({batch: {key: value for key, value in data.items() if key != 'runs'} for batch, data in result.items()}))
