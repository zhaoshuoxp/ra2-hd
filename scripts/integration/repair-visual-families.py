"""Revise only selected owner masks, factory delivery poses and fixed pier pixels."""
import copy
import hashlib
import importlib.util
import json
import os
import shutil
import sys
from types import SimpleNamespace
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, maximum_filter

sys.path.insert(0, str(Path('scripts/m1/owner-color').resolve()))
from paint import complete_data
sys.path.insert(0, str(Path('scripts/m1/yuri-buildings').resolve()))
from production_common import Family, material_coverage
spec = importlib.util.spec_from_file_location('allied_production', 'scripts/m1/allied-buildings/production_common.py')
allied = importlib.util.module_from_spec(spec)
spec.loader.exec_module(allied)

LOCAL = Path('.local')
OUT = Path('.artifacts/visual-feedback-20261005')
REVISION = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--revision=')), 'visual-feedback-r1')
FILTER = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--families=')), None)
RECEIPT = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--receipt=')), 'resource-revisions.json')
FACTORY_STATES = '--factory-states' in sys.argv
SOURCE_FAMILIES = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--source-families=')), None)
source_families = {r['selection']: r['predecessorFamily'] for r in json.loads(Path(SOURCE_FAMILIES).read_text())} if SOURCE_FAMILIES else {}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, v: p.write_text(json.dumps(v, indent=2) + '\n')
records = []


def source_row(faction, identity, theater):
    root = Path('.artifacts') / (faction + '-buildings') / ('source-v1' if faction == 'yuri' else 'source-v2')
    inventory = json.loads((root / 'inventory.json').read_text())
    row = next(r for r in inventory['matrix'] if r['id'] == identity and r['theater'] == theater)
    return root, row


def native_indices(root, member, n):
    raw = json.loads((root / 'members' / (member['source']['sha256'] + '.json')).read_text())
    f = raw['frames'][n]
    pixels = np.zeros(raw['canvas'][::-1], np.uint8)
    if f['width'] * f['height']:
        pixels[f['y']:f['y'] + f['height'], f['x']:f['x'] + f['width']] = np.array(f['pixels']).reshape(f['height'], f['width'])
    return pixels


