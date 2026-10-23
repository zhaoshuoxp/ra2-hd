"""Save a built-in image edit as a new immutable batch and bind its provenance."""

import hashlib
import json
import shutil
import sys
from pathlib import Path

work = Path('.artifacts/m1-7/deso-green-v1/worklist.json')
data = json.loads(work.read_text())
batch = data['families']['DESO']['members'][0]['batches'][int(sys.argv[1])]
source = Path(sys.argv[2])
output = work.parent / (batch['id'] + '.png')
revision = 1
while output.exists():
    revision += 1
    output = work.parent / (batch['id'] + f'-v{revision}.png')
shutil.copyfile(source, output)
batch.setdefault('priorSelectedArt', batch['selectedArt'])
batch['alphaFrom'] = batch['priorSelectedArt']
batch.setdefault('correctionHistory', []).append(batch['selectedArt'])
batch['selectedArt'] = str(output)
batch['selectedArtSha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
batch['generatedSource'] = str(source)
batch['correction'] = 'GREEN_RADIATION_CANISTERS'
work.write_text(json.dumps(data, indent=2) + '\n')
print(batch['id'])
