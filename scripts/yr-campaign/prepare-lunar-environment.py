"""Assemble exact Lunar SHP guides and complete source-bound environment families."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--mission-sources', type=Path, required=True)
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
write = lambda path, value: path.write_text(json.dumps(value, indent=2) + '\n')
original = read(args.prepared / 'source.json')
mission = read(args.mission_sources / 'source.json')
assert original['theater'] == mission['theater'] == 'LUNAR'
assert mission['edition'] == 'yr' and mission['mission'] == 'sov06lmd.map'
assert sha(Path('.local/campaign/yr/sov06lmd/sov06lmd.map')) == mission['missionSha256']
qualified = {source['member']: source for source in mission['sources']}
root = args.output.resolve()
root.mkdir(exist_ok=False)
prepared = root / 'prepared'
native = prepared / 'native'
native.mkdir(parents=True)
sources, descriptors, families, identities = [], {}, {}, {}
for source in original['sources']:
    if source['format'] != 'shp' or source['member'] == 'sqd.shp':
        continue
    source = copy.deepcopy(source)
    binding, = source['bindings']
    assert binding['edition'] == 'yr' and binding['mapIds'] == ['sov06lmd.map']
    kind, identity, name = binding['kind'], binding['id'], source['member']
    assert kind in ['building', 'overlay', 'smudge']
    if name in qualified:
        member = copy.deepcopy(qualified[name])
        assert member['sha256'] == source['sha256']
        assert member['hasShadow'] == source['hasShadow'] and member['remapable'] == source['remapable']
        for palette in [member['palette'], *member['framePalettes'].values()]:
            file = args.mission_sources / 'native' / palette['member']
            assert sha(file) == palette['sha256']
            shutil.copyfile(file, native / file.name)
        for frame in member['frames']:
            stem = f"{name}-{frame['slot']}"
            index = args.mission_sources / 'native' / (stem + '.index')
            assert sha(index) == frame['indexSha256']
            shutil.copyfile(index, native / index.name)
            rgba = b'' if frame['empty'] else Image.open(args.mission_sources / 'native' / frame['png']).convert('RGBA').tobytes()
            file = native / (stem + '.rgba')
            file.write_bytes(rgba)
            frame.update(file=file.name, indexFile=index.name, rgbaSha256=sha(file))
    else:
        assert kind == 'smudge' and not source['hasShadow'] and not source['remapable']
        member = {**source, 'identity': identity, 'bodyFrames': source['totalFrames'], 'framePalettes': {}}
        for frame in member['frames']:
            for field, checksum in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
                file = args.prepared / 'native' / frame[field]
                assert sha(file) == frame[checksum]
                target = f"{name}-{frame['slot']}" + ('.rgba' if field == 'file' else '.index')
                shutil.copyfile(file, native / target)
                frame[field] = target
        palette = member['palette']
        candidates = list((args.mission_sources / 'native').rglob(palette['member']))
        assert candidates and all(sha(file) == palette['sha256'] for file in candidates)
        shutil.copyfile(candidates[0], native / palette['member'])
    member['bindings'] = [dict(identity=identity, kind=kind, role='body', nativeRules=binding['nativeRules'],
        nativeArt=binding['nativeArt'])]
    sources.append(member)
    descriptors[name] = {key: member[key] for key in ['sha256', 'canvas', 'totalFrames', 'bodyFrames',
        'palette', 'hasShadow', 'remapable', 'framePalettes']}
    family = 'yr-sov06-lunar-' + {'building': 'buildings', 'overlay': 'rocks', 'smudge': 'smudges'}[kind] + '-v1'
    group = families.setdefault(family, dict(members=[], identities=[], editions=['yr'], kinds=[kind],
        sourceScope=dict(campaignSources=[dict(edition='yr', mission=mission['mission'], sha256=mission['missionSha256'])])))
    group['members'].append(name)
    group['identities'].append(identity)
    identities[identity] = family
assert len(sources) == 36 and len(families) == 3
for family in families.values():
    family['members'].sort()
    family['identities'].sort()
    basis = dict(theater='LUNAR', members={name: descriptors[name] for name in family['members']}, identities=family['identities'])
    family['familyHash'] = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
write(prepared / 'source.json', {**mission, 'sources': sources,
    'preparedLunarSourceSha256': sha(args.prepared / 'source.json'),
    'sourceQualification': 'Exact native SHP, palette, frames and mission bindings; SQD remains the accepted Original exception.'})
write(root / 'contract.json', dict(schema='environment-shp-source-contract-v1', theater='LUNAR',
    sources=descriptors, families=families, identities=dict(ra2={}, yr=identities)))
write(root / 'preparation.json', dict(status='EXACT_LUNAR_ENVIRONMENT_GUIDES_ARTWORK_PENDING',
    sourceSha256=sha(prepared / 'source.json'), nativeLunarSourceSha256=sha(args.prepared / 'source.json'),
    missionSourceSha256=sha(args.mission_sources / 'source.json'), members=len(sources),
    userVisualAcceptance='PENDING'))
print(json.dumps(dict(output=str(root), members=len(sources), families=len(families))))
