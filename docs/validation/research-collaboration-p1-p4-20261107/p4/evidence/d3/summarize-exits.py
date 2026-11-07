"""Separate app.close completion from child-process exit/close, using passive diagnostics."""
from pathlib import Path
import json,sys
source=Path(sys.argv[1]);target=Path(sys.argv[2]);scope=sys.argv[3];rows=[]
for p in sorted(source.glob('exit-*.jsonl')):
 events=[json.loads(s) for s in p.read_text().splitlines() if s]
 start=next((e for e in events if e['event']=='close-requested'),None)
 if not start:continue
 row={'file':p.name}
 for key,event in [('appCloseReturnedMs','close-call-returned'),('osProcessExitMs','child-exit'),('osProcessCloseMs','child-close')]:
  end=next((e for e in events if e['event']==event),None);row[key]=round(end['ms']-start['ms'],3) if end else None
  if event=='child-exit':row['exitCode']=end.get('detail',{}).get('code') if end else None;row['signal']=end.get('detail',{}).get('signal') if end else None
 row['observerProblems']=[e['event'] for e in events if 'fallback' in e['event'] or 'timeout' in e['event'] or 'failed' in e['event'] or e['event']=='still-waiting-5s']
 native=source/p.name.replace('exit-','app-');bad={'shutdown-drain-timeout','shutdown-drain-failed','shutdown-async-failed','shutdown-fallback-fired'}
 row['nativeProblems']=[e['event'] for e in [json.loads(s) for s in native.read_text().splitlines() if s] if e['event'] in bad] if native.exists() else ['native-diagnostics-missing']
 rows.append(row)
keys=['appCloseReturnedMs','osProcessExitMs','osProcessCloseMs']
result={'scope':scope,'runs':len(rows),'maxMs':{key:max((r[key] for r in rows if r[key] is not None),default=None) for key in keys},'over4000Ms':{key:[r['file'] for r in rows if r[key] is None or r[key]>4000] for key in keys},'over1500Ms':{key:[r['file'] for r in rows if r[key] is None or r[key]>1500] for key in keys},'rows':rows,'historicalOpenMs':[7350,20690],'historicalBudgetsUnchanged':[1500,4000]}
target.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='rows'},indent=2))
