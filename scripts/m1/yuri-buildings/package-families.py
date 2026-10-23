"""Immutable dual-density Yuri SHP families; no accepted resource replacement."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image
from production_common import ROOT, row_for, raw_for, sha
from tile_pack import pack_tiled

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--identities', nargs='+', required=True)
parser.add_argument('--theaters', nargs='+', default=['TEMPERATE', 'SNOW'])
parser.add_argument('--exports', required=True)
parser.add_argument('--revision', required=True)
parser.add_argument('--catalog-output', type=Path, required=True)
parser.add_argument('--turrets', default='turret-exports-v2')
args = parser.parse_args()
assert not args.catalog_output.exists(), 'Candidate catalog receipts are immutable'
catalog = {}


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def pack_variant(member, density, source_dir, records, output):
    raw = raw_for(member['source']['sha256'])
    images, seen, aliases = {}, {}, {}
    for n, record in enumerate(records):
        assert record['nativeFrame'] == n and record['density'] == density
        native = raw['frames'][n]
        expected = tuple(v * density for v in native['legacyRenderSize'])
        if not all(expected):
            assert native['empty'] and record['base'] is None and record['data'] is None
            pair = [Image.new('RGBA', expected) for _ in range(2)]
        else:
            pair = [Image.open(source_dir / record[role]).convert('RGBA') for role in ('base', 'data')]
            assert all(image.size == expected for image in pair)
        key = (expected, tuple(native[k] for k in ('width', 'height')), native['empty'],
               *(hashlib.sha256(image.tobytes()).hexdigest() for image in pair))
        if key in seen:
            aliases[n] = seen[key]
        else:
            seen[key], images[n] = n, pair
    layouts, placements = [], {}
    for n in sorted(images, key=lambda n: (-images[n][0].height, -images[n][0].width, n)):
        width, height = images[n][0].size
        choices = [(s['height'] - height - 4, 2048 - s['x'] - width - 4, pi, ri)
                   for pi, rows in enumerate(layouts) for ri, s in enumerate(rows)
                   if height + 4 <= s['height'] and s['x'] + width + 4 <= 2048]
        if choices:
            _, _, pi, ri = min(choices)
            shelf = layouts[pi][ri]
        else:
            pi = next((i for i, rows in enumerate(layouts)
                       if sum(s['height'] for s in rows) + height + 4 <= 2048), len(layouts))
            if pi == len(layouts):
                layouts.append([])
            shelf = {'x': 0, 'y': sum(s['height'] for s in layouts[pi]), 'height': height + 4}
            layouts[pi].append(shelf)
        x, y = shelf['x'] + 2, shelf['y'] + 2
        native = raw['frames'][n]
        placements[n] = {'nativeFrame': n, 'page': f'p{pi}', 'sampleRect': [x, y, width, height],
                         'contentRect': [x, y, native['width'] * density, native['height'] * density]}
        shelf['x'] += width + 4
    flat_bytes = sum(max(s['x'] for s in rows) * sum(s['height'] for s in rows) * 6 for rows in layouts)
    if len(layouts) > 8 or (density == 4 and flat_bytes > 24 * 1024 * 1024):
        try:
            return pack_tiled(member, density, records, source_dir, output, raw)
        except OverflowError:
            # More distinct animated surfaces need smaller virtual groups,
            # while the physical 2048px and eight-page bounds stay unchanged.
            return pack_tiled(member, density, records, source_dir, output, raw, virtual_height=2400)
    pages = []
    for pi, shelves in enumerate(layouts):
        size = [max(s['x'] for s in shelves), sum(s['height'] for s in shelves)]
        page = {'id': f'p{pi}', 'size': size}
        for i, role in enumerate(('base', 'data')):
            atlas = Image.new('RGBA', size, (0, 0, 0, 255 if role == 'data' else 0))
            for n, placement in placements.items():
                if placement['page'] == page['id'] and all(images[n][i].size):
                    atlas.paste(images[n][i], tuple(placement['sampleRect'][:2]))
            name = f'{density}x-p{pi}-{role}.png'
            atlas.save(output / name)
            page.update({role: name, role + 'Sha256': sha(output / name), role + 'Bytes': (output / name).stat().st_size})
        pages.append(page)
    for n, canonical in aliases.items():
        placements[n] = {**placements[canonical], 'nativeFrame': n, 'sharedWith': canonical}
    return {'density': density, 'pages': pages, 'frames': [placements[n] for n in range(len(records))]}


for identity in args.identities:
    for theater in args.theaters:
        row = row_for(identity, theater)
        key = f'yuri-{identity.lower()}-{theater.lower()}'
        root = Path('.local/hd-packs') / ('yuri-coverage-' + identity.lower() + '-' + theater.lower()) / args.revision
        root.mkdir(parents=True, exist_ok=False)
        sources = {d: ROOT / args.exports / f'{identity}-{theater}-{d}x' for d in (2, 4)}
        reviews = {d: json.loads((sources[d] / 'candidate-review.json').read_text()) for d in sources}
        assert all((r['identity'], r['theater'], r['density']) == (identity, theater, d) for d, r in reviews.items())
        family = {'schemaVersion': 1, 'family': identity, 'edition': 'yr', 'theater': theater,
                  'approvalSha256': sha(ROOT / 'representative-acceptance-v1.json'),
                  'approvalScope': 'Batch direction approved; final native gameplay/visual acceptance pending',
                  'candidateHashes': {str(d): sha(sources[d] / 'candidate-review.json') for d in sources}, 'members': []}
        definitions = []
        for member in row['members']:
            name = member['source']['member']
            pack_id = f'yuri-coverage-{identity.lower()}-{theater.lower()}-{name[:-4].replace("_", "-")}'
            output = Path('.local/hd-packs') / pack_id / args.revision
            output.mkdir(parents=True, exist_ok=False)
            raw = raw_for(member['source']['sha256'])
            logical = [{'nativeFrame': n, 'trimOrigin': [f['x'], f['y']], 'trimSize': [f['width'], f['height']],
                        'legacyRenderSize': f['legacyRenderSize'], 'empty': f['empty']}
                       for n, f in enumerate(raw['frames'][:member['visibleFrames']])]
            variants = []
            for density in (2, 4):
                records = [r for r in reviews[density]['frames'] if r['member'] == name]
                assert len(records) == member['visibleFrames']
                variants.append(pack_variant(member, density, sources[density], records, output))
            manifest = {'schemaVersion': 2, 'packId': pack_id, 'packRevision': args.revision,
                        'source': {'kind': 'resolved-shp-member', 'member': name, 'theater': theater, 'sha256': member['source']['sha256']},
                        'candidateHashes': family['candidateHashes'], 'purpose': 'Complete Task C native Yuri state contract',
                        'logical': {'canvas': member['canvas'], 'frames': logical},
                        'color': {'representation': 'authored-sRGB-RGBA8-plus-RGBA8-data'}, 'variants': variants}
            write(output / 'manifest.json', manifest)
            family['members'].append({'member': name, 'packId': pack_id, 'revision': args.revision, 'sha256': sha(output / 'manifest.json')})
            art = row['imageName'] if 'body' in member['roles'] else row['art']['BibShape'] if 'bib' in member['roles'] else next(
                a['image'] for a in row['animations'] if a['member'] == name)
            definitions.append({**manifest['source'], 'artName': art, 'frames': member['visibleFrames'],
                                'canvas': member['canvas'], 'aggregateOffset': member['aggregateOffset']})
        if identity in ('YAGGUN', 'YAREFN'):
            family['turrets'] = {}
            for density in (2, 4):
                source = ROOT / args.turrets / identity / str(density)
                target = root / 'turrets' / str(density)
                shutil.copytree(source, target)
                family['turrets'][str(density)] = {'path': str(target).removeprefix('.local/') + '/', 'sha256': sha(target / 'manifest.json')}
        write(root / 'family.json', family)
        catalog[key] = {'family': identity, 'edition': 'yr', 'theater': theater, 'selection': key, 'members': definitions,
                        'familyPath': str(root / 'family.json').removeprefix('.local/'), 'familyHash': sha(root / 'family.json'),
                        'density': 4, 'densities': [2, 4]}
        print(key, len(definitions), 'independent 2x/4x variants; native runtime pending', flush=True)
write(args.catalog_output, catalog)
