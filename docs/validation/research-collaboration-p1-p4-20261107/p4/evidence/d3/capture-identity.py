"""Run from repository root after build; capture D3 candidate identity and pilot delta."""
from pathlib import Path
import hashlib,json,datetime,subprocess
root=Path.cwd();out=root/'docs/validation/research-collaboration-p1-p4-20261107/p4/evidence/d3'
manifest=lambda paths:{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths) if p.is_file()}
src=manifest((root/'src').rglob('*'));build=manifest((root/'dist').rglob('*'))
pilotPath=root/'docs/validation/research-collaboration-p1-p4-20261107/p1/live-6bf54b69-6ab3-4909-9b36-85b7e7d5d993/candidate-src-sha256.json';pilot=json.loads(pilotPath.read_text())
delta={p:{'pilot':pilot.get(p),'candidate':src.get(p)} for p in sorted(set(pilot)|set(src)) if pilot.get(p)!=src.get(p)}
identity={'createdAt':datetime.datetime.now().isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'branch':subprocess.check_output(['git','branch','--show-current'],text=True).strip(),'sourceCount':len(src),'buildCount':len(build),'childSourceSha256':src['src/subagent/child.ts'],'childBuildSha256':build['dist/electron/subagent-child.js'],'productionScope':list(delta),'externalApiCalls':0,'formalProfileTouched':False}
for name,data in [('candidate-src-sha256.json',src),('candidate-build-sha256.json',build),('source-delta-from-pilot.json',{'baseline':str(pilotPath.relative_to(root)),'pilotCount':len(pilot),'candidateCount':len(src),'changed':delta}),('candidate-identity.json',identity)]: (out/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
