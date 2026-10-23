"""Create immutable complete-family additions with pinned native contracts."""
import hashlib
import os
import json
import sys
from pathlib import Path
from PIL import Image
from production_common import ROOT, ACCEPTED, row_for, raw_for, sha
from accepted_frames import family as accepted_family, member_info, frame

PACKS = Path('.local/hd-packs')
REVISION = sys.argv[1] if len(sys.argv) > 1 else '1'
approval = sha(ROOT / 'representative-acceptance-v1.json')
catalog_path = Path('desktop/soviet-building-coverage.json')
catalog = json.loads(catalog_path.read_text()) if catalog_path.exists() else {}


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')


def pack_member(identity, theater, member, records, exports, candidate):
    name = member['source']['member']
    pack_id = f'soviet-coverage-{identity.lower()}-{theater.lower()}-{name[:-4].replace("_", "-")}'
    out = PACKS / pack_id / REVISION
    out.mkdir(parents=True, exist_ok=False)
    raw = raw_for(member)
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
                'candidateSha256': candidate, 'purpose': 'Complete Soviet building edition/theater review candidate',
                'logical': {'canvas': raw['canvas'], 'frames': logical},
                'color': {'representation': 'authored-sRGB-RGBA8-plus-RGBA8-data'},
                'variants': [{'density': density, 'pages': pages, 'frames': [placements[n] for n in range(len(logical))]}]}
    write_json(out / 'manifest.json', manifest)
    return {'member': name, 'packId': pack_id, 'revision': REVISION, 'sha256': sha(out / 'manifest.json')}, manifest


jobs = [('NAINDP', 'TEMPERATE'), ('NABNKR', 'TEMPERATE'), ('NAPOWR', 'NEWURBAN')]
jobs += [(id, 'SNOW') for id in sorted({r['id'] for r in __import__('production_common').INVENTORY['matrix']})]
for identity, theater in jobs:
    row = row_for(identity, theater)
    key = f'{identity.lower()}-{theater.lower()}'
    if len(sys.argv) > 2 and key not in sys.argv[2:]:
        continue
    out = PACKS / ('soviet-coverage-' + key) / REVISION
    out.mkdir(parents=True, exist_ok=False)
    if theater == 'TEMPERATE':
        exports = ROOT / 'full-exports-v3' / identity
    else:
        exports = ROOT / ('snow-exports-v2' if identity == 'NATECH' else 'snow-exports-v1') / identity
    if os.environ.get('RA2_COVERAGE_EXPORTS'):
        exports = Path(os.environ['RA2_COVERAGE_EXPORTS']) / theater / identity
    if theater == 'NEWURBAN':
        exports = ROOT / ('power-variant-exports-v' + REVISION)
        exports.mkdir(exist_ok=False)
        member = row['members'][2]
        records = []
        for n, f in enumerate(raw_for(member)['frames'][:26]):
            bindings = {'density': 4}
            for role in ['base', 'data']:
                canvas, density = frame(identity, 2, n, role)
                x, y, w, h = (f[k] for k in ['x', 'y', 'width', 'height'])
                image = Image.new('RGBA', ((w + w % 2) * density, (h + h % 2) * density), (0, 0, 0, 255 if role == 'data' else 0))
                image.paste(canvas.crop((x * density, y * density, (x + w) * density, (y + h) * density)))
                if role == 'data':
                    image.putalpha(255)
                bindings[role] = f'{n:02}-{role}.png'
                image.save(exports / bindings[role])
            records.append({'member': member['source']['member'], 'nativeFrame': n, 'exports': [bindings]})
        write_json(exports / 'candidate-review.json', {'frames': records, 'approvalSha256': approval})
    reuse_all = identity in ['NAYARD', 'TESLA'] and theater == 'SNOW'
    report = {'frames': []} if reuse_all else json.loads((exports / 'candidate-review.json').read_text())
    candidate = approval if reuse_all else sha(exports / 'candidate-review.json')
    family = {'schemaVersion': 1, 'family': identity, 'theater': theater, 'candidateSha256': candidate,
              'approvalSha256': approval, 'approvalScope': 'Representatives accepted; final gameplay acceptance pending', 'members': []}
    definitions = []
    for index, member in enumerate(row['members']):
        reuse = identity in ACCEPTED['families'] and (reuse_all or (theater == 'NEWURBAN' and index < 2))
        if reuse:
            binding = accepted_family(identity)['members'][index]
            _, manifest, _ = member_info(identity, index)
            assert manifest['source']['sha256'] == member['source']['sha256']
        else:
            records = [r for r in report['frames'] if r['member'] == member['source']['member']]
            binding, manifest = pack_member(identity, theater, member, records, exports, candidate)
        family['members'].append(binding)
        art_name = row['imageName'] if 'body' in member['roles'] else (row['art']['BibShape'].upper() if 'bib' in member['roles']
                    else next(a['image'] for a in row['animations'] if a['member'] == member['source']['member']))
        definitions.append({**manifest['source'], 'artName': art_name, 'frames': len(manifest['logical']['frames']),
                            'canvas': manifest['logical']['canvas'], 'aggregateOffset': member['aggregateOffset']})
    if identity in ['NALASR', 'NAFLAK']:
        family['sharedTurretSelection'] = identity.lower()
    write_json(out / 'family.json', family)
    catalog[key] = {'family': identity, 'theater': theater, 'selection': key, 'members': definitions,
                    'familyPath': str(out / 'family.json').removeprefix('.local/'), 'familyHash': sha(out / 'family.json'),
                    'density': 4 if identity == 'NAPOWR' or os.environ.get('RA2_EXPORT_DENSITY') == '4' else 2}
    print(key, len(definitions), flush=True)
write_json(catalog_path, catalog)
write_json(Path(os.environ.get('RA2_REPORT_DIR', str(ROOT))) / ('coverage-packs-v' + REVISION + '.json'), catalog)
