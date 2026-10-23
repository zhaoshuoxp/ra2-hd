"""Bind approved representatives and prepare all native snow/state guides."""
import json
import sys
from pathlib import Path
from production_common import ROOT, INVENTORY, row_for, resting, sha
from PIL import Image

out = ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'production-guides-v1')
out.mkdir(exist_ok=False)
receipt = json.loads((ROOT / 'representative-acceptance-v1.json').read_text())
assert receipt['status'] == 'REPRESENTATIVES_ACCEPTED_FULL_PRODUCTION_AUTHORIZED'
assert sha(receipt['review']) == receipt['reviewSha256']
report = {}
for identity in INVENTORY['union']:
    for theater in (['TEMPERATE', 'SNOW'] if identity in ['NAINDP', 'NABNKR'] else ['SNOW']):
        row = row_for(identity, theater)
        directory = out / (identity + '-' + theater)
        directory.mkdir()
        for label, image in [('normal', resting(row)), ('damaged', resting(row, True))]:
            image.save(directory / (label + '.png'))
            image.resize(tuple(n * 4 for n in image.size), Image.Resampling.NEAREST).save(directory / (label + '-reference.png'))
        if identity == 'NABNKR':
            image = resting(row, occupied=True)
            image.resize(tuple(n * 6 for n in image.size), Image.Resampling.NEAREST).save(directory / 'occupied-reference.png')
        report[identity + '-' + theater] = {'row': [row['edition'], theater, identity],
            'members': [{'member': m['source']['member'], 'sha256': m['source']['sha256'], 'roles': m['roles'],
                         'nativeVisible': m['visibleFrames'], 'total': m['totalFrames']} for m in row['members']]}
(out / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
print('Prepared', len(report), 'native family guides')
