"""Audit the reviewed source, preserved prior evidence, and actual Electron exits."""
from pathlib import Path
import json, hashlib, subprocess, sys

out=Path(__file__).resolve().parent
root=out.parents[2]
main=Path('/Users/liuyue/Desktop/Github_repos/dawn-science')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
freeze=json.loads((out/'source-freeze.json').read_text())
drift=[n for n,h in freeze['files'].items() if not (root/n).is_file() or sha(root/n)!=h]
before=json.loads((out/'before-sha256.json').read_text())
prior={n:h for n,h in before.items() if n.startswith(('docs/validation/auto-arrangement-20261108/','docs/validation/mode-member-workspace-20261108/'))}
prior_drift=[n for n,h in prior.items() if not (root/n).is_file() or sha(root/n)!=h]
exits=[]
for folder in sorted(out.glob('exit-*')):
 if not folder.is_dir():continue
 for p in sorted(folder.glob('exit-*.jsonl')):
  rows=[json.loads(l) for l in p.read_text().splitlines() if l]
  events={r['event']:r for r in rows}
  native=folder/p.name.replace('exit-','app-',1)
  native_events=[json.loads(l)['event'] for l in native.read_text().splitlines() if l] if native.exists() else []
  problems=sorted(set(native_events)&{'shutdown-drain-timeout','shutdown-drain-failed','shutdown-async-failed','shutdown-fallback-fired'})
  if 'diagnostics-attached' not in native_events:problems.append('diagnostics-unavailable')
  if 'shutdown-async-start' in native_events and 'shutdown-drained' not in native_events:problems.append('drain-outcome-unobserved')
  start=events.get('close-requested',{}).get('ms');close=events.get('child-close',{})
  if start is None or close.get('detail',{}).get('code')!=0:problems.append('abnormal-or-missing-close')
  if 'close-call-returned' not in events or 'close-call-failed' in events:problems.append('close-call-incomplete')
  exits.append({'path':str(p.relative_to(out)),'osCloseMs':round(close['ms']-start,3) if start is not None and close else None,'problems':problems})
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=main,text=True).strip()
status=subprocess.check_output(['git','status','--porcelain'],cwd=main,text=True).strip()
expected=sys.argv[1] if len(sys.argv)>1 else freeze['base']
integrated=len(sys.argv)>1
main_drift=[n for n,h in freeze['files'].items() if not (main/n).is_file() or sha(main/n)!=h] if integrated else []
report={'sourceFilesFrozen':len(freeze['files']),'sourceDrift':drift,'priorEvidenceFilesChecked':len(prior),'priorEvidenceDrift':prior_drift,'mainHead':head,'mainStatus':status,'mainSourceDrift':main_drift,'integrated':integrated,'exits':exits,'historicalIntermittentTimeout':'OPEN','shutdownBudgetsMs':[1500,4000]}
(out/('audit-integrated.json' if integrated else 'audit-branch.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
assert not drift and not prior_drift and not main_drift and not status
assert head==expected,(head,expected)
assert exits and all(not r['problems'] for r in exits)
print(json.dumps({k:v for k,v in report.items() if k!='exits'},ensure_ascii=False))
print('Exit observations:',len(exits),'max OS close ms:',max(r['osCloseMs'] for r in exits))
