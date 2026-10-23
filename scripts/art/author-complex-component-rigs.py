"""Author independent slabs, barracks panels and chronosphere mechanisms."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import label

from buildup import native_indices, read, sha, write
from painted_cutout import extract_grid_poses
from painted_rig import bounds, over, place, vector_coverage, material_surface
from importlib.machinery import SourceFileLoader

helpers = SourceFileLoader('simple_rigs', 'scripts/art/author-simple-component-rigs.py').load_module()
node, canvas_node, poses = helpers.node, helpers.canvas_node, helpers.poses


def growing_floor(master, raw, phase, output):
    """Reveal the unfinished slab geometry; its texture remains in world space."""
    layer = place(Image.open(master['image']), master['box'], raw['canvas'])
    guide = native_indices(raw, phase) > 0
    coverage = vector_coverage(guide)
    frame = raw['frames'][phase]
    envelope = np.zeros(coverage.shape, bool)
    x, y, w, h = (frame[k] * 4 for k in ('x', 'y', 'width', 'height'))
    envelope[y:y+h, x:x+w] = True
    coverage[~envelope] = 0
    layer[..., 3] = np.floor(layer[..., 3].astype(float) * coverage / 255 + .5).astype(np.uint8)
    layer[..., :3][layer[..., 3] == 0] = 0
    return canvas_node(layer, output / f'{phase:02}-slab.png', 'unfinished-foundation')


def chronosphere(record, root, output):
    raw = read(record['nativeSource'])
    atlas = [poses(root, 'gacsph-upper-00-v2.png'), poses(root, 'gacsph-upper-09-v1.png'),
             poses(root, 'gacsph-upper-18-v1.png')]
    master = node(poses(root, 'gacsph-fixed-floor-v2.png', (1, 1))[0], output / 'foundation.png',
                  'foundation', (27, 98, 201, 189))
    post = node(atlas[0][0], output / 'initial-post.png', 'rear-post', (83, 103, 108, 126))
    boxes = [(83, 103, 108, 126)] * 3 + [(69, 101, 127, 155), (69, 101, 128, 155),
            (69, 100, 128, 155), (52, 98, 167, 163), (52, 98, 167, 163), (52, 98, 167, 163),
            (52, 98, 167, 163)]
    phases = []
    for phase in range(25):
        floor = master if phase >= 7 else growing_floor(master, raw, phase, output)
        if phase < 3:
            upper = post
        else:
            source_phase = min(phase, 23)
            source = atlas[source_phase // 9][source_phase % 9]
            box = boxes[phase] if phase < 10 else (52, raw['frames'][phase]['y'], 193, 184)
            upper = node(source, output / f'{phase:02}-mechanism.png', 'mechanism', box)
        phases.append([floor, upper])
    return {'nativeSourceSha256': sha(record['nativeSource']), 'phases': phases,
            'foundationStableFrom': 7, 'foundationSource': master,
            'neutralMaterialProvenance': 'AUTHORED_PAINTED_RGBA_ONLY',
            'foundationOpenings': 'Two authored transparent bays retained before cylinders occupy them'}


def barracks(record, root, output):
    raw = read(record['nativeSource'])
    master = node(poses(root, 'gapile-fixed-floor-v2.png', (1, 1))[0], output / 'foundation.png',
                  'foundation', (74, 86, 204, 144))
    early = poses(root, 'gapile-original-parts-00-v1.png')
    late = [poses(root, 'gapile-original-parts-09-v1.png'), poses(root, 'gapile-original-parts-18-v1.png')]
    hall = early[3]
    enamel = hall.crop((round(hall.width*.38), round(hall.height*.28),
                       round(hall.width*.56), round(hall.height*.40)))
    terminal = poses(root, 'gapile-complete-upper-terminal-v1.png', (1, 1))[0]
    gold = helpers.material_patch(terminal, 'yellow')
    first_hall = node(hall, output / 'fixed-first-hall.png', 'first-hall', (106, 69, 165, 110))
    phases = []
    for phase in range(25):
        nodes = [master if phase >= 10 else growing_floor(master, raw, phase, output)]
        idx = native_indices(raw, phase)
        yy, xx = np.indices(idx.shape)
        palette = np.asarray(record['palette'])
        colors = palette[idx]
        parking_region = (((xx >= 92) & (xx <= 128) & (yy >= 113) & (yy <= 125))
                          | ((xx >= 127) & (xx <= 165) & (yy >= 130) & (yy <= 143)))
        parking = ((idx > 31) & parking_region & (colors[..., 0] > 170)
                   & (colors[..., 1] > 140) & (colors[..., 2] < 70))
        if parking.any():
            nodes.append(canvas_node(material_surface(gold, parking, vector=True),
                                     output / f'{phase:02}-parking.png', 'finishing-ground-paint'))
        owners, owner_count = label((idx >= 16) & (idx <= 31))
        for component in range(1, owner_count+1):
            small = owners == component
            bb = bounds(small)
            if 2 <= small.sum() <= 40 and bb[1] >= 119 and bb[0] >= 120 and bb[2] <= 161:
                nodes.append(canvas_node(material_surface(enamel, small, vector=True),
                                         output / f'{phase:02}-switch-{component}.png', 'finishing-floor-switch'))
        if phase >= 9:
            source_phase = min(phase, 23)
            image = terminal if phase == 24 else late[0 if source_phase < 18 else 1][source_phase % 9]
            box = (98, raw['frames'][phase]['y'], 204, 134)
            if phase == 9:
                box = (106, 32, 220, 132)
            elif phase == 10:
                box = (106, 42, 218, 132)
            elif phase == 11:
                box = (99, 51, 212, 132)
            nodes.append(node(image, output / f'{phase:02}-upper.png', 'painted-partial-roofs-and-halls', box))
        else:
            if phase >= 3:
                nodes.append(first_hall)
            if phase >= 6:
                nodes.append(node(hall, output / f'{phase:02}-second-hall.png', 'second-hall',
                                  (141, 86 if phase >= 7 else 84, 200, 127)))
            owner_components, count = label((idx >= 16) & (idx <= 31))
            for component in range(1, count+1):
                mask = owner_components == component
                bb = bounds(mask)
                if mask.sum() < 25:
                    continue
                lifting = (phase == 2 or phase >= 4 and bb[0] >= 150 and bb[3] <= 90
                           or phase >= 7 and bb[0] >= 195 or phase == 5 and bb[0] >= 135)
                if lifting:
                    nodes.append(canvas_node(material_surface(enamel, mask, vector=True),
                                  output / f'{phase:02}-sheet-{component}.png', 'thin-moving-sheet'))
        if phase in (7, 8):
            from scipy.ndimage import minimum_filter
            source = np.asarray(late[0][0]).astype(float)
            metallic = ((source[..., 3] >= 250) & (source[..., :3].min(axis=2) >= 130)
                        & (source[..., :3].max(axis=2)-source[..., :3].min(axis=2) < 35))
            for size in (15, 7, 3):
                sy, sx = np.where(minimum_filter(metallic, size=size, mode='constant'))
                if len(sx):
                    i = len(sx)//2; radius = size//2
                    patch = late[0][0].crop((sx[i]-radius, sy[i]-radius, sx[i]+radius+1, sy[i]+radius+1))
                    break
            else:
                raise AssertionError('Missing authored roll metal')
            yy, xx = np.indices(idx.shape)
            rgb = np.asarray(record['palette'])[idx]
            baseline = native_indices(raw, 4)
            roll = ((idx > 31) & (idx != baseline) & (xx >= 140) & (xx <= 167)
                    & (yy >= 58) & (yy <= 89) & (rgb[..., 1] <= rgb[..., 0]*1.3))
            nodes.append(canvas_node(material_surface(patch, roll, vector=True),
                                     output / f'{phase:02}-first-roll.png', 'emerging-first-roll'))
        phases.append(nodes)
    return {'nativeSourceSha256': sha(record['nativeSource']), 'phases': phases,
            'foundationStableFrom': 10, 'foundationSource': master,
            'partGeometry': 'Fixed hall anchors, thin original-guided sheets, authored partial roofing poses',
            'neutralMaterialProvenance': 'AUTHORED_PAINTED_RGBA_ONLY_NO_NATIVE_RGB'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('authoring', type=Path)
    parser.add_argument('assets', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    authoring = read(args.authoring)
    rigs = {}
    for key, build in [('gacsph-temperate', chronosphere), ('gapile-temperate', barracks)]:
        record = next(f for f in authoring['families'] if f['key'] == key)
        output = args.assets / f'{key}-nodes-{args.version}'
        output.mkdir(exist_ok=False)
        rig = rigs[key] = build(record, args.assets, output)
        raw = read(record['nativeSource'])
        for phase, nodes in enumerate(rig['phases']):
            rgba = np.zeros((raw['canvas'][1]*4, raw['canvas'][0]*4, 4), np.uint8)
            for n in nodes:
                rgba = over(place(Image.open(n['image']), n['box'], raw['canvas']), rgba)
            Image.fromarray(rgba).save(output / f'{phase:02}-preview.png')
    write(args.output, rigs)
    print('Two complex rigs authored; runtime selection unchanged')


if __name__ == '__main__':
    main()
