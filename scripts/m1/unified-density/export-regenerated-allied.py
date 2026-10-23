"""Re-export only the eight regenerated Allied families at corrected 4x coordinates."""
import json
import os
import subprocess
from pathlib import Path

root = Path('.artifacts/4x-regeneration')
env = {**os.environ, 'RA2_EXPORT_DENSITY': '4',
       'RA2_REGENERATED_MASTERS': str(root / 'building-master-map-v1.json'),
       'RA2_EXPORT_OUTPUT': str(root / 'allied-building-exports-v2')}
rows = []
for name, script in [('GAPILE', 'barracks'), ('GACSPH', 'chronosphere'), ('GACNST', 'conyard'),
                     ('GAWEAP', 'factory'), ('GATECH', 'lab'), ('GAREFN', 'refinery'),
                     ('GAYARD', 'shipyard'), ('GTGCAN', 'turret-bases')]:
    for theater in ['TEMPERATE', 'SNOW']:
        args = [name] if name == 'GTGCAN' else []
        with (root / (name + '-' + theater + '-export-v2.log')).open('w') as log:
            result = subprocess.run(['python3', f'scripts/m1/allied-buildings/compose-{script}.py', *args, theater],
                                    env=env, stdout=log, stderr=subprocess.STDOUT)
        print(name, theater, result.returncode, flush=True)
        rows.append({'identity': name, 'theater': theater, 'exitCode': result.returncode})
        assert result.returncode == 0
(root / 'allied-buildings-export-report-v2.json').write_text(json.dumps(rows, indent=2) + '\n')
