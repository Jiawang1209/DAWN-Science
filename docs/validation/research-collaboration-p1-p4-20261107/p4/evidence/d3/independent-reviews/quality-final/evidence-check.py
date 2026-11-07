from pathlib import Path
import hashlib,json,re
root=Path('/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science');base=root/'docs/validation/research-collaboration-p1-p4-20261107';d3=base/'p4/evidence/d3';out=Path('/tmp/dawn-p14-final-quality-20261108-HUfZ0w')
checks=[]
def check(name,ok,detail=None): checks.append(dict(name=name,passed=bool(ok),detail=detail))
load=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
candidate=load(d3/'candidate-src-sha256.json');pilot=load(base/'p1/live-6bf54b69-6ab3-4909-9b36-85b7e7d5d993/candidate-src-sha256.json');behavior=load(d3/'behavior-regression-candidate-src-sha256.json')
delta={p:{'pilot':pilot.get(p),'candidate':candidate.get(p)} for p in sorted(pilot.keys()|candidate.keys()) if pilot.get(p)!=candidate.get(p)}
check('D3 actual delta equals declared eight UI-only files',delta==load(d3/'source-delta-from-pilot.json')['changed'] and len(delta)==8 and all(p.startswith('src/ui/') for p in delta),delta)
changed=[p for p in candidate.keys()|behavior.keys() if candidate.get(p)!=behavior.get(p)]
check('15-behavior candidate to final delta only styles.css',changed==['src/ui/styles.css'],changed)
check('Frozen actual built child hash unchanged',sha(root/'dist/electron/subagent-child.js')=='96b1f3e966c391d88fb45fa9524dbb61d4b0203da6ac4cbf69ae41f577d7063e')
for log,pattern in [('dawn-d3-full-node-ui-release-candidate-20261108.log',r'6813 passed.*10 skipped'),('dawn-d3-electron-candidate-20261108.log',r'15 passed'),('dawn-d3-electron-final-20261108.log',r'5 passed'),('dawn-d3-electron-disk-capture-20261108.log',r'1 passed')]:
 check('Retained actual stdout '+log,bool(re.search(pattern,(d3/'logs'/log).read_text())))
for directory,summary in [('behavior-electron','behavior-exit-summary.json'),('final-electron','final-exit-summary.json'),('disk-ui-electron','disk-capture-exit-summary.json')]:
 expected=load(d3/summary);rows=[]
 for p in sorted((d3/directory/'exits').glob('exit-*.jsonl')):
  events=[json.loads(s) for s in p.read_text().splitlines() if s];event={e['event']:e for e in events};start=event.get('close-requested')
  if not start:continue
  row={'file':p.name}
  for field,name in [('appCloseReturnedMs','close-call-returned'),('osProcessExitMs','child-exit'),('osProcessCloseMs','child-close')]:
   end=event.get(name);row[field]=round(end['ms']-start['ms'],3) if end else None
   if name=='child-exit':row['exitCode']=end.get('detail',{}).get('code') if end else None;row['signal']=end.get('detail',{}).get('signal') if end else None
  row['observerProblems']=[e['event'] for e in events if any(w in e['event'] for w in ['fallback','timeout','failed']) or e['event']=='still-waiting-5s']
  native=p.with_name(p.name.replace('exit-','app-'));bad={'shutdown-drain-timeout','shutdown-drain-failed','shutdown-async-failed','shutdown-fallback-fired'}
  row['nativeProblems']=[e['event'] for e in [json.loads(s) for s in native.read_text().splitlines() if s] if e['event'] in bad] if native.exists() else ['native-diagnostics-missing']
  rows.append(row)
 check(directory+' raw exit events equal retained three-column summary',rows==expected['rows'],{'runs':len(rows),'maxMs':expected['maxMs']})
 check(directory+' all OS exits zero; no missing/fallback/native error and all columns <1500 ms',all(r['exitCode']==0 and r['signal'] is None and not r['observerProblems'] and not r['nativeProblems'] and all(r[k] is not None and r[k]<1500 for k in ['appCloseReturnedMs','osProcessExitMs','osProcessCloseMs']) for r in rows))
 check(directory+' preserves historical OPEN and thresholds',expected['historicalOpenMs']==[7350,20690] and expected['historicalBudgetsUnchanged']==[1500,4000])
result={'status':'PASS' if all(c['passed'] for c in checks) else 'FAIL','checks':checks}
(out/'evidence-check.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2));assert result['status']=='PASS'
