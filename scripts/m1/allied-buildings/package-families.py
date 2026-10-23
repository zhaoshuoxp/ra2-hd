"""Immutable Allied additions using the established coverage atlas contract.

The shelf/alias packer follows building-coverage/package-coverage.py. Existing
accepted catalogs and pack paths are never rewritten by this exporter.
"""
import hashlib
import json
import shutil
import argparse
from pathlib import Path
from PIL import Image
from production_common import ROOT, row_for, raw_for, sha

PACKS = Path('.local/hd-packs')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--catalog-output', type=Path, help='Write candidate selections without promoting the desktop catalog')
parser.add_argument('--revision', default='1')
parser.add_argument('--identities', nargs='+', required=True)
parser.add_argument('--theaters', nargs='+', default=['TEMPERATE', 'SNOW'])
parser.add_argument('--receipt', required=True, help='New immutable receipt path under the Allied artifact root')
parser.add_argument('--exports', default='full-exports-v1')
parser.add_argument('--turrets', default='turret-exports-v1')
parser.add_argument('--replace-selection', action='store_true', help='Select a new immutable revision, preserving the old pack')
args = parser.parse_args()
REVISION = args.revision
receipt_path = ROOT / args.receipt
assert not receipt_path.exists(), 'Do not overwrite an existing receipt'
catalog_path = Path('desktop/allied-building-coverage.json')
catalog = json.loads(catalog_path.read_text()) if catalog_path.exists() else {}


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')


def pack_member(identity, theater, member, records, exports, candidate):
    name = member['source']['member']
    pack_id = f'allied-coverage-{identity.lower()}-{theater.lower()}-{name[:-4].replace("_", "-")}'
    out = PACKS / pack_id / REVISION
    out.mkdir(parents=True, exist_ok=False)
    raw = raw_for(member['source']['sha256'])
    logical = [{'nativeFrame': n, 'trimOrigin': [f['x'], f['y']], 'trimSize': [f['width'], f['height']],
                'legacyRenderSize': [f['width'] + f['width'] % 2, f['height'] + f['height'] % 2], 'empty': f['empty']}
               for n, f in enumerate(raw['frames'][:len(records)])]
    density = records[0]['exports'][0]['density']
    seen, aliases, images = {}, {}, {}
    for n, record in enumerate(records):
        binding = record['exports'][0]
        pair = [Image.open(exports / binding[role]).convert('RGBA') for role in ['base', 'data']]
        expected = tuple(max(1, v * density) for v in logical[n]['legacyRenderSize'])
        assert all(im.size == expected for im in pair), (name, n, expected)
        key = (tuple(logical[n]['trimSize']), logical[n]['empty'],
               *(hashlib.sha256(im.tobytes()).hexdigest() for im in pair))
        if key in seen:
            aliases[n] = seen[key]
        else:
            seen[key], images[n] = n, pair
    layouts, placements = [], {}
    for n in sorted(images, key=lambda n: (-images[n][0].height, -images[n][0].width, n)):
        w, h = [v * density for v in logical[n]['legacyRenderSize']]
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
                         'contentRect': [x, y, *(v * density for v in logical[n]['trimSize'])]}
        shelf['x'] += w + 4
    assert len(layouts) <= 8, (identity, name, 'page limit', len(layouts))
    pages = []
    for pi, shelves in enumerate(layouts):
        size = [max(r['x'] for r in shelves), sum(r['height'] for r in shelves)]
        page = {'id': f'p{pi}', 'size': size}
        for role_index, role in enumerate(['base', 'data']):
            atlas = Image.new('RGBA', tuple(size), (0, 0, 0, 255 if role == 'data' else 0))
            for n, p in placements.items():
                if p['page'] == page['id']:
                    atlas.paste(images[n][role_index], tuple(p['sampleRect'][:2]))
            filename = f'{density}x-p{pi}-{role}.png'
            atlas.save(out / filename)
            page.update({role: filename, role + 'Sha256': sha(out / filename), role + 'Bytes': (out / filename).stat().st_size})
        pages.append(page)
    for n, canonical in aliases.items():
        placements[n] = {**placements[canonical], 'nativeFrame': n, 'sharedWith': canonical}
    source = {'kind': 'resolved-shp-member', 'member': name, 'theater': theater, 'sha256': member['source']['sha256']}
    manifest = {'schemaVersion': 2, 'packId': pack_id, 'packRevision': REVISION, 'source': source,
                'candidateSha256': candidate, 'purpose': 'Complete Allied building edition/theater review candidate',
                'logical': {'canvas': raw['canvas'], 'frames': logical},
                'color': {'representation': 'authored-sRGB-RGBA8-plus-RGBA8-data'},
                'variants': [{'density': density, 'pages': pages, 'frames': [placements[n] for n in range(len(logical))]}]}
    write_json(out / 'manifest.json', manifest)
    return {'member': name, 'packId': pack_id, 'revision': REVISION, 'sha256': sha(out / 'manifest.json')}, manifest


for identity in args.identities:
    for theater in args.theaters:
        row = row_for(identity, theater)
        key = identity.lower() + '-' + theater.lower()
        assert key not in catalog or args.replace_selection, 'Use an explicit new review revision'
        if key in catalog:
            assert not catalog[key]['familyPath'].endswith('/' + REVISION + '/family.json'), 'Revision already selected'
        exports = ROOT / args.exports / (identity if theater == 'TEMPERATE' else identity + '-' + theater)
        review = json.loads((exports / 'candidate-review.json').read_text())
        candidate = sha(exports / 'candidate-review.json')
        out = PACKS / ('allied-coverage-' + key) / REVISION
        out.mkdir(parents=True, exist_ok=False)
        family = {'schemaVersion': 1, 'family': identity, 'theater': theater, 'candidateSha256': candidate,
            'approvalSha256': sha(ROOT / 'representative-acceptance-v1.json'),
            'approvalScope': 'Representative direction accepted; final gameplay review pending', 'members': []}
        definitions = []
        for member in row['members']:
            records = [r for r in review['frames'] if r['member'] == member['source']['member']]
            assert len(records) == member['visibleFrames']
            assert [r['nativeFrame'] for r in records] == list(range(len(records)))
            binding, manifest = pack_member(identity, theater, member, records, exports, candidate)
            family['members'].append(binding)
            if 'body' in member['roles']:
                art = row['imageName']
            elif 'bib' in member['roles']:
                art = row['art']['BibShape']
            else:
                art = next(a['image'] for a in row['animations'] if a['member'] == member['source']['member'])
            definitions.append({**manifest['source'], 'artName': art, 'frames': len(records),
                'canvas': manifest['logical']['canvas'], 'aggregateOffset': member['aggregateOffset']})
        if identity in ('GTGCAN', 'NASAM'):
            turret = ROOT / args.turrets / identity
            if theater == 'TEMPERATE':
                shutil.copytree(turret, out / 'turret')
                family['turret'] = {'sha256': sha(out / 'turret/manifest.json'),
                    'path': str(out / 'turret').removeprefix('.local/') + '/'}
            else:
                family['sharedTurretSelection'] = identity.lower() + '-temperate'
        write_json(out / 'family.json', family)
        catalog[key] = {'family': identity, 'theater': theater, 'selection': key, 'members': definitions,
            'familyPath': str(out / 'family.json').removeprefix('.local/'), 'familyHash': sha(out / 'family.json'), 'density': review['density']}
        print(key, len(definitions))
write_json(args.catalog_output or catalog_path, catalog)
write_json(receipt_path, catalog)
