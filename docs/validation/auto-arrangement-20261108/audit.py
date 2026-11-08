"""Read-only source/main/exit audit; writes evidence only into this directory."""
from pathlib import Path
import hashlib
import json
import subprocess

out = Path(__file__).resolve().parent
root = out.parents[2]
main = Path('/Users/liuyue/Desktop/Github_repos/dawn-science')

def git(where, *args):
    return subprocess.check_output(['git', *args], cwd=where, text=True).strip()

freeze = json.loads((out / 'source-freeze.json').read_text())
drift = [name for name, sha in freeze['files'].items()
         if not (root / name).is_file()
         or hashlib.sha256((root / name).read_bytes()).hexdigest() != sha]
before = json.loads(Path('/tmp/dawn-auto-arrange-20261108/before-sha256.json').read_text())
missing_prior = [name for name in before if not (root / name).is_file()]
unchanged_prior = [name for name, sha in before.items() if (root / name).is_file()
                   and hashlib.sha256((root / name).read_bytes()).hexdigest() == sha]
bad_events = {'shutdown-drain-timeout', 'shutdown-drain-failed',
              'shutdown-async-failed', 'shutdown-fallback-fired'}
exits = []
for folder in sorted(out.glob('exit-*')):
    if not folder.is_dir():
        continue
    for file in sorted(folder.glob('exit-*.jsonl')):
        rows = [json.loads(line) for line in file.read_text().splitlines() if line]
        events = {row['event']: row for row in rows}
        start = events.get('close-requested', {}).get('ms')
        app_file = folder / file.name.replace('exit-', 'app-', 1)
        app_rows = [json.loads(line) for line in app_file.read_text().splitlines() if line] if app_file.exists() else []
        app_events = [r['event'] for r in app_rows]
        problems = sorted(bad_events.intersection(app_events))
        if 'diagnostics-attached' not in app_events:
            problems.append('shutdown-diagnostics-unavailable')
        if 'shutdown-async-start' in app_events and 'shutdown-drained' not in app_events:
            problems.append('shutdown-outcome-unobserved')
        close = events.get('child-close', {})
        if start is None or not close or close.get('detail', {}).get('code') != 0:
            problems.append('missing-or-abnormal-child-close')
        if 'close-call-returned' not in events or 'close-call-failed' in events:
            problems.append('app-close-call-incomplete')
        exits.append({'file': str(file.relative_to(out)),
                      'osCloseMs': round(close['ms'] - start, 3) if start is not None and close else None,
                      'appCloseMs': round(events['close-call-returned']['ms'] - start, 3) if start is not None and 'close-call-returned' in events else None,
                      'problems': problems})

report = {'sourceFilesFrozen': len(freeze['files']), 'sourceDrift': drift,
          'priorSnapshotFileCount': len(before), 'missingPriorFiles': missing_prior,
          'priorFilesByteUnchanged': unchanged_prior,
          'mainHead': git(main, 'rev-parse', 'HEAD'), 'mainStatus': git(main, 'status', '--porcelain'),
          'worktreeHead': git(root, 'rev-parse', 'HEAD'), 'branch': git(root, 'branch', '--show-current'),
          'exits': exits, 'historicIntermittentTimeout': 'OPEN',
          'shutdownBudgetsMs': [1500, 4000]}
(out / 'audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k not in ('exits', 'priorFilesByteUnchanged')}, ensure_ascii=False))
print('exit observations:', len(exits), 'with problems:', sum(bool(e['problems']) for e in exits))
assert not drift and not missing_prior and not report['mainStatus']
assert report['mainHead'] == freeze['base']
assert all(not e['problems'] for e in exits)