for faction, identities in [('yuri', ['YAYARD', 'YAWEAP']), ('allied', ['GAWEAP', 'GAYARD'])]:
    catalog_file = Path('desktop') / (faction + '-building-coverage.json')
    catalog = json.loads(catalog_file.read_text())
    for key, entry in catalog.items():
        if entry['family'] not in identities or FILTER and entry['family'] not in FILTER:
            continue
        family_file = LOCAL / entry['familyPath']
        source_family_file = Path(source_families[key]) if key in source_families else family_file
        family = json.loads(source_family_file.read_text())
        root, row = source_row(faction, entry['family'], entry['theater'])
        members = {}
        for binding in family['members']:
            folder = LOCAL / 'hd-packs' / binding['packId'] / binding['revision']
            manifest = json.loads((folder / 'manifest.json').read_text())
            members[binding['member']] = (binding, folder, manifest)
        target_family = family_file.parent.parent / REVISION / 'family.json'
        assert not target_family.parent.exists(), 'Choose a new revision; retained families are immutable'
        assert all(not (folder.parent / REVISION).exists() for _, folder, _ in members.values()), \
            'Choose a new revision; retained member exports are immutable'

        def canvas_for(member, density, n):
            _, folder, manifest = members[member['source']['member']]
            variant = next(v for v in manifest['variants'] if v['density'] == density)
            frame = variant['frames'][n]
            page = next(p for p in variant['pages'] if p['id'] == frame['page'])
            assert 'map' not in page, 'Only direct factory/body canvases are sampled'
            x, y, w, h = frame['sampleRect']
            logical = manifest['logical']['frames'][n]
            pair = []
            for role in ['base', 'data']:
                image = Image.new('RGBA', tuple(v * density for v in member['canvas']), (0, 0, 0, 255 if role == 'data' else 0))
                atlas = Image.open(folder / page[role])
                image.paste(atlas.crop((x, y, x + w, y + h)), tuple(v * density for v in logical['trimOrigin']))
                pair.append(image)
            return pair

        def opened_for(density, n):
            # Sample the complete accepted master. A native member's trimmed
            # atlas cannot reconstruct pixels owned by another production layer.
            review = Path('.artifacts/yuri-buildings/full-exports-v43') / f'YAWEAP-{entry["theater"]}-{density}x/candidate-review.json'
            name = 'damaged-opened-body-raw.png' if n else 'opened-body-raw.png'
            registration = next(r for r in json.loads(review.read_text())['registrations'] if Path(r['source']).name == name)
            source = Path(registration['source']); assert sha(source) == registration['sourceHash']
            image = Image.new('RGBA', tuple(v*density for v in row['members'][0]['canvas']))
            raw = material_coverage(Image.open(source))
            image.alpha_composite(raw.convert('RGBa').resize(tuple(registration['physicalSize']), Image.Resampling.LANCZOS).convert('RGBA'),
                tuple(registration['physicalOffset']))
            data = np.zeros_like(np.array(image)); data[...,3] = 255
            data, _, _ = complete_data(np.array(image), data, density, 'YAWEAP', name)
            return [image, Image.fromarray(data)]

        changed_members = []
        for member in row['members']:
            name = member['source']['member']
            binding, folder, original = members[name]
            target = folder.parent / REVISION
            manifest = copy.deepcopy(original)
            changes = []
            for variant in manifest['variants']:
                density = variant['density']
                pages = {p['id']: [Image.open(folder / p[r]).convert('RGBA') for r in ['base', 'data']] for p in variant['pages']}
                modified = set()
                if entry['family'] == 'YAYARD':
                    for p in variant['pages']:
                        base, data = [np.array(x) for x in pages[p['id']]]
                        data, added, _ = complete_data(base, data, density, 'YAYARD', name)
                        if added:
                            pages[p['id']][1] = Image.fromarray(data)
                            modified.add(p['id']); changes.append({'density': density, 'page': p['id'], 'ownerPixelsAdded': added})
                replacements = {}
                if FACTORY_STATES and entry['family'] in ['GAWEAP', 'YAWEAP'] and (
                        name.endswith('_2.shp') or 'bib' in member['roles']):
                    for n in [0, 1]:
                        pair = canvas_for(member, density, n)
                        if entry['family'] == 'YAWEAP' and name.endswith('_2.shp'):
                            pair = canvas_for(row['members'][0], density, n)
                        # The flat under-door member owns the complete entrance
                        # during delivery. Neither the bib nor the raised rear
                        # layer may repaint that area with idle door material.
                        if entry['family'] == 'GAWEAP' and 'bib' in member['roles']:
                            # This crop overlaps the raised side wall. The open
                            # roof master paints a bright rectangular panel here;
                            # the body/rear member already owns the correct wall.
                            x, y, w, h = 164, 172, 30, 29
                        else:
                            door = next(m for m in row['members'] if m['source']['member'].endswith('_1.shp'))
                            native = json.loads((root / 'members' / (door['source']['sha256'] + '.json')).read_text())['frames'][n]
                            x, y, w, h = (native[k] for k in ['x', 'y', 'width', 'height'])
                        rgba = np.array(pair[0])
                        rgba[y*density:(y+h)*density, x*density:(x+w)*density] = 0
                        pair[0] = Image.fromarray(rgba); replacements[n] = pair
                elif not FACTORY_STATES and entry['family'] in ['GAWEAP', 'YAWEAP'] and ('bib' in member['roles'] or
                        name.endswith(('_1.shp', '_2.shp')) or entry['family'] == 'YAWEAP' and name.endswith(('_3.shp', '_4.shp'))):
                    for n in [0, 1]:
                        if entry['family'] == 'YAWEAP':
                            opened = opened_for(density, n)
                        else:
                            a = canvas_for(row['members'][6], density, n)
                            b = canvas_for(row['members'][7], density, n)
                            opened = [a[0].copy(), a[1].copy()]
                            opened[0].alpha_composite(b[0])
                            mask = np.array(b[0])[..., 3] > 0
                            data = np.array(opened[1]); data[mask] = np.array(b[1])[mask]; opened[1] = Image.fromarray(data)
                        if entry['family'] == 'GAWEAP' and name.endswith('_2.shp'):
                            foreground = canvas_for(member, density, n)
                            floor = Image.new('L', foreground[0].size)
                            ImageDraw.Draw(floor).polygon([(x*density,y*density) for x,y in
                                [(194,181),(213,169),(242,184),(243,206),(219,220),(195,200)]], fill=255)
                            flat = [canvas_for(m, density, n)[0] for m in [row['members'][1], row['members'][5]]]
                            covered = np.maximum(*[np.array(im)[...,3] for im in flat]) > 0
                            rgba = np.array(foreground[0]); rgba[...,3][(np.array(floor) > 0) & covered] = 0
                            rgba[...,:3][rgba[...,3] == 0] = 0; foreground[0] = Image.fromarray(rgba); opened = foreground
                        elif entry['family'] == 'YAWEAP' and name.endswith('_2.shp'):
                            closed = canvas_for(row['members'][0], density, n)
                            door = Image.new('L', opened[0].size)
                            ImageDraw.Draw(door).polygon([(x*density,y*density) for x,y in
                                [(177,145),(219,166),(241,213),(201,213)]], fill=255)
                            rgba = np.array(closed[0]); rgba[...,3][np.array(door) > 0] = 0
                            rgba[...,:3][rgba[...,3] == 0] = 0; closed[0] = Image.fromarray(rgba); opened = closed
                        elif entry['family'] == 'YAWEAP' and name.endswith(('_3.shp', '_4.shp')):
                            fore, rear = row['members'][5:7]
                            fields = []
                            for m in [fore, rear]:
                                field = distance_transform_edt(native_indices(root, m, n) <= 1)
                                raw = json.loads((root / 'members' / (m['source']['sha256'] + '.json')).read_text())['frames'][n]
                                yy, xx = np.indices(field.shape)
                                allowed = (xx >= raw['x']) & (xx < raw['x']+raw['width']) & (yy >= raw['y']) & (yy < raw['y']+raw['height'])
                                field[~allowed] = 1e6; fields.append(field)
                            ownership = np.argmin(np.stack(fields), axis=0)
                            wanted = 0 if name.endswith('_3.shp') else 1
                            mask = Image.fromarray(np.uint8(ownership == wanted) * 255).resize(opened[0].size, Image.Resampling.NEAREST)
                            rgba = np.array(opened[0]); rgba[..., 3][np.array(mask) == 0] = 0
                            rgba[..., :3][rgba[..., 3] == 0] = 0; opened[0] = Image.fromarray(rgba)
                        replacements[n] = opened
                if entry['family'] == 'GAYARD' and 'ACTIVE' in member['roles']:
                    allied.DENSITY = density
                    if density == 4:
                        os.environ['RA2_REGENERATED_MASTERS'] = '.artifacts/4x-regeneration/building-master-map-v1.json'
                    else:
                        os.environ.pop('RA2_REGENERATED_MASTERS', None)
                    art_root = Path('.artifacts/allied-buildings/production-art-v1/GAYARD')
                    review = json.loads(Path('.artifacts/allied-buildings/full-exports-v2/GAYARD/candidate-review.json').read_text())
                    assert sha(art_root / 'keys-raw.png') == review['authoredKeysSha256']
                    if entry['theater'] == 'SNOW':
                        keys = allied.sheet_cells(Image.open(art_root / 'snow-raw.png').convert('RGBA'), 2, 1)
                        masters = [allied.register(key, row['members'][0]['canvas'], allied.resting(row, bool(n)).getbbox())[0]
                                   for n, key in enumerate(keys)]
                    else:
                        candidate = Path('.artifacts/allied-buildings/review-v1/GAYARD-candidate-2x.png')
                        approval = json.loads(Path('.artifacts/allied-buildings/review-v1/review.json').read_text())['records']
                        pin = next(r for r in approval if r['candidate'] == candidate.name)
                        assert sha(candidate) == pin['candidateSha256']
                        keys = allied.sheet_cells(Image.open(art_root / 'keys-raw.png').convert('RGBA'))
                        masters = [allied.normal_for(candidate),
                                   allied.register(keys[0], row['members'][0]['canvas'], allied.resting(row, True).getbbox())[0]]
                    for n in range(min(30, member['visibleFrames'])):
                        image = masters[int(n >= 15)].copy()
                        pair = [image, allied.owner_data(row, member, image)[0]]
                        pixels = np.array(pair[0]); yy, xx = np.indices(pixels.shape[:2])
                        mask = (xx >= 135*density) & (xx < 295*density) & (yy >= 185*density) & (yy < 256*density)
                        native = maximum_filter(np.uint8(native_indices(root, member, n) > 1), size=5)
                        native = np.array(Image.fromarray(native*255).resize(pair[0].size, Image.Resampling.NEAREST)) > 0
                        pixels[..., 3][~(mask & native)] = 0; pixels[..., :3][pixels[..., 3] == 0] = 0
                        pair[0] = Image.fromarray(pixels); replacements[n] = pair
                touched = {}
                for n, pair in replacements.items():
                    if not FACTORY_STATES and entry['family'] == 'YAWEAP' and entry['theater'] == 'SNOW':
                        snow_family = SimpleNamespace(identity='YAWEAP', theater='SNOW', row=row, body=row['members'][0],
                            density=density, size=pair[0].size)
                        previous = np.array(pair[0])
                        pair[0] = Family.snow(snow_family, member, n, pair[0])
                        rgba = np.array(pair[0]); data = np.array(pair[1])
                        snow = (rgba[...,:3].min(axis=2) > 180) & (np.max(abs(rgba[...,:3].astype(int)-previous[...,:3]),axis=2) > 30)
                        data[...,:2][snow] = 0; pair[1] = Image.fromarray(data)
                    frame = variant['frames'][n]; logical = manifest['logical']['frames'][n]
                    if logical['empty']:
                        continue
                    x, y, w, h = frame['sampleRect']; tx, ty = [v*density for v in logical['trimOrigin']]
                    cw, ch = [v*density for v in logical['trimSize']]
                    assert 'map' not in next(p for p in variant['pages'] if p['id'] == frame['page'])
                    for i, role in enumerate(['base', 'data']):
                        image = Image.new('RGBA', (w, h), (0, 0, 0, 255 if i else 0))
                        image.paste(pair[i].crop((tx, ty, tx+cw, ty+ch)))
                        if i:
                            data = np.array(image); coverage = np.array(pair[0].crop((tx, ty, tx+cw, ty+ch)))[...,3]
                            data[:ch,:cw,:2][coverage == 0] = 0; image = Image.fromarray(data)
                        slot = (frame['page'], x, y, role)
                        if slot in touched:
                            assert touched[slot] == image.tobytes(), ('Conflicting native alias', entry['family'], name, n)
                        touched[slot] = image.tobytes()
                        pages[frame['page']][i].paste(image, (x, y))
                    modified.add(frame['page']); changes.append({'density': density, 'nativeFrame': n, 'operation': 'Fixed architectural material registration / opened production bay'})
                if modified:
                    if not target.exists():
                        shutil.copytree(folder, target)
                    for p in variant['pages']:
                        if p['id'] not in modified:
                            continue
                        for i, role in enumerate(['base', 'data']):
                            pages[p['id']][i].save(target / p[role])
                            p[role+'Sha256'] = sha(target / p[role]); p[role+'Bytes'] = (target / p[role]).stat().st_size
            if changes:
                manifest['packRevision'] = REVISION
                manifest['visualFeedback'] = {'predecessorManifestSha256': sha(folder / 'manifest.json'), 'changes': changes}
                write(target / 'manifest.json', manifest)
                binding.update(revision=REVISION, sha256=sha(target / 'manifest.json'))
                changed_members.append(name)
        assert changed_members
        target_family.parent.mkdir(exist_ok=False)
        family['visualFeedback'] = {'predecessorSha256': sha(family_file), 'changedMembers': changed_members}
        if source_family_file != family_file:
            family['visualFeedback']['sourceFamilySha256'] = sha(source_family_file)
        write(target_family, family)
        entry.update(familyPath=str(target_family.relative_to(LOCAL)), familyHash=sha(target_family))
        records.append({'selection': key, 'predecessorFamily': str(family_file), 'selectedFamily': entry['familyPath'],
                        'selectedSha256': entry['familyHash'], 'changedMembers': changed_members})
    write(catalog_file, catalog)
write(OUT / RECEIPT, records)
print(json.dumps(records, indent=2))
