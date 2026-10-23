"""Preserve registered component coverage while applying authored snow material."""
import argparse
import copy
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import minimum_filter

from buildup import native_indices, read, sha, write
from painted_cutout import extract_grid_poses
from painted_rig import bounds, fit_rgba, place, vector_coverage


def white_patch(image):
    a = np.asarray(image).astype(float)
    neutral = ((a[..., 3] >= 250) & (a[..., :3].min(axis=2) >= 150)
               & (a[..., :3].max(axis=2) - a[..., :3].min(axis=2) < 40))
    for size in (31, 15, 7, 3):
        y, x = np.where(minimum_filter(neutral, size=size, mode='constant'))
        if len(x):
            n = len(x)//2; radius = size//2
            return image.crop((x[n]-radius, y[n]-radius, x[n]+radius+1, y[n]+radius+1))
    raise AssertionError('No opaque authored snow patch')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('authoring', type=Path)
    parser.add_argument('rigs', type=Path)
    parser.add_argument('jobs', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    authority, rigs, jobs = read(args.authoring), read(args.rigs), read(args.jobs)
    for key in list(rigs):
        if not key.endswith('-temperate'):
            continue
        snow_key = key.replace('-temperate', '-snow')
        temp = next(r for r in authority['families'] if r['key'] == key)
        snow = next(r for r in authority['families'] if r['key'] == snow_key)
        temp_raw, snow_raw = read(temp['nativeSource']), read(snow['nativeSource'])
        binding = snow['newMember']
        logical = read(Path('.local/hd-packs') / binding['packId'] / binding['revision'] / 'manifest.json')['logical']['frames']
        rig = copy.deepcopy(rigs[key])
        rig['nativeSourceSha256'] = sha(snow['nativeSource'])
        output = args.output.parent / f'{snow_key}-nodes-{args.version}'
        output.mkdir(exist_ok=False)
        job = jobs[snow_key][-1]
        grid = job.get('grid', [len(job['phases']), 1])
        cell = job.get('cells', list(range(len(job['phases']))))[-1]
        source = extract_grid_poses(Image.open(job['image']), *grid)[cell][0]
        texture = white_patch(source)
        texture.save(output / 'authored-snow-material.png')
        authored = fit_rgba(texture, (snow_raw['canvas'][0]*4, snow_raw['canvas'][1]*4))
        temp_palette = np.asarray(temp['palette'], float)
        snow_palette = np.asarray(snow['palette'], float)
        masks = []
        for phase in range(snow['frames']):
            ti, si = native_indices(temp_raw, phase), native_indices(snow_raw, phase)
            tc, sc = temp_palette[ti], snow_palette[si]
            frost = ((si > 31) & (sc.mean(axis=2) > tc.mean(axis=2)+25)
                     & (sc.min(axis=2) >= 130) & (sc.max(axis=2)-sc.min(axis=2) < 45))
            masks.append(vector_coverage(frost)/255)
        floor_mask = masks[-1]
        foundation = None
        for phase, nodes in enumerate(rig['phases']):
            if isinstance(nodes, dict):
                continue
            replacements = []
            for index, component in enumerate(nodes):
                floor = component['name'] == 'foundation' and phase >= rig.get('foundationStableFrom', 0)
                if floor and foundation:
                    replacements.append(foundation)
                    continue
                box = component['box']
                if floor:
                    frames = logical[rig['foundationStableFrom']:]
                    left = max(f['trimOrigin'][0] for f in frames)
                    top = max(f['trimOrigin'][1] for f in frames)
                    right = min(f['trimOrigin'][0]+f['legacyRenderSize'][0] for f in frames)
                    bottom = min(f['trimOrigin'][1]+f['legacyRenderSize'][1] for f in frames)
                    box = [max(left, box[0]), max(top, box[1]), min(right, box[2]), min(bottom, box[3])]
                else:
                    f = logical[phase]
                    left, top = f['trimOrigin']
                    right, bottom = left+f['legacyRenderSize'][0], top+f['legacyRenderSize'][1]
                    box = [max(left, box[0]), max(top, box[1]), min(right, box[2]), min(bottom, box[3])]
                    assert box[2] > box[0] and box[3] > box[1]
                layer = place(Image.open(component['image']), box, snow_raw['canvas'])
                original_alpha = layer[..., 3].copy()
                rgb = layer[..., :3].astype(float)
                red = (rgb[..., 0] > rgb[..., 1]*1.5) & (rgb[..., 0] > rgb[..., 2]*1.5)
                neutral = (rgb.max(axis=2)-rgb.min(axis=2) < 50) & ~red
                weight = (floor_mask if floor else masks[phase]) * neutral * .85
                coat = authored[..., :3].astype(float) * (.65 + rgb.mean(axis=2)[..., None]/255*.35)
                layer[..., :3] = np.floor(rgb*(1-weight[..., None]) + coat*weight[..., None]+.5).astype(np.uint8)
                assert np.array_equal(layer[..., 3], original_alpha), 'Snow changed component geometry'
                layer[..., :3][layer[..., 3] == 0] = 0
                bb = bounds(layer[..., 3] > 0)
                x0, y0, x1, y1 = bb
                file = output / f'{phase:02}-{index:02}-{component["name"]}.png'
                Image.fromarray(layer[y0:y1, x0:x1]).save(file)
                replacement = {**component, 'image': str(file), 'sha256': sha(file), 'box': [v/4 for v in bb]}
                replacements.append(replacement)
                if floor:
                    foundation = replacement
            rig['phases'][phase] = replacements
        if foundation:
            rig['foundationSource'] = foundation
        rig['snowMaterial'] = {'source': job['image'], 'sourceSha256': sha(job['image']),
                               'patch': str(output/'authored-snow-material.png'),
                               'patchSha256': sha(output/'authored-snow-material.png'),
                               'coverage': 'COMPLETE_AUTHORED_ALPHA_REPROJECTED_TO_SNOW_LOGICAL_EXTENTS', 'nativeRgbCopied': 0}
        rigs[snow_key] = rig
    write(args.output, rigs)
    print(len(rigs), 'theater-specific rigs; runtime unchanged')


if __name__ == '__main__':
    main()
