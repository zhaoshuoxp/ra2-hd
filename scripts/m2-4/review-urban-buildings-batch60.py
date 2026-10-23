"""Combine sixteen new buildings and two authorized facility repairs in one embedded review."""
import json
import subprocess
from pathlib import Path

base = Path('.artifacts/m2-4')
plan = json.loads((base / 'urban-buildings-native-batch60-v1/native-plan-v2.json').read_text())
root = base / 'urban-buildings-review-batch60-v1'
command = ['python3', 'scripts/m2-4/review-environment-batch.py', str(root)]
for row in plan['cases']:
    output = row['output']
    label = f"{row['edition'].upper()}-{row['sourceMapId'].split(':', 1)[1]}-batch60"
    command += ['--case', label, output + '-original-v1', output + '-2x-v1', output + '-4x-v1']
facility = base / 'urban-placeholder-hd-repair-v1'
command += ['--case', 'RA2-original-archive-mp28u4-authorized-facility-repair',
    str(facility / 'native-ra2-original-v1'), str(facility / 'native-ra2-2x-v1'), str(facility / 'native-ra2-4x-v1'),
    '--comparisons', str(base / 'urban-buildings-comparisons-batch60-2x-v1'),
    str(base / 'urban-buildings-comparisons-batch60-4x-v1'),
    '--additional-comparisons', str(base / 'urban-facility-repair-comparisons-2x-v1'),
    str(base / 'urban-facility-repair-comparisons-4x-v1'), '--building-states', '--theater', 'URBAN',
    '--title', 'M2.4 Urban batch 60: 16 complete buildings and two authorized facility repairs',
    '--summary', 'Review only these 18 new art families: sixteen complete building sources and the two explicitly '
    'authorized lamp/pole developer-board repairs. Earlier accepted artwork is reused. Native Original/2X/4X scenes, '
    'applicable building states, source comparisons and fixed-budget release checks pass. Source architecture, '
    'geometry, original shadows, original non-garrison restrictions and gameplay remain intact. The two facilities '
    'retain their single original body state; damage views demonstrate native behavior without inventing extra art. '
    'Full Mac game copies are omitted for this batch; final independent milestone delivery remains open. '
    'Windows NOT_RUN. M2.4 remains incomplete.']
subprocess.run(command, check=True)
subprocess.run(['python3', 'scripts/m2-4/embed-review.py', '--source', str(root), '--output',
    str(root / 'M2.4-Urban-Batch60-Embedded.html')], check=True)
