"""Prepare bounded original guides for every unresolved campaign TMP member."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('inventory', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[2]
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
write = lambda file, value: file.open('x').write(json.dumps(value, indent=2) + '\n')
inventory = read(args.inventory)
rows = [row for row in inventory['rows'] if row['kind'] == 'tmp' and row['decision'] == 'MISSING_AUTHORED_FAMILY']
output = args.output.resolve(); output.mkdir(exist_ok=False)
environment = {**os.environ, 'RA2_TEST_EDITION': 'yr', 'RA2_TEST_RESOURCE_ROOT': str(ROOT / '.local')}
records = []
for theater in sorted({row['theater'] for row in rows}):
    directory = output / theater.lower(); directory.mkdir()
    selected = [row for row in rows if row['theater'] == theater]
    assert len({row['source']['member'] for row in selected}) == len(selected)
    ledger_file = directory / 'inventory.json'
    write(ledger_file, {**inventory, 'rows': selected,
        'qualification': 'Original TMP guide preparation only; no authored resources or runtime registration.'})
    pointer_file = ROOT / ('.local/terrain' + ('' if theater == 'TEMPERATE' else '-' + theater.lower()) + '-selection.json')
    pointer = read(pointer_file)
    assert sha(ROOT / '.local/terrain-packs' / pointer['revision'] / 'manifest.json') == pointer['sha256']
    write(directory / 'accepted-selector-before.json', pointer)
    prepared = directory / 'original-r1'
    with (directory / 'prepare-original-r1.log').open('x') as log:
        subprocess.run(['bun', 'scripts/m2/official-maps/prepare.ts', str(ledger_file), str(prepared), theater],
            cwd=ROOT, env=environment, check=True, stdout=log, stderr=subprocess.STDOUT)
    authored = directory / 'authoring-r1'
    with (directory / 'prepare-guides-r1.log').open('x') as log:
        subprocess.run(['python3', 'scripts/m2/prepare-showcase-production.py', str(authored), '--prepared', str(prepared),
            '--inventory', str(ledger_file), '--board-size', '2048', '2048'],
            cwd=ROOT, env=environment, check=True, stdout=log, stderr=subprocess.STDOUT)
    assert read(pointer_file) == pointer
    batches = read(authored / 'batches.json')
    assert sum(len(batch['members']) for batch in batches) == len(selected)
    records.append(dict(theater=theater, members=len(selected), batches=len(batches),
        directory=str(directory), preparedSourceSha256=sha(prepared / 'source.json'),
        authoringSourceSha256=sha(authored / 'source.json'), selector=pointer,
        runtimeRegistration='NOT_REGISTERED', authoredHd='PENDING'))
    print(json.dumps(records[-1]), flush=True)
write(output / 'preparation.json', dict(schema='yr-remaining-native-terrain-guides-v1',
    status='ORIGINAL_GUIDES_ONLY_NOT_AUTHORED_HD', inventory=str(args.inventory), inventorySha256=sha(args.inventory),
    members=len(rows), theaters=records, runtimeSelectionsChanged=0, copiedAcceptedAtlasFiles=0,
    userVisualAcceptance='PENDING'))
