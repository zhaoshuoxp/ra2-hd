"""Qualify complete accepted raster families against an independently exported theater."""
import argparse
import copy
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value):
    return json.dumps(value, indent=2) + '\n'


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--accepted', type=Path, required=True)
parser.add_argument('--palettes', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--member-map', type=Path, help='Explicit source counterpart names; all normal proofs remain required')
parser.add_argument('--families', help='Explicit donor family allowlist after separate acceptance verification')
args = parser.parse_args()
native = read(args.prepared / 'source.json')
accepted = read(args.accepted)
member_map = read(args.member_map) if args.member_map else {}
allowed_families = set(args.families.split(',')) if args.families else set(accepted['families'])
assert allowed_families and allowed_families.issubset(accepted['families'])
assert set(member_map).issubset(accepted['sources'])
assert len(set(member_map.values())) == len(member_map)
theater = native['theater']
assert theater in ('URBAN', 'NEWURBAN', 'DESERT')
inventory = read(Path(native['inventoryFile']))
assert sha(Path(native['inventoryFile'])) == native['inventorySha256']
donor_root = Path('.local/environment-packs') / accepted['selectedPack']['revision']
assert sha(donor_root / 'manifest.json') == accepted['selectedPack']['sha256']
donor = read(donor_root / 'manifest.json')
sources = defaultdict(list)
for source in native['sources']:
    sources[source['member']].append(source)
rows = [row for row in inventory['rows'] if row['theater'] == theater]
palettes = {}


def palette(identity, root):
    key = identity['sha256']
    if key not in palettes:
        path = root / (key + '.pal')
        assert sha(path) == key
        palettes[key] = np.frombuffer(path.read_bytes(), np.uint8).reshape(256, 3)
    return palettes[key]


def counterpart(name):
    if name in member_map:
        return member_map[name]
    source_extension = {'TEMPERATE': '.tem', 'SNOW': '.sno', 'URBAN': '.urb'}[accepted['theater']]
    if name.endswith(source_extension):
        return name[:-4] + {'URBAN': '.urb', 'NEWURBAN': '.ubn', 'DESERT': '.des'}[theater]
    source_prefix = {'TEMPERATE': 'ct', 'SNOW': 'ca', 'URBAN': 'cu'}[accepted['theater']]
    if name.startswith(source_prefix):
        return name[0] + {'URBAN': 'u', 'NEWURBAN': 'n', 'DESERT': 'd'}[theater] + name[2:]
    return name


qualified, rejected = [], []
for family, declaration in accepted['families'].items():
    if family not in allowed_families:
        continue
    family_rows = [row for row in rows if row['id'] in declaration['identities']
                   and row['kind'] in declaration['kinds']]
    if not family_rows:
        continue
    identity_record = dict(donorFamily=family, identities=sorted({row['id'] for row in family_rows}),
        editions=sorted({row['edition'] for row in family_rows}), kinds=declaration['kinds'],
        bindings=sorted({(row['edition'], row['id']) for row in family_rows}),
        maps=sorted({map_id for row in family_rows for map_id in row['usage']}))
    failures, members, mapping = [], [], {}
    if declaration.get('sourceScope'):
        rejected.append(dict(**identity_record, members=[],
            reasons=['Accepted family requires a separate official-map source adaptation']))
        continue
    for entry in donor['families'][family]['members']:
        old_name = entry['member']
        name = counterpart(old_name)
        old = accepted['sources'][old_name]
        matches = [source for source in sources[name] if source['sha256'] == old['sha256']]
        if len(matches) != 1:
            failures.append(f'{old_name}: exact counterpart {name} absent or ambiguous')
            continue
        source, = matches
        if any((binding.get('hasShadow'), binding.get('remapable')) !=
               (source.get('hasShadow'), source.get('remapable')) for binding in source['bindings']):
            failures.append(f'{name}: source is shared by different rendering contexts')
            continue
        if source['format'] != 'shp':
            failures.append(f'{name}: raster reuse requires an SHP source')
            continue
        if any(source.get(key) != old[key] for key in ('canvas', 'totalFrames', 'hasShadow', 'remapable')):
            failures.append(f'{name}: original frame or rendering semantics differ')
            continue
        assert sha(args.prepared / 'native' / source['nativeFile']) == source['sha256']
        assert len(source['frames']) == old['totalFrames']
        descriptor = copy.deepcopy(old)
        descriptor['palette'] = source['palette']
        used_by_palette = defaultdict(set)
        color_differences = []
        for frame in source['frames']:
            assert sha(args.prepared / 'native' / frame['indexFile']) == frame['indexSha256']
            assert sha(args.prepared / 'native' / frame['file']) == frame['rgbaSha256']
            if frame['slot'] >= old['bodyFrames']:
                continue
            old_palette = old.get('framePalettes', {}).get(str(frame['slot']), old)
            old_identity = old_palette if 'palette' not in old_palette else old_palette['palette']
            new_identity = source['palette']
            if str(frame['slot']) in old.get('framePalettes', {}):
                assert old_palette['role'] in ('body', 'rubble')
                if old_palette['role'] == 'rubble':
                    candidates = [row['palette'] for row in rows if row.get('palette', {}).get('member', '').startswith('iso')]
                    assert candidates and len({p['sha256'] for p in candidates}) == 1
                    new_identity = candidates[0]
                    runtime_used = str(source['nativeRules'].get('LeaveRubble', '')).lower() in ('yes', 'true', '1')
                    if old_palette['runtimeUsed'] != runtime_used:
                        failures.append(f'{name}: rubble runtime role differs')
                else:
                    assert old_palette['runtimeUsed'] and old_palette['remapable'] == source['remapable']
                descriptor['framePalettes'][str(frame['slot'])].update(new_identity)
            used = set((args.prepared / 'native' / frame['indexFile']).read_bytes()) - {0}
            remapable = old_palette['remapable']
            if remapable:
                used -= set(range(16, 32))
            old_rgb = palette(old_identity, args.palettes)
            new_rgb = palette(new_identity, args.prepared / 'native')
            different = [index for index in sorted(used) if not np.array_equal(old_rgb[index], new_rgb[index])]
            if different:
                color_differences.append(dict(slot=frame['slot'], indices=different))
            used_by_palette[old_identity['sha256'] + ':' + new_identity['sha256']].update(used)
        if color_differences:
            failures.append(f'{name}: used fixed palette colors differ')
        path = donor_root / entry['path']
        assert sha(path) == entry['sha256']
        hd = read(path)
        assert hd['source']['member'] == old_name and hd['source']['sha256'] == source['sha256']
        assert hd['source']['theater'] == accepted['theater']
        assert hd['logical']['canvas'] == source['canvas']
        assert len(hd['logical']['frames']) == old['bodyFrames']
        assert {variant['density'] for variant in hd['variants']} == {2, 4}
        mapping[old_name] = name
        members.append(dict(member=name, donorMember=old_name, donorEntry=entry,
            nativeKey=source['key'], sourceSha256=source['sha256'], descriptor=descriptor,
            usedFixedPaletteIndices={key: sorted(values) for key, values in used_by_palette.items()},
            colorDifferences=color_differences))
    targets = set(mapping.values())
    for row in family_rows:
        required = {item.get('source', {}).get('member') for item in [row, *row.get('dependencies', [])]}
        if None in required or not required.issubset(targets):
            failures.append(f'{row["edition"]}:{row["id"]}: original complete family closure differs')
        if row.get('source', {}).get('member') in targets:
            name = row['source']['member']
            mapped = next(member for member in members if member['member'] == name)
            if row['source']['sha256'] != mapped['sourceSha256']:
                failures.append(f'{row["edition"]}:{row["id"]}: edition source differs')
    record = dict(**identity_record, members=members)
    if failures:
        rejected.append(dict(**record, reasons=sorted(set(failures))))
    else:
        qualified.append(record)
report = dict(schema='m2-4-complete-accepted-theater-reuse-audit-v1', theater=theater,
    status='STATIC_SOURCE_PALETTE_AND_COMPLETE_FAMILY_AUDIT_ONLY',
    inventoryFile=native['inventoryFile'], inventorySha256=native['inventorySha256'],
    nativeGuideFile=str(args.prepared / 'source.json'), nativeGuideSha256=sha(args.prepared / 'source.json'),
    acceptedContract=str(args.accepted), acceptedContractSha256=sha(args.accepted),
    donorSelectedPack=accepted['selectedPack'], qualified=qualified, rejected=rejected,
    donorFamilyAllowlist=sorted(allowed_families),
    explicitCounterparts=dict(file=str(args.member_map), sha256=sha(args.member_map), members=member_map)
        if args.member_map else None,
    policy='A source hash alone is insufficient. Every linked original member, logical slot, fixed used color and rubble role must match. HD payload validation and native theater loading remain separate requirements.')
with args.output.open('x') as stream:
    stream.write(encode(report))
print(json.dumps(dict(qualifiedFamilies=len(qualified), qualifiedMembers=sum(len(x['members']) for x in qualified),
    rejectedFamilies=len(rejected), qualifiedKinds=dict(Counter(kind for item in qualified for kind in item['kinds'])))))
