"""Unpack pinned bridge atlas subjects and prepare the existing native SHP exporter."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

import numpy as np
from PIL import Image
from scipy import ndimage
from campaign_bridge_art import bridge_aggregate_admission

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('recipe', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'scripts/m2'))
from showcase_authored_rubble import cardinal_points
from showcase_registration import authored_coverage
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, value: p.write_text(json.dumps(value, indent=2) + '\n')
recipe = read(args.recipe)
source_file = (root / recipe['source']).resolve()
assert sha(source_file) == recipe['sourceJsonSha256']
original = read(source_file)
admission = bridge_aggregate_admission(original, root)
assert admission == recipe['bridgeAggregate']
approval = next(row for row in read(root / 'docs/campaign-art/user-direction-approvals-20261028.json')['records']
    if row['questionItemId'] == recipe['questionItemId'] and row['sha256'] == recipe['approvedSampleSha256'])
assert sha((root / approval['sample']).resolve()) == approval['sha256']
assert sorted(recipe['subjects']) == sorted(source['member'] for source in original['sources'])
stage = args.output.resolve()
stage.mkdir(exist_ok=False)
prepared, authoring = stage / 'prepared', stage / 'authoring'
native = prepared / 'native'
native.mkdir(parents=True)
authoring.mkdir()
masters, board_cache, descriptors, slots, members, planar = [], {}, {}, {}, [], {}


def subject(declaration):
    file = (root / declaration['board']).resolve()
    assert sha(file) == declaration['sha256']
    key = str(file)
    if key not in board_cache:
        pixels = np.array(Image.open(file).convert('RGBA'))
        assert pixels[..., 3].min() == 0
        labels, _ = ndimage.label(pixels[..., 3] > 180)
        sizes = np.bincount(labels.ravel()); sizes[0] = 0
        count = declaration['subjects']
        assert count in [1, 2, 3]
        selected = sorted(np.argsort(sizes)[-count:], key=lambda label: np.nonzero(labels == label)[0].mean())
        assert all(sizes[label] > 10000 for label in selected)
        distances = np.stack([ndimage.distance_transform_edt(labels != label) for label in selected])
        assignments = distances.argmin(0)
        board_cache[key] = pixels, assignments, distances.min(0), selected, labels
    pixels, assignments, distance, selected, labels = board_cache[key]
    assert len(selected) == declaration['subjects']
    ordinal = declaration['ordinal']
    assert 0 <= ordinal < len(selected)
    ys, xs = np.nonzero(labels == selected[ordinal])
    assert xs.min() > 0 and ys.min() > 0 and xs.max() < pixels.shape[1] - 1 and ys.max() < pixels.shape[0] - 1, 'Clipped atlas subject'
    # Atlas unpacking retains raw subject RGB/alpha. Only neighboring subjects
    # and detached matte flecks are excluded; native output coverage is separate.
    active = (pixels[..., 3] > 0) & (assignments == ordinal) & (distance <= 12)
    ys, xs = np.nonzero(active)
    rect = [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]
    left, top, right, bottom = rect
    plate = pixels[top:bottom, left:right].copy()
    plate[..., 3][~active[top:bottom, left:right]] = 0
    return Image.fromarray(plate), dict(board=str(file), boardSha256=sha(file), ordinal=ordinal,
        rectangle=rect, rawCoveredRgbPreserved=True, alphaPolicy='Unpacked atlas subject; independent native structural coverage controls exported silhouettes.')


for source in original['sources']:
    name = source['member']
    assert sha(source_file.parent / 'native' / name) == source['sha256']
    palette = source_file.parent / 'native' / source['palette']['member']
    assert sha(palette) == source['palette']['sha256']
    if not (native / palette.name).exists():
        shutil.copyfile(palette, native / palette.name)
    for frame in source['frames']:
        stem = f"{name}-{frame['slot']}"
        index = source_file.parent / 'native' / (stem + '.index')
        assert sha(index) == frame['indexSha256']
        shutil.copyfile(index, native / index.name)
        rgba = b'' if frame['empty'] else Image.open(source_file.parent / 'native' / frame['png']).convert('RGBA').tobytes()
        target = native / (stem + '.rgba'); target.write_bytes(rgba)
        frame.update(file=target.name, rgbaSha256=sha(target), indexFile=index.name)
    source['bindings'] = [dict(identity=source['identity'], kind='overlay', role='body',
        nativeRules=source['nativeRules'], nativeArt=source['nativeArt'])]
    descriptors[name] = {key: source[key] for key in ['sha256', 'canvas', 'totalFrames', 'bodyFrames', 'palette', 'hasShadow', 'remapable', 'framePalettes']}
    frame = source['frames'][1]
    index = np.frombuffer((native / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
    bounds = Image.fromarray(((index != 0) & (index != 12)).astype(np.uint8) * 255).getbbox()
    plate, evidence = subject(recipe['subjects'][name])
    assert plate.width >= (bounds[2] - bounds[0]) * 4 and plate.height >= (bounds[3] - bounds[1]) * 4
    master = authoring / (name.replace('.', '-') + '-unpacked.png'); plate.save(master)
    planar[name] = dict(schema='source-pinned-bridge-planar-material-v1', sourceSha256=source['sha256'],
        paletteSha256=source['palette']['sha256'], nativeFrame=1, indexSha256=frame['indexSha256'],
        master=str(master), masterSha256=sha(master),
        masterRgbaSha256=hashlib.sha256(plate.tobytes()).hexdigest(),
        nativePoints=cardinal_points(index != 0).tolist(),
        masterPoints=cardinal_points(authored_coverage(np.array(plate), 180, fringe_guard=True)).tolist(),
        policy='Full-resolution authored material projection only; original pivots, alpha coverage, collision, source empty slots and state selection remain unchanged.')
    if 'continuousDeck' in recipe:
        number = int(name[6:8])
        planar[name]['continuousDeck'] = dict(recipe['continuousDeck'],
            axis='x' if number <= 9 or 19 <= number <= 22 else 'y')
    key = name + '-001'
    slots[key] = dict(member=name, nativeSlot=1, nativeBounds=list(bounds), kind='overlay', group='bridge',
        nativeMetadata=frame, sourceSha256=source['sha256'], board=str(master), boardSize=list(plate.size),
        slotRect=[0, 0, *plate.size], occupied=1, rejectFluorescentFringe=True)
    members.append(dict(member=name, sourceSha256=source['sha256'], palette=source['palette'], bodyCount=3,
        totalNativeSlots=6, slots=[dict(slot=0, status='EXACT_NATIVE_EMPTY'),
        dict(slot=1, status='AWAITING_AUTHORED_SLOT', key=key), dict(slot=2, status='EXACT_NATIVE_EMPTY')],
        shadowPolicy='Original separate source slots retained; runtime low bridge disables separate sprite shadows and has no active receiving-surface helper.'))
    masters.append(dict(member=name, file=str(master), sha256=sha(master), **evidence))
write(prepared / 'source.json', original)
identities = [source['identity'] for source in original['sources']]
basis = dict(theater='URBAN', members=descriptors, identities=identities)
family_hash = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
write(stage / 'contract.json', dict(schema='environment-shp-source-contract-v1', theater='URBAN', sources=descriptors,
    families={recipe['family']: dict(members=sorted(descriptors), identities=identities, editions=['ra2'], kinds=['overlay'],
        familyHash=family_hash, sourceScope=dict(campaignSources=[dict(mission=original['mission'], sha256=original['missionSha256'])]))},
    identities=dict(ra2={name: recipe['family'] for name in identities}, yr={})))
write(authoring / 'worklist.json', dict(schema='m2-2-shp-native-slot-worklist-v1',
    preparedSourceSha256=sha(prepared / 'source.json'), slots=slots, members=members, batches=[]))
write(stage / 'material-profile.json', dict(sourcePinnedBridgePlanarMaterial=planar,
    sourcePinnedStructuralCoverage={source['member']: dict(
    schema='source-pinned-structural-contours-v1', theater='URBAN', kind='overlay', sourceSha256=source['sha256'],
    paletteSha256=source['palette']['sha256'], bodyIndexSha256=[frame['indexSha256'] for frame in source['frames'][:3]])
    for source in original['sources']}))
write(stage / 'preparation.json', dict(status='PREPARED_NATIVE_REGISTRATION_AND_RUNTIME_PENDING',
    recipe=str(args.recipe.resolve()), recipeSha256=sha(args.recipe), originalSourceJsonSha256=recipe['sourceJsonSha256'],
    sourceSha256=[source['sha256'] for source in original['sources']], masters=masters,
    directionApproval=recipe['questionItemId'], bridgeAggregate=admission,
    qualification='Complete26 visible native frame1 variants. Atlas unpacking never redraws/recolors/upscales source subjects. Existing native geometry/coverage, separate empty/source shadow slots and fixed budgets remain unchanged.'))
print(json.dumps(dict(family=recipe['family'], members=len(members), slots=len(slots), output=str(stage))))
