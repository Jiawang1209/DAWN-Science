import hashlib,json,pathlib,subprocess,sys
root=pathlib.Path('/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science')
out=pathlib.Path('/tmp/dawn-p14-final-quality-20261108-HUfZ0w')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
checks={}
for label,folder,manifest in [('src','src','candidate-src-sha256.json'),('dist','dist','candidate-build-sha256.json')]:
 actual={str(p.relative_to(root)):sha(p) for p in sorted((root/folder).rglob('*')) if p.is_file()}
 expected=json.loads((root/'docs/validation/research-collaboration-p1-p4-20261107/p4/evidence/d3'/manifest).read_text())
 checks[label]={'count':len(actual),'manifestSHA256':sha(root/'docs/validation/research-collaboration-p1-p4-20261107/p4/evidence/d3'/manifest),'matches':actual==expected,'added':list(actual.keys()-expected.keys()),'missing':list(expected.keys()-actual.keys()),'changed':[k for k in actual.keys()&expected.keys() if actual[k]!=expected[k]]}
 (out/f'{sys.argv[1]}-{label}.json').write_text(json.dumps(actual,indent=2)+'\n')
protected={str(p.relative_to(root)):sha(p) for folder in ['src','tests','e2e','scripts'] for p in sorted((root/folder).rglob('*')) if p.is_file()}
(out/f'{sys.argv[1]}-protected.json').write_text(json.dumps(protected,indent=2)+'\n')
for repo,label in [(root,'candidate'),(pathlib.Path('/Users/liuyue/Desktop/Github_repos/dawn-science'),'main')]:
 checks[label]={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'status':subprocess.check_output(['git','status','--porcelain=v1'],cwd=repo,text=True)}
(out/f'{sys.argv[1]}-identity.json').write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps(checks,indent=2))
