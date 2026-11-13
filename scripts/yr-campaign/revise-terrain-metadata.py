"""Publish a bounded terrain metadata revision with unchanged atlas hard links."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('ledger', type=Path)
parser.add_argument('revision')
parser.add_argument('output', type=Path)
args = parser.parse_args()
assert re.fullmatch(r'yr-desert-source-reuse-r[1-9][0-9]*', args.revision)
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
ledger = read(args.ledger)
selected = ledger['selectedPack']
pointer_file = Path('.local/terrain-desert-selection.json')
contract_file = Path('desktop/terrain-theater-hd-contracts.json')
contracts = read(contract_file)
assert read(pointer_file) == contracts['DESERT'] == selected
old = Path('.local/terrain-packs') / selected['revision']
assert sha(old / 'manifest.json') == selected['sha256']
manifest = read(old / 'manifest.json')
destination = old.with_name(args.revision)
destination.mkdir(exist_ok=False)
files = set()
for group in manifest['groups']:
    for variant in group['variants']:
        name = variant['file']
        assert re.fullmatch(r'[a-z0-9-]+\.rgba', name)
        assert sha(old / name) == variant['sha256']
        if name not in files:
            os.link(old / name, destination / name)
        files.add(name)
manifest['revision'] = args.revision
payload = (json.dumps(manifest, separators=(',', ':')) + '\n').encode()
assert len(payload) <= 2 * 1024 * 1024
(destination / 'manifest.json').open('xb').write(payload)
pointer = dict(schemaVersion=1, revision=args.revision, sha256=sha(destination / 'manifest.json'))
ledger['selectedPack'] = pointer
ledger['metadataCorrection'] = dict(previousSelection=selected, originalAtlasBytesUnchanged=True,
    hardLinkedAtlases=len(files), copiedAtlasBytes=0, manifestBytes=len(payload),
    reason='Compact metadata stays within the existing desktop 2 MiB manifest bound.')
args.output.mkdir(exist_ok=False)
(args.output / 'report.json').open('xb').write(encode(dict(status='PASS_METADATA_ONLY_TERRAIN_REVISION_NATIVE_PENDING',
    **ledger['metadataCorrection'], selectedPack=pointer)))
pointer_file.write_bytes(encode(pointer))
contract_file.write_bytes(encode({**contracts, 'DESERT': pointer}))
args.ledger.write_bytes(encode(ledger))
print(json.dumps(dict(selectedPack=pointer, copiedAtlasBytes=0, manifestBytes=len(payload))))
