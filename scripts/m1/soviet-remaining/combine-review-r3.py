"""Combine final-app captures with corrected independent-turret owner fixtures."""
import json
import shutil
from pathlib import Path

root=Path('.artifacts/soviet-remaining')
base=root/'runtime-complete-r3-final';supplement=root/'runtime-r3-turret-colors'
out=root/'runtime-complete-r3-delivery';out.mkdir(exist_ok=False)
report=json.loads((base/'result.json').read_text());extra=json.loads((supplement/'result.json').read_text())
assert report['status']==extra['status']=='PASS_NATIVE_CONTROLLER_RENDER_REVIEW'
assert report['app']==extra['app']
for name in extra['families']:
 assert report['activation']['families'][name]==extra['activation']['families'][name]
 report['families'][name]=extra['families'][name]
for name in report['families']:
 source=supplement if name in extra['families'] else base
 (out/name).mkdir()
 for p in (source/name).glob('*.webp'):shutil.copyfile(p,out/name/p.name)
report['sourceRuns']=[str(base),str(supplement)]
report['fixtureCorrection']='Turret fixture now applies the blue owner to the independent turret as well as SHP layers; all captures use the same final R3 app.'
(out/'result.json').write_text(json.dumps(report,indent=2)+'\n')
print(len(report['families']),'final-app families combined')
