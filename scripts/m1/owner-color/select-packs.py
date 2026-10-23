"""Select the complete immutable correction graph; preserve historical receipts."""
import json
import re
import argparse
from pathlib import Path

root = Path('.artifacts/owner-remap-r1')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--mapping', default='correction-map.json')
args = parser.parse_args()
mapping = json.loads((root / args.mapping).read_text())
hashes, paths = mapping['hashes'], mapping['paths']


def replace(value):
    if isinstance(value, dict):
        return {k: replace(v) for k, v in value.items()}
    if isinstance(value, list):
        return [replace(v) for v in value]
    return hashes.get(value, paths.get(value, value)) if isinstance(value, str) else value


changed = []
for path in [Path('desktop') / (name + '.json') for name in
        ['allied-unit-contracts', 'allied-building-coverage', 'soviet-building-coverage', 'building-turret-contracts']]:
    previous = json.loads(path.read_text())
    updated = replace(previous)
    if updated != previous:
        path.write_text(json.dumps(updated, indent=2) + '\n')
        changed.append(str(path))
for path in [*Path('src').rglob('*.ts'), Path('desktop/hd-profile.mjs'), Path('scripts/editions/package-mac-test.mjs')]:
    before = path.read_text()
    after = re.sub(r'[a-f0-9]{64}', lambda m: hashes.get(m[0], m[0]), before)
    for old, new in paths.items():
        after = after.replace(old, new)
        # The Rhino registrar holds a directory prefix rather than a manifest path.
        if 'rhino-authored/' in old and old.endswith('/manifest.json'):
            after = after.replace(str(Path(old).parent) + '/', str(Path(new).parent) + '/')
    if path.name == 'hd-profile.mjs':
        for old, new in paths.items():
            if 'conscript-authored/' in old and old.endswith('/manifest.json'):
                after = after.replace(f"validateHdPack(root, 'conscript-authored', '{Path(old).parent.name}',",
                    f"validateHdPack(root, 'conscript-authored', '{Path(new).parent.name}',")
        def revisions(match):
            body = match[1]
            return 'export const sovietBatchRevisions = {' + re.sub(r"(\w+): '([^']+)'", lambda m:
                f"{m[1]}: '{Path(paths[f'hd-packs/soviet-{m[1]}-authored/{m[2]}/family.json']).parent.name}'"
                if f'hd-packs/soviet-{m[1]}-authored/{m[2]}/family.json' in paths else m[0], body) + '};'
        after = re.sub(r'export const sovietBatchRevisions = \{(.*?)\};', revisions, after)
    if before != after:
        path.write_text(after)
        changed.append(str(path))
(root / 'selection-changes.json').write_text(json.dumps({'files': changed,
    'previousResources': 'Preserved at their immutable paths', 'newRevision': mapping['revision']}, indent=2) + '\n')
print(json.dumps(changed, indent=2))
