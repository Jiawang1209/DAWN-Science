"""Read retained synthetic trials only; never execute their scripts or read credentials."""
import csv,hashlib,io,json,math,sys
from pathlib import Path
base=Path(sys.argv[1]).resolve()
report=json.loads((base/'research.json').read_text())
sha=lambda data:hashlib.sha256(data).hexdigest()
checks=[]
for task in report['tasks']:
    expected_input=task['csv'].encode()
    records=list(csv.DictReader(io.StringIO(task['csv'])))
    values=[float(r[task['column']]) for r in records if r[task['column']] not in ('','NA')]
    if task.get('unit'):
        if task['missing']=='block' and len(values)!=len(records):raise ValueError('Fixture has unexpected missing values')
        truth={'n':len(values),'mean':sum(values)/len(values),'unit':task['unit']}
    else:truth=None
    for mode in ('single','multi'):
        rows=[r for r in report['rows'] if r['caseId']==task['id'] and r['mode']==mode and r['terminal']!='not-run']
        roots=sorted(p for p in base.iterdir() if p.is_dir() and p.name.startswith(task['id']+'-'+mode+'-'))
        unused=list(rows)
        if len(roots)!=len(rows):raise ValueError('Trial directory count does not match observed rows')
        for root in roots:
            preserved=(root/'input.csv').read_bytes()==expected_input
            observed={}
            for row in rows:
                for version in row['versions']:
                    path=root/version['path']
                    if path.is_file() and path.resolve().is_relative_to(root.resolve()):observed[version['path']]=sha(path.read_bytes())
            # Match one-to-one by the complete accepted version set. Identical repeated
            # content is equivalent here; this does not infer a repeat's cost or timing.
            match=next((r for r in unused if r['versions'] and all(observed.get(v['path'])==v['sha256'] for v in r['versions'])),None)
            if match is None:match=next((r for r in unused if not r['versions']),None)
            if match is None:raise ValueError('Accepted versions do not match any owning trial directory')
            unused.remove(match)
            result=root/'results/result.json';actual=json.loads(result.read_text()) if result.is_file() else None
            scientific=None
            if match['terminal']=='accepted':
                scientific=bool(truth and actual and actual.get('n')==truth['n'] and actual.get('unit')==truth['unit'] and isinstance(actual.get('mean'),(int,float)) and math.isfinite(actual['mean']) and abs(actual['mean']-truth['mean'])<=1e-9)
            elif truth is None:scientific=not result.exists()
            passed=preserved and (scientific is not False)
            checks.append({'directory':root.name,'caseId':task['id'],'mode':mode,'terminal':match['terminal'],'inputPreserved':preserved,'numericChecked':match['terminal']=='accepted','scientificCheck':scientific,'expected':truth,'actual':actual,'verifiedVersions':len(match['versions']),'passed':passed})
summary={'kind':'independent Python CSV recomputation and SHA256; no model code executed','association':'one-to-one case/mode and accepted version set; identical repeats do not imply timing identity','allChecksPassed':all(c['passed'] for c in checks),'checks':checks}
target=base/'independent-file-check.json'
with target.open('x') as file:json.dump(summary,file,ensure_ascii=False,indent=2);file.write('\n')
print(json.dumps({'checks':len(checks),'allChecksPassed':summary['allChecksPassed']}))
if not summary['allChecksPassed']:raise SystemExit(1)
