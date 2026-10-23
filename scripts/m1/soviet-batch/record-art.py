"""Bind immutable built-in outputs, exact saved prompts and reference roles."""
import hashlib,json
from pathlib import Path
root=Path('.artifacts/m1-6b');generated=Path('/Users/Aone/.codex/generated_images/01a0bc88-6240-72f1-b7cf-bd44db1ea71e')
outputs={
 'NAHAND':{'normal':'2f690bba-b052-42f2-ad19-377745566ba8','damaged':'8fd448a4-0de5-40b9-93f3-97cb08242bd0'},
 'NAREFN':{'normal':'70a78f1e-139b-4bfa-b62d-c257e1c98ed6','unload':'8d7fb6b9-3764-4256-83f6-800a09a8878d'},
 'NAWEAP':{'normal':'d67f2d60-deb2-46a3-b162-00f32bd42f87','open':'e4322def-581e-4b96-869f-5037a51c4ff1'},
 'NACNST':{'normal':'dc5b3255-1569-420d-ae23-aeb6927cc2b5','production':'8f84c364-54e9-4be0-ab9c-bc7c44358d82'}}
def identity(p):return {'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
report={'tool':'built-in image_gen','paidApiFallback':False,'families':{}}
ledger=json.loads((root/'ledger.json').read_text())
for id,states in outputs.items():
 rows=[]
 for state,uuid in states.items():
  raw=root/'art-v1'/id/f'{state}-raw.png';source=generated/f'exec-{uuid}.png';assert raw.read_bytes()==source.read_bytes()
  if state=='normal':refs=[(root/'references-v1'/id/'normal-reference.png','authoritative original architecture'),(Path('.artifacts/m1-6a/art-v1/normal-raw.png'),'accepted material style only')]
  elif id=='NAREFN':refs=[(root/'references-v1'/id/'unload-particles-reference-clean.png','authoritative local effect shape'),(root/'art-v1'/id/'normal-raw.png','authored material style only')]
  else:refs=[(root/'art-v1'/id/'normal-raw.png','edit target; lock unchanged structure'),(root/'references-v1'/id/f'{state}-reference.png','authoritative changed state')]
  rows.append({'state':state,'raw':identity(raw),'generatedSource':str(source),'prompt':identity(root/'art-v1'/id/f'{state}-prompt.txt'),'references':[{**identity(p),'role':role}for p,role in refs]})
 report['families'][id]=rows;ledger['families'][id]['masters']=rows;ledger['families'][id]['status']='sample authored; runtime review pending';ledger['families'][id]['checks']['art']='REPRESENTATIVE_AUTHORED_UNAPPROVED'
out=root/'art-v1/provenance.json';assert not out.exists();out.write_text(json.dumps(report,indent=2)+'\n');(root/'ledger.json').write_text(json.dumps(ledger,indent=2)+'\n')
print('Bound eight built-in outputs and prompts across four families.')
