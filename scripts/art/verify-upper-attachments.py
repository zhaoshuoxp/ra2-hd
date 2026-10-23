"""Measure rendered upper landmarks and preserve the accepted ground layers."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import label, find_objects

from buildup import read, sha, unpack, write
from painted_rig import place


def features(rgba, density, kind):
    c = rgba[..., :3].astype(float)
    if kind == "window":
        mask = (c[..., 1] > c[..., 0]*1.15) & (c[..., 1] > c[..., 2]*.65) & (c[..., 1] > 35)
        minimum = 4
    else:
        mask = (c.min(axis=2) > 145) & ((c.max(axis=2)-c.min(axis=2)) < 65)
        minimum = 40  # Projected rod bands are smaller than their authored source poses.
    ids, _ = label(mask & (rgba[..., 3] > 180))
    points = []
    for component, region in enumerate(find_objects(ids), 1):
        yy, xx = np.where(ids[region] == component)
        if len(xx) >= minimum*density*density:
            points.append([(region[1].start+xx.mean()+.5)/density,
                           (region[0].start+yy.mean()+.5)/density])
    return np.asarray(points)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("authoring", type=Path)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("landmarks", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    current, baseline, control = read(args.authoring), read(args.baseline), read(args.landmarks)
    assert control['baselineSha256'] == sha(args.baseline)
    rows, preserved = [], []
    for r in current['families']:
        old = next(r0 for r0 in baseline['families'] if r0['key'] == r['key'])
        if not r.get('componentRig', {}).get('upperRegistration'):
            assert r == old
            preserved.append(r['key'])
            continue
        before, after = old['componentRig'], r['componentRig']
        assert before['foundationSource'] == after['foundationSource']
        assert before['foundationStableFrom'] == after['foundationStableFrom']
        for phase, (old_nodes, nodes) in enumerate(zip(before['phases'], after['phases'])):
            if isinstance(old_nodes, dict):
                assert nodes == old_nodes
                continue
            def ground(items):
                return [n for n in items if n['name'] in {'foundation', 'unfinished-foundation', 'floor-stripes'}
                        or n['name'].startswith(('pad-', 'finishing-'))]
            assert ground(old_nodes) == ground(nodes), (r['key'], phase, 'Accepted ground changed')
            for n in ground(nodes):
                assert sha(n['image']) == n['sha256']
        root = Path('.local/hd-packs')/r['newMember']['packId']/r['newMember']['revision']
        manifest = read(root/'manifest.json')
        relevant = [c for c in control['checks'] if c['key'] == r['key']]
        for density in (2, 4):
            for c in relevant:
                phase = c['phase']
                # Read actual packed material; neither the mesh nor target coordinates render it.
                pixels = unpack(root, manifest, density, phase, 'base')
                measured = []
                if r['key'] == 'gapile-temperate':
                    candidates = features(pixels, density, 'window')
                    for landmark in c['landmarks']:
                        if '-surface-' in landmark['name']:
                            continue
                        wanted = np.array(landmark['target'])
                        distances = np.linalg.norm(candidates-wanted, axis=1)
                        found = candidates[distances.argmin()]
                        error = float(distances.min())
                        assert error <= 1.0, (r['key'], phase, density, landmark['name'], error)
                        measured.append({'name': landmark['name'], 'pixelCenter': found.tolist(), 'errorNativePixels': error})
                elif r['key'] == 'gacsph-temperate':
                    candidates = features(pixels, density, 'silver')
                    for landmark in c['landmarks']:
                        if '-surface-' in landmark['name']:
                            continue
                        if phase >= 18 and landmark['name'] == 'right-rod-front':
                            continue  # The native moving cover occludes this landmark.
                        wanted = np.array(landmark['target']); distances = np.linalg.norm(candidates-wanted, axis=1)
                        found = candidates[distances.argmin()]; error = float(distances.min())
                        assert error <= 1.0, (r['key'], phase, density, landmark['name'], error)
                        measured.append({'name': landmark['name'], 'pixelCenter': found.tolist(), 'errorNativePixels': error})
                rows.append({'key': r['key'], 'phase': phase, 'density': density, 'measuredFeatures': measured})
        # Snow material can cover paint features, but the actual authored upper alpha
        # must use the same attachment projection as temperate.
        if r['key'].endswith('-snow') and r['key'].split('-')[0] != 'garobo':
            temperate = next(t for t in current['families'] if t['key'] == r['key'].replace('-snow', '-temperate'))
            for c in relevant:
                phase = c['phase']
                temp_nodes = [n for n in temperate['componentRig']['phases'][phase] if n['name'] == 'attachment-registered-upper']
                snow_nodes = [n for n in after['phases'][phase] if n['name'] == 'attachment-registered-upper']
                assert len(temp_nodes) == len(snow_nodes) == 1
                for density in (2, 4):
                    temp = place(Image.open(temp_nodes[0]['image']), temp_nodes[0]['box'], manifest['logical']['canvas'], density)
                    snow = place(Image.open(snow_nodes[0]['image']), snow_nodes[0]['box'], manifest['logical']['canvas'], density)
                    assert np.array_equal(temp[..., 3], snow[..., 3]), (r['key'], phase, density, 'Snow upper geometry differs')
    errors = [m['errorNativePixels'] for row in rows for m in row['measuredFeatures']]
    write(args.output, {'status': 'PASS_ATTACHMENT_PIXEL_MEASUREMENTS_AND_EXACT_GROUND',
                       'authoritySha256': sha(args.authoring), 'baselineSha256': sha(args.baseline),
                       'unchangedSequences': preserved, 'checks': rows,
                       'measuredVisibleFeatures': len(errors), 'maximumPixelCenterErrorNativePixels': max(errors),
                       'boundary': 'Landmark and ground checks do not establish human visual acceptance'})
    print(len(errors), 'packed feature centers checked; maximum error', round(max(errors), 3))


if __name__ == '__main__':
    main()
