"""Export registered authored flat ground while retaining the accepted V10 base."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--root', type=Path, default=Path('.artifacts/m2-1/authoring-v11'))
parser.add_argument('--registered-extent', action='store_true')
args = parser.parse_args()
root = args.root
destination = Path('.local/terrain-packs') / args.revision
destination.mkdir(parents=True, exist_ok=False)
export = root / args.revision
export.mkdir(exist_ok=False)
members = json.loads((root / 'source.json').read_text())['members']
layout = json.loads((root / 'layout.json').read_text())
base_root = Path('.local/terrain-packs/temperate-m2-1-cliff-v10')
base = json.loads((base_root / 'manifest.json').read_text())
assert len(members) == 48 and len(layout) == 48
assert {m['setIndex'] for m in members} == {0, 41, 42}
plates, originals, provenance = {}, {}, []


def extrude(rgb, valid):
    """Fill only transparent technical RGB to prevent sampling fringes."""
    while not valid.all():
        previous = valid.copy()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            neighbor = np.roll(previous, (dy, dx), axis=(0, 1))
            if dy < 0: neighbor[dy:] = False
            if dy > 0: neighbor[:dy] = False
            if dx < 0: neighbor[:, dx:] = False
            if dx > 0: neighbor[:, :dx] = False
            fill = ~valid & neighbor
            rgb[fill] = np.roll(rgb, (dy, dx), axis=(0, 1))[fill]
            valid |= fill
    return rgb


def registered_rect(master, info):
    """Locate the actual connected sprite, excluding external matte debris."""
    x, y, w, h = info['slotRect']
    pixels = np.asarray(master.crop((x, y, x + w, y + h)))
    rgb = pixels[:, :, :3]
    red = (rgb[:, :, 0] > 230) & (rgb[:, :, 1] < 30)
    yellow = (rgb[:, :, 0] > 240) & (rgb[:, :, 1] > 240) & (rgb[:, :, 2] < 16)
    candidate = (pixels[:, :, 3] > 180) & ~red & ~yellow
    ys, xs = np.where(candidate)
    seed = np.argmin((ys - h / 2) ** 2 + (xs - w / 2) ** 2)
    pending = [(int(ys[seed]), int(xs[seed]))]
    visited = np.zeros(candidate.shape, dtype=bool)
    while pending:
        cy, cx = pending.pop()
        if cy < 0 or cx < 0 or cy >= h or cx >= w or visited[cy, cx] or not candidate[cy, cx]:
            continue
        visited[cy, cx] = True
        pending.extend([(cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)])
    ys, xs = np.where(visited)
    assert len(xs) > 10000
    return [x + int(xs.min()), y + int(ys.min()), int(xs.max() - xs.min() + 1),
            int(ys.max() - ys.min() + 1)]


for member in members:
    name = member['member']
    info = layout[name]
    file = root / info['board']
    master = Image.open(file).convert('RGBA')
    assert master.size == (1254, 1254)
    source_rect = registered_rect(master, info) if args.registered_extent else info['sourceRect']
    x, y, w, h = source_rect
    crop = np.asarray(master.crop((x, y, x + w, y + h)))
    original = np.asarray(Image.open(root / f'{name}-native.png').convert('RGBA'))
    source_mask = np.asarray(Image.fromarray(original[:, :, 3]).resize((w, h), Image.Resampling.NEAREST)) > 0
    covered = (crop[:, :, 3] > 180) & source_mask
    assert covered.any()
    ys, xs = np.where(covered)
    capacity = min((xs.max() - xs.min() + 1) / 60, (ys.max() - ys.min() + 1) / 30)
    assert capacity >= 4, (name, capacity)
    plates[name] = extrude(crop[:, :, :3].copy(), covered.copy())
    originals[name] = original
    provenance.append(dict(member=name, file=str(file), sourceRect=source_rect,
                           sha256=hashlib.sha256(file.read_bytes()).hexdigest(), densityCapacity=float(capacity)))

# One color anchor for each coordinated material family; no per-tile grading.
anchors = {}
for set_index in [0, 41, 42]:
    selected = [m['member'] for m in members if m['setIndex'] == set_index]
    native_colors, authored_colors = [], []
    for name in selected:
        mask = originals[name][:, :, 3] > 0
        projected = np.asarray(Image.fromarray(plates[name]).resize((60, 30), Image.Resampling.LANCZOS))
        native_colors.append(originals[name][mask, :3])
        authored_colors.append(projected[mask])
    delta = np.concatenate(native_colors).mean(0) - np.concatenate(authored_colors).mean(0)
    anchors[str(set_index)] = delta.tolist()
    for name in selected:
        plates[name] = np.clip(plates[name].astype(float) + delta, 0, 255).astype(np.uint8)


def project(name, density):
    original = originals[name]
    size = (60 * density, 30 * density)
    expected = np.asarray(Image.fromarray(original).resize(size, Image.Resampling.NEAREST))
    rgb = np.asarray(Image.fromarray(plates[name]).resize(size, Image.Resampling.LANCZOS)).copy()
    inside = original[:, :, 3] > 0
    weight = np.zeros(inside.shape, dtype=np.float32)
    for value in [1, .5]:
        pad = np.pad(inside, 1)
        eroded = (pad[1:-1, 1:-1] & pad[:-2, 1:-1] & pad[2:, 1:-1]
                  & pad[1:-1, :-2] & pad[1:-1, 2:])
        weight[inside & ~eroded] = value
        inside = eroded
    weight = np.asarray(Image.fromarray(weight).resize(size, Image.Resampling.NEAREST))[:, :, None]
    rgb = np.clip(rgb * (1 - weight) + expected[:, :, :3] * weight, 0, 255).astype(np.uint8)
    # Native coverage, including transparent corners, is immutable.
    rgb = extrude(rgb, expected[:, :, 3] > 0)
    return Image.fromarray(np.dstack([rgb, expected[:, :, 3]]))


group = dict(id='ground', scope='COMPLETE_GRASS_DIRT_AND_ALL_LAT_TRANSITION_VARIANTS',
             members=[{k: m[k] for k in ['member', 'sourceHashes', 'images']} for m in members], variants=[])
for density in [2, 4]:
    width = 1024 if density == 2 else 2048
    frames = [project(m['member'], density) for m in members]
    rects, x, y, row = [], 2, 2, 0
    for frame in frames:
        if x + frame.width + 2 > width:
            x, y, row = 2, y + row + 4, 0
        rects.append([x, y, *frame.size])
        x += frame.width + 4
        row = max(row, frame.height)
    atlas = Image.new('RGBA', (width, y + row + 2))
    for frame, (x, y, w, h) in zip(frames, rects):
        atlas.paste(frame, (x, y))
        for strip, point in [(frame.crop((0, 0, 1, h)).resize((2, h)), (x - 2, y)),
                             (frame.crop((w - 1, 0, w, h)).resize((2, h)), (x + w, y)),
                             (frame.crop((0, 0, w, 1)).resize((w, 2)), (x, y - 2)),
                             (frame.crop((0, h - 1, w, h)).resize((w, 2)), (x, y + h))]:
            atlas.paste(strip, point)
    file = f'ground-{density}x.rgba'
    raw = atlas.tobytes()
    (destination / file).write_bytes(raw)
    atlas.save(export / f'ground-{density}x-atlas.png')
    group['variants'].append(dict(density=density, file=file, size=list(atlas.size), rects=rects,
                                 sha256=hashlib.sha256(raw).hexdigest()))
for retained in base['groups']:
    for variant in retained['variants']:
        (destination / variant['file']).write_bytes((base_root / variant['file']).read_bytes())
manifest = dict(schema='tmp-terrain-hd-v1', revision=args.revision, theater='TEMPERATE',
                editions=['ra2', 'yr'], scope='FLAT_GROUND_TRIAL_WITH_ACCEPTED_V10_STRUCTURE',
                groups=[group, *base['groups']])
raw = (json.dumps(manifest, separators=(',', ':')) + '\n').encode()
(destination / 'manifest.json').write_bytes(raw)
pointer = dict(schemaVersion=1, revision=args.revision, sha256=hashlib.sha256(raw).hexdigest())
for file in ['.local/terrain-selection.json', 'desktop/terrain-hd-contract.json']:
    Path(file).write_text(json.dumps(pointer, indent=2) + '\n')
(export / 'recipe.json').write_text(json.dumps(dict(pack=pointer, masters=provenance,
    method='Registered newly reconstructed Original-pattern ground sprites; independent 2X/4X sampling',
    sourceRegistration='ACTUAL_CONNECTED_SPRITE_EXTENT' if args.registered_extent else 'FIXED_REFERENCE_RECTANGLE',
    familyPaletteOffsets=anchors, nativeGeometryAndAlpha='EXACT',
    contact='Exact Original outer native pixel; half-weight second pixel; authored interior RGB',
    acceptedStructureAndRoads='EXACT_V10_BYTES_AND_METADATA', independentDensities=[2, 4]), indent=2) + '\n')
print(json.dumps(dict(pack=pointer, groundMembers=48, retainedMembers=21, totalImages=136)))
