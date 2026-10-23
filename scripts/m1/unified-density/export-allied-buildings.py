"""Recompose complete candidates; retain family-level source-sampling exceptions."""
import json
import os
from pathlib import Path
import subprocess

root = Path('.artifacts/unified-density/allied-buildings-4x-v1')
root.mkdir(parents=True, exist_ok=False)
jobs = [(name, []) for name in ['airfield', 'barracks', 'chronosphere', 'conyard', 'depot',
        'factory', 'lab', 'prism', 'purifier', 'refinery', 'robot', 'satellite', 'shipyard', 'walls', 'weather']]
jobs += [('static', [name]) for name in ['GAGAP', 'GAPILL']]
jobs += [('turret-bases', [name]) for name in ['NASAM', 'GTGCAN']]
report = []
for name, args in jobs:
    for theater in ['TEMPERATE', 'SNOW']:
        log = root / f'{name}-{args[0] if args else "family"}-{theater}.log'
        with log.open('w') as stream:
            result = subprocess.run(['python3', f'scripts/m1/allied-buildings/compose-{name}.py', *args, theater],
                env={**os.environ, 'RA2_EXPORT_DENSITY': '4', 'RA2_EXPORT_OUTPUT': str(root / 'exports')},
                stdout=stream, stderr=subprocess.STDOUT)
        report.append({'script': name, 'arguments': args, 'theater': theater, 'exitCode': result.returncode,
                       'log': str(log), 'tail': log.read_text()[-1000:]})
        (root / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
        print(name, args, theater, result.returncode, flush=True)
