"""Add true 4x variants while preserving accepted 2x atlas bytes and geometry."""
import argparse
import copy
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', choices=['dry', 'snow', 'allied-fix', 'soviet-fix'])
parser.add_argument('--revision')
parser.add_argument('--exports-version', default='v2')
parser.add_argument('--identities', nargs='+')
args = parser.parse_args()
root = Path('.artifacts/4x-regeneration')
packs = root / ('staged-packs-v2' if args.stage == 'allied-fix' else 'staged-packs-v1')
revision = 'regen4x2' if args.stage == 'allied-fix' else 'regen4x1'
if args.revision:
    assert args.stage in ['allied-fix', 'soviet-fix']
    revision = args.revision
    packs = root / ('staged-packs-' + revision)
unit_names = ['E1', 'GGI', 'JUMPJET', 'CLEG', 'SNIPE', 'TANY', 'GHOST', 'DLPH']
allied_names = ['GAPILE', 'GACSPH', 'GACNST', 'GAWEAP', 'GATECH', 'GAREFN', 'GAYARD', 'GTGCAN']
soviet_names = ['NARADR', 'NADEPT', 'NATECH', 'NANRCT', 'NACLON', 'NAPSIS', 'NAMISL', 'NAWALL']
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
read = lambda p: json.loads(Path(p).read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')


def build_variant(old, records, exports, out):
    logical = old['logical']['frames']
    assert len(records) == len(logical)
    assert [r['nativeFrame'] for r in records] == list(range(len(logical)))
    images, seen, aliases = {}, {}, {}
    for n, row in enumerate(records):
        e = row['exports'][0]
        assert e['density'] == 4
        pair = [Image.open(exports / e[role]).convert('RGBA') for role in ['base', 'data']]
        expected = tuple(max(1, v * 4) for v in logical[n]['legacyRenderSize'])
        assert all(i.size == expected for i in pair), (n, expected)
        key = (tuple(logical[n]['trimSize']), logical[n]['empty'], *(hashlib.sha256(i.tobytes()).hexdigest() for i in pair))
        if key in seen:
            aliases[n] = seen[key]
        else:
            seen[key] = n
            images[n] = pair
    layouts, placements = [], {}
    for n in sorted(images, key=lambda n: (-images[n][0].height, -images[n][0].width, n)):
        # Empty native frames use a 1x1 export placeholder but retain zero UV extent.
        w, h = (v * 4 for v in logical[n]['legacyRenderSize'])
        choices = [(r['height'] - h - 4, 2048 - r['x'] - w - 4, pi, ri)
                   for pi, rows in enumerate(layouts) for ri, r in enumerate(rows)
                   if h + 4 <= r['height'] and r['x'] + w + 4 <= 2048]
        if choices:
            _, _, pi, ri = min(choices)
            shelf = layouts[pi][ri]
        else:
            pi = next((i for i, rows in enumerate(layouts) if sum(r['height'] for r in rows) + h + 4 <= 2048), len(layouts))
            if pi == len(layouts):
                layouts.append([])
            shelf = {'x': 0, 'y': sum(r['height'] for r in layouts[pi]), 'height': h + 4}
            layouts[pi].append(shelf)
        x, y = shelf['x'] + 2, shelf['y'] + 2
        placements[n] = {'nativeFrame': n, 'page': f'p{pi}', 'sampleRect': [x, y, w, h],
                         'contentRect': [x, y, *(v * 4 for v in logical[n]['trimSize'])]}
        shelf['x'] += w + 4
    assert len(layouts) <= 8, (old['packId'], 'page limit', len(layouts))
    pages = []
    for pi, shelves in enumerate(layouts):
        size = [max(r['x'] for r in shelves), sum(r['height'] for r in shelves)]
        page = {'id': f'p{pi}', 'size': size}
        for index, role in enumerate(['base', 'data']):
            image = Image.new('RGBA', size, (0, 0, 0, 255 if role == 'data' else 0))
            for n, placement in placements.items():
                if placement['page'] == page['id']:
                    image.paste(images[n][index], tuple(placement['sampleRect'][:2]))
            filename = f'4x-p{pi}-{role}.png'
            image.save(out / filename)
            page.update({role: filename, role + 'Sha256': sha(out / filename), role + 'Bytes': (out / filename).stat().st_size})
        pages.append(page)
    for n, canonical in aliases.items():
        placements[n] = {**placements[canonical], 'nativeFrame': n, 'sharedWith': canonical}
    return {'density': 4, 'pages': pages, 'frames': [placements[n] for n in range(len(logical))]}


def merge_member(binding, exports=None, records=None, new_manifest=None):
    previous = Path('.local/hd-packs') / binding['packId'] / binding['revision']
    old = read(previous / 'manifest.json')
    assert sha(previous / 'manifest.json') == binding['sha256']
    out = packs / binding['packId'] / revision
    out.mkdir(parents=True, exist_ok=False)
    low = next(v for v in old['variants'] if v['density'] == 2)
    for page in low['pages']:
        for role in ['base', 'data']:
            shutil.copyfile(previous / page[role], out / page[role])
            assert sha(out / page[role]) == page[role + 'Sha256']
    if new_manifest:
        new = read(new_manifest)
        assert new['source'] == old['source'] and new['logical'] == old['logical']
        high = next(v for v in new['variants'] if v['density'] == 4)
        for page in high['pages']:
            for role in ['base', 'data']:
                shutil.copyfile(new_manifest.parent / page[role], out / page[role])
                assert sha(out / page[role]) == page[role + 'Sha256']
        provenance = {'fourXManifest': str(new_manifest), 'sha256': sha(new_manifest)}
    else:
        high = build_variant(old, records, exports, out)
        provenance = {'fourXExports': str(exports), 'sha256': sha(exports / 'candidate-review.json')}
    manifest = {**old, 'packRevision': revision, 'variants': [low, high],
                'densityRegeneration': {'accepted2xManifest': str(previous / 'manifest.json'),
                                        'accepted2xSha256': binding['sha256'], **provenance,
                                        'status': 'TRUE_4X_NATIVE_GEOMETRY_PRESERVED_VISUAL_REVIEW_PENDING'}}
    assert manifest['logical'] == old['logical'] and manifest['variants'][0] == low
    write(out / 'manifest.json', manifest)
    return {**binding, 'revision': revision, 'sha256': sha(out / 'manifest.json')}


def merge_family(path, expected_hash, exports=None, unit=None, turret=None):
    previous = Path('.local') / path
    assert sha(previous) == expected_hash
    old = read(previous)
    relative = previous.relative_to('.local/hd-packs').parent.parent / revision
    out = packs / relative
    out.mkdir(parents=True, exist_ok=False)
    family = copy.deepcopy(old)
    report = read(exports / 'candidate-review.json') if exports else None
    if report:
        assert report['density'] == 4 and not report.get('samplingAuditOnly')
    family['members'] = []
    for binding in old['members']:
        new_manifest = None
        if unit:
            new_manifest = Path('.artifacts/allied-units/staged-packs') / binding['packId'] / 'true4x-r1/manifest.json'
        rows = [r for r in report['frames'] if r['member'] == binding['member']] if report else None
        family['members'].append(merge_member(binding, exports, rows, new_manifest))
    family['densityRegeneration'] = {'previousFamily': str(previous), 'previousSha256': expected_hash,
                                    'accepted2xBytes': 'PRESERVED', 'status': 'TECHNICAL_CANDIDATE_VISUAL_ACCEPTANCE_PENDING'}
    if turret:
        shutil.copytree(turret, out / 'turret')
        family['turret'] = {'sha256': sha(out / 'turret/manifest.json'), 'path': 'hd-packs/' + str(relative) + '/turret/'}
    elif family.get('turret'):
        raise AssertionError('Unexpected turret in regenerated family')
    write(out / 'family.json', family)
    return 'hd-packs/' + str(relative / 'family.json'), sha(out / 'family.json'), family


if args.stage == 'dry':
    catalogs = {name: read('desktop/' + name + '.json') for name in
                ['allied-unit-contracts', 'allied-building-coverage', 'soviet-building-coverage']}
    baseline = read(root / 'baseline-soviet-bindings-v1.json')
    soviet = {'sovietBatchIdentities': dict(baseline['sovietBatchIdentities']),
              'sovietBatchRevisions': dict(baseline['sovietBatchRevisions'])}
    for name in unit_names:
        entry = catalogs['allied-unit-contracts']['shp'][name]
        path, digest, family = merge_family(entry['familyPath'], entry['hash'], unit=name)
        entry.update(familyPath=path, hash=digest, familyHash=digest, density=4)
        for definition, binding in zip(entry['members'], family['members']):
            assert definition['member'] == binding['member']
            definition['manifestHash'] = binding['sha256']
        print(name, '2X_PRESERVED_4X_ADDED', flush=True)
    for name in allied_names:
        for theater in ['TEMPERATE', 'SNOW']:
            key = name.lower() + '-' + theater.lower()
            entry = catalogs['allied-building-coverage'][key]
            exports = root / 'allied-building-exports-v1' / (name if theater == 'TEMPERATE' else name + '-SNOW')
            turret = root / 'turret-exports-v1/GTGCAN' if name == 'GTGCAN' and theater == 'TEMPERATE' else None
            path, digest, _ = merge_family(entry['familyPath'], entry['familyHash'], exports, turret=turret)
            entry.update(familyPath=path, familyHash=digest, density=4)
            print(key, '2X_PRESERVED_4X_ADDED', flush=True)
    selection = read(root / 'soviet-production-selection-v1.json')
    density_selection = {}
    for name in soviet_names:
        key = name.lower()
        path = f'hd-packs/soviet-{key}-authored/{baseline["sovietBatchRevisions"][key]}/family.json'
        path, digest, _ = merge_family(path, baseline['sovietBatchIdentities'][key], Path(selection[name]['exports']))
        soviet['sovietBatchIdentities'][key] = digest
        soviet['sovietBatchRevisions'][key] = revision
        density_selection[name] = '.local/' + path
        print(name, '2X_PRESERVED_4X_ADDED', flush=True)
    write(root / 'soviet-density-selection-v1.json', density_selection)
    write(root / 'candidate-soviet-bindings-v1.json', soviet)
elif args.stage == 'snow':
    catalogs = {name: read(root / ('candidate-' + name + '-v1.json')) for name in
                ['allied-unit-contracts', 'allied-building-coverage', 'soviet-building-coverage']}
    for name in soviet_names:
        key = name.lower() + '-snow'
        entry = catalogs['soviet-building-coverage'][key]
        path, digest, _ = merge_family(entry['familyPath'], entry['familyHash'], root / 'soviet-snow-exports-v1' / name)
        entry.update(familyPath=path, familyHash=digest, density=4)
        print(key, '2X_PRESERVED_4X_ADDED', flush=True)
elif args.stage == 'soviet-fix':
    catalogs = {}
    soviet = read(root / 'candidate-soviet-bindings-v1.json')
    selection = read(root / 'soviet-production-selection-v1.json')
    for name in args.identities or ['NAMISL']:
        assert name in soviet_names
        key = name.lower()
        path = f'hd-packs/soviet-{key}-authored/{soviet["sovietBatchRevisions"][key]}/family.json'
        path, digest, _ = merge_family(path, soviet['sovietBatchIdentities'][key], Path(selection[name]['exports']))
        soviet['sovietBatchIdentities'][key] = digest
        soviet['sovietBatchRevisions'][key] = revision
        print(name, 'EMPTY_NATIVE_FRAME_EXTENTS_FIXED', flush=True)
    write(root / 'candidate-soviet-bindings-v2.json', soviet)
else:
    catalogs = {name: read('desktop/' + name + '.json') for name in
                ['allied-unit-contracts', 'allied-building-coverage', 'soviet-building-coverage']}
    for name in args.identities or allied_names:
        assert name in allied_names
        for theater in ['TEMPERATE', 'SNOW']:
            key = name.lower() + '-' + theater.lower()
            entry = catalogs['allied-building-coverage'][key]
            exports = root / ('allied-building-exports-' + args.exports_version) / (name if theater == 'TEMPERATE' else name + '-SNOW')
            turret = root / 'turret-exports-v1/GTGCAN' if name == 'GTGCAN' and theater == 'TEMPERATE' else None
            path, digest, _ = merge_family(entry['familyPath'], entry['familyHash'], exports, turret=turret)
            entry.update(familyPath=path, familyHash=digest, density=4)
            print(key, 'DENSITY_COORDINATES_FIXED', flush=True)
for name, catalog in catalogs.items():
    version = args.revision if args.revision else 'v2' if args.stage == 'allied-fix' else 'v1'
    write(root / ('candidate-' + name + '-' + version + '.json'), catalog)
# Install additions only; candidate catalogs remain separate until runtime review.
for source in sorted(packs.rglob('*')):
    if not source.is_file():
        continue
    destination = Path('.local/hd-packs') / source.relative_to(packs)
    if destination.exists():
        assert sha(source) == sha(destination), ('Immutable collision', destination)
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
print('NEW_PACKS_INSTALLED_CATALOGS_NOT_PROMOTED', flush=True)
