"""Retain accepted native snow coverage over the eight rebuilt Soviet families."""
import json
import os
import subprocess
from pathlib import Path

root = Path('.artifacts/4x-regeneration')
source = str(Path(__file__).resolve().parents[3] / '.local/archive-compat/soviet-snow-20260924')
env = {**os.environ, 'RA2_EXPORT_DENSITY': '4', 'RA2_COVERAGE_SOURCE': source,
       'RA2_DENSITY_SELECTION': str(root / 'soviet-density-selection-v1.json'),
       'RA2_EXPORT_OUTPUT': str(root / 'soviet-snow-exports-v1')}
rows = []
for name in ['NARADR', 'NADEPT', 'NATECH', 'NANRCT', 'NACLON', 'NAPSIS', 'NAMISL', 'NAWALL']:
    with (root / (name + '-SNOW-export-v1.log')).open('w') as log:
        result = subprocess.run(['python3', 'scripts/m1/building-coverage/produce-snow.py', name],
                                env=env, stdout=log, stderr=subprocess.STDOUT)
    print(name, 'SNOW', result.returncode, flush=True)
    rows.append({'identity': name, 'exitCode': result.returncode})
    assert result.returncode == 0, (name, 'Snow export failed')
(root / 'soviet-snow-export-report-v1.json').write_text(json.dumps(rows, indent=2) + '\n')
