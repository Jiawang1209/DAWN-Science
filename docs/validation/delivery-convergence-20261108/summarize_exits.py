"""Read existing exit evidence only; do not substitute protocol close for OS exit."""
from pathlib import Path
import json
root = Path(__file__).resolve().parent
runs, issues = [], []
for folder in ['b-exit', 'c-exit', 'layout-red-exit', 'exit', 'exit-fixed']:
    for path in sorted((root / folder).glob('exit-*.jsonl')):
        events = [json.loads(line) for line in path.read_text().splitlines() if line]
        starts = [e for e in events if e['event'] == 'close-requested']
        ends = [e for e in events if e['event'] == 'child-exit']
        row = {'file': str(path.relative_to(root)), 'actualExitObserved': bool(ends)}
        if ends:
            row['code'] = ends[-1]['detail'].get('code')
            if starts:
                row['closeToActualExitMs'] = ends[-1]['ms'] - starts[-1]['ms']
            else:
                row['timing'] = 'no fixture close-requested marker; excluded from latency maximum'
        if not ends or row.get('code') != 0:
            issues.append(row)
        native = path.with_name(path.name.replace('exit-', 'app-'))
        if not native.exists():
            issues.append({'file': str(path.relative_to(root)), 'issue': 'native diagnostics missing'})
        else:
            names = [json.loads(line)['event'] for line in native.read_text().splitlines() if line]
            index = len(names) - 1 - names[::-1].index('diagnostics-attached') if 'diagnostics-attached' in names else 0
            current = names[index:]
            bad = [e for e in current if e in ['shutdown-drain-timeout', 'shutdown-drain-failed', 'shutdown-async-failed', 'shutdown-fallback-fired']]
            if 'diagnostics-attached' not in current:
                bad.append('diagnostics-unavailable')
            if 'shutdown-async-start' in current and 'shutdown-drained' not in current:
                bad.append('shutdown-outcome-unobserved')
            if bad:
                issues.append({'file': str(path.relative_to(root)), 'events': bad})
        runs.append(row)
latencies = [row['closeToActualExitMs'] for row in runs if 'closeToActualExitMs' in row]
summary = {'samples': len(runs), 'timedSamples': len(latencies), 'untimedSamples': len(runs)-len(latencies),
           'maximumCloseToActualChildExitMs': max(latencies, default=None), 'problems': issues,
           'historicalExit': 'OPEN', 'ptyCleanup': 'OPEN', 'thresholdsMs': [1500, 4000], 'runs': runs}
(root / 'exit-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print({k: v for k, v in summary.items() if k != 'runs'})
