"""Create data-only immutable revisions and a complete recursive binding map."""
import copy
import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from audit import frames, load_pair
from paint import complete_data

ROOT = Path('.artifacts/owner-remap-r1')
LOCAL = Path('.local')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--stage', default='staged-packs')
parser.add_argument('--revision', default='owner-r1')
parser.add_argument('--mapping', default='correction-map.json')
args = parser.parse_args()
STAGE = ROOT / args.stage
REVISION = args.revision
STAGE.mkdir(exist_ok=False)
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
hashes, paths, records, processed = {}, {}, [], {}


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')


def target(path):
    relative = path.relative_to(LOCAL / 'hd-packs')
    return STAGE / relative.parts[0] / REVISION / Path(*relative.parts[2:])


def clone(source, destination):
    for path in source.rglob('*'):
        if not path.is_file():
            continue
        out = destination / path.relative_to(source)
        if not out.exists():
            out.parent.mkdir(parents=True, exist_ok=True)
            os.link(path, out)


def identity(manifest):
    value = manifest.get('identity') or manifest.get('family') or manifest.get('rulesIdentities', [manifest.get('packId', 'HTNK')])[0]
    if value.startswith(('allied-coverage-', 'soviet-coverage-')):
        return value.split('-')[2].upper()
    if value.startswith('soviet-'):
        return value.split('-')[1].upper()
    return value


def correct(file):
    if file in processed:
        return processed[file]
    manifest = read(file)
    original = copy.deepcopy(manifest)
    out = target(file)
    changes, neutral, cache = 0, 0, {}
    if file.name == 'family.json':
        for binding in manifest['members']:
            child = LOCAL / 'hd-packs' / binding['packId'] / binding['revision'] / 'manifest.json'
            new = correct(child)
            if new != child:
                binding.update(revision=REVISION, sha256=sha(new))
        if manifest.get('requiredVxl'):
            binding = manifest['requiredVxl']
            new = correct(LOCAL / binding['path'])
            if new != LOCAL / binding['path']:
                binding.update(path='hd-packs/' + str(new.relative_to(STAGE)), sha256=sha(new))
        if manifest.get('turret'):
            binding = manifest['turret']
            child = LOCAL / binding['path'] / 'manifest.json' if binding.get('path') else file.parent / 'turret/manifest.json'
            new = correct(child)
            if new != child:
                binding['sha256'] = sha(new)
                if binding.get('path'):
                    binding['path'] = 'hd-packs/' + str(new.parent.relative_to(STAGE)) + '/'
    else:
        for row in frames(manifest, file.parent):
            key = (row['base'], row['data'])
            if key not in cache:
                base, data = load_pair(*key)
                cache[key] = [base, data, data.copy()]
            base, current, before = cache[key]
            x, y, w, h = row['rect']
            patch, count, fixed = complete_data(base[y:y+h, x:x+w], current[y:y+h, x:x+w],
                row['density'], identity(manifest), row['member'], row.get('heading'))
            current[y:y+h, x:x+w] = patch
            changes += count
            neutral += fixed
        if changes:
            clone(file.parent, out.parent)
            changed_files = []
            for (base, data), (_, values, before) in cache.items():
                assert sha(target(base)) == sha(base), 'Base PNG must remain byte-identical'
                if np.array_equal(values, before):
                    continue
                dest = target(data)
                # Break the staging hardlink before writing a new data payload.
                dest.unlink()
                if data.suffix == '.mask':
                    dest.write_bytes(values[..., 0].tobytes())
                else:
                    Image.fromarray(values).save(dest)
                changed_files.append({'before': str(data), 'after': str(dest),
                    'beforeSha256': sha(data), 'afterSha256': sha(dest)})
                if 'variants' in manifest:
                    for variant in manifest['variants']:
                        for page in variant['pages']:
                            if file.parent / page['data'] == data:
                                page.update(dataSha256=sha(dest), dataBytes=dest.stat().st_size)
                elif manifest.get('schema') == 'unit-vxl-family-v1':
                    for part in manifest['parts']:
                        if file.parent / part['files']['data']['file'] == data:
                            part['files']['data'].update(sha256=sha(dest), bytes=dest.stat().st_size)
                elif 'headings' in manifest:
                    for heading in manifest['headings']:
                        if file.parent / heading['mask'] == data:
                            heading.update(maskSha256=sha(dest), maskBytes=dest.stat().st_size)
                else:
                    manifest['parts'][data.stem]['maskSha256'] = sha(dest)
            if 'packRevision' in manifest:
                manifest['packRevision'] = REVISION
            if 'revision' in manifest:
                manifest['revision'] = REVISION
            manifest['ownerColorCorrection'] = {'previousSha256': sha(file), 'basePngBytes': 'UNCHANGED',
                'logicalGeometry': 'UNCHANGED', 'addedOwnerPixels': changes,
                'policy': 'Authored paint components; no native silhouette clipping; fixed materials and emission excluded'}
            records.append({'identity': identity(manifest), 'manifest': str(file),
                'addedOwnerPixels': changes, 'classifiedNeutralPixels': neutral, 'files': changed_files})
    if manifest != original:
        clone(file.parent, out.parent)
        # Never write through a retained manifest's staging hardlink.
        if out.exists():
            out.unlink()
        write(out, manifest)
        hashes[sha(file)] = sha(out)
        paths[str(file.relative_to(LOCAL))] = 'hd-packs/' + str(out.relative_to(STAGE))
        processed[file] = out
    else:
        processed[file] = file
    return processed[file]


for root in read(ROOT / 'selected-roots.json'):
    correct(LOCAL / root)
    if len(processed) % 20 == 0:
        print('Processed manifests/families', len(processed), flush=True)
write(ROOT / args.mapping, {'revision': REVISION, 'hashes': hashes, 'paths': paths, 'records': records})
for file in sorted(STAGE.rglob('*')):
    if not file.is_file():
        continue
    dest = LOCAL / 'hd-packs' / file.relative_to(STAGE)
    assert not dest.exists(), ('Immutable resource collision', dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    os.link(file, dest)
print(json.dumps({'changedManifestsAndFamilies': len(hashes), 'correctedResources': len(records),
                  'addedOwnerPixels': sum(r['addedOwnerPixels'] for r in records)}), flush=True)
