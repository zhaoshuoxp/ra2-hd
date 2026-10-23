"""Retain accepted snow transfer using complete 4x dry families."""
import json
import os
from pathlib import Path
import subprocess
import shutil
root=Path('.artifacts/unified-density/soviet-coverage-4x-v1');root.mkdir(exist_ok=False)
source = str(Path(__file__).resolve().parents[3] / '.local/archive-compat/soviet-snow-20260924')
env={**os.environ,'RA2_EXPORT_DENSITY':'4','RA2_COVERAGE_SOURCE':source,
     'RA2_DENSITY_SELECTION':'.artifacts/unified-density/soviet-density-selection-v1.json',
     'RA2_COVERAGE_NEW_EXPORTS':'.artifacts/unified-density/soviet-new-4x-v2/exports',
     'RA2_EXPORT_OUTPUT':str(root/'SNOW'),'RA2_COVERAGE_EXPORTS':str(root),'RA2_REPORT_DIR':str(root)}
(root/'TEMPERATE').mkdir()
for name in ['NAINDP','NABNKR']:
 shutil.copytree(Path(env['RA2_COVERAGE_NEW_EXPORTS'])/name,root/'TEMPERATE'/name)
keys=['naindp-temperate','nabnkr-temperate']
for name in ['NAHAND','NAREFN','NAWEAP','NACNST','NALASR','NAFLAK','NAIRON','NAINDP','NABNKR']:
 with (root/(name+'.log')).open('w') as log:r=subprocess.run(['python3','scripts/m1/building-coverage/produce-snow.py',name],env=env,stdout=log,stderr=subprocess.STDOUT)
 print(name,r.returncode,flush=True)
 if not r.returncode:keys.append(name.lower()+'-snow')
keys+=['nayard-snow','tesla-snow']
(root/'selection-keys.json').write_text(json.dumps(keys))
subprocess.run(['python3','scripts/m1/building-coverage/package-coverage.py','unified4x1',*keys],env=env,check=True)
