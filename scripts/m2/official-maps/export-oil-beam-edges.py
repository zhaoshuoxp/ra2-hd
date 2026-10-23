"""Repair omitted retail beam shades without reauthoring the accepted R9 rig."""
import copy
import json
import runpy
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

helpers = runpy.run_path(str(Path(__file__).with_name('export-oil-native-rig.py')))
sha, extrude = helpers['sha'], helpers['extrude']


def edge_mask(indices, accepted, fixed):
    """Include retail cream, peach and brown transitions omitted by R9's ranges."""
    y, x = np.indices(indices.shape)
    warm = ((indices >= 64) & (indices <= 79)) | ((indices >= 96) & (indices <= 143))
    warm |= ((indices >= 160) & (indices <= 166)) | ((indices >= 176) & (indices <= 191))
    near = ndimage.distance_transform_edt(~accepted) <= 3.25
    seeds = accepted | (warm & near & (x >= 5) & (x < 47) & (y < 50) & ~fixed)
    filled = seeds.copy()
    for column in range(5, 47):
        rows = np.where(seeds[:, column])[0]
        if len(rows):
            filled[rows.min():rows.max()+1, column] = True
    return filled & ~accepted & ~fixed & (indices != 0) & (indices != 12) & ~((indices >= 16) & (indices <= 31))


def main():
    base, output, evidence = map(Path, sys.argv[1:4])
    assert not output.exists() and not evidence.exists()
    guide = Path('.artifacts/m2-3/native-guides-v3')
    source = next(s for s in json.loads((guide/'source.json').read_text())['sources'] if s['member'] == 'ctoild_a.shp')
    indices = []
    for frame in source['frames'][:64]:
        file = guide/'native'/frame['indexFile']
        assert sha(file) == frame['indexSha256']
        indices.append(np.frombuffer(file.read_bytes(), np.uint8).reshape(69, 61))
    indices = np.stack(indices)
    accepted = np.stack([helpers['beam_mask'](i) for i in indices])
    fixed = [np.all(indices[state*32:(state+1)*32] == indices[state*32], axis=0) for state in range(2)]
    masks = [edge_mask(i, accepted[n], fixed[n//32]) for n, i in enumerate(indices)]
    master = Path('.artifacts/m2-3/feedback-r8-v1/authoring/gold-beam.png')
    gold = np.array(Image.open(master).convert('RGBA').crop((0, 0, 384, 512)))
    # Missing transition cells must sample metal, not the master's cutout outline
    # or bolt holes. The accepted R9 interior, including real holes, is untouched.
    surface = (gold[..., 3] > 180) & (gold[..., :3].mean(axis=2) >= 80)
    gold[..., :3] = extrude(gold[..., :3], surface)
    catalog = json.loads((base/'manifest.json').read_text())
    family = copy.deepcopy(catalog['families']['environment-ctoild'])
    output.mkdir(parents=True)
    records = []
    for member in family['members']:
        old = base/member['path']; file = output/member['path']
        assert sha(old) == member['sha256']
        shutil.copytree(old.parent, file.parent)
        if member['member'] != 'ctoild_a.shp':
            continue
        metadata = json.loads(file.read_text())
        metadata['packRevision'] = output.name
        metadata['authored']['r10BeamEdges'] = dict(baseManifestSha256=sha(old), beamMasterSha256=sha(master),
            method='Overlay only omitted retail beam transition RGB; freeze accepted R9 surface, rig and stationary material',
            geometry='Original alpha, owner data, all content/sample rectangles, bearing positions and timing unchanged')
        for variant in metadata['variants']:
            d = variant['density']
            for page in variant['pages']:
                folder = file.parent/str(d)/page['id']
                pixels = np.array(Image.open(folder/'base.png')); before = pixels.copy(); seen = set()
                for frame in variant['frames']:
                    if frame['page'] != page['id'] or tuple(frame['sampleRect']) in seen or frame['nativeFrame'] >= 64:
                        continue
                    seen.add(tuple(frame['sampleRect'])); n = frame['nativeFrame']
                    x, y, w, h = frame['contentRect']; region = pixels[y:y+h, x:x+w]
                    mask = masks[n].repeat(d, 0).repeat(d, 1) & (region[..., 3] > 0)
                    surface = helpers['beam_surface'](gold, accepted[n], d)
                    region[..., :3][mask] = surface[mask]
                    # Only the existing sampling gutter is refreshed; no trim or alpha changes.
                    pixels[y-2:y+h+2, x-2:x+w+2, :3] = np.pad(region[..., :3], ((2, 2), (2, 2), (0, 0)), mode='edge')
                    pixels[pixels[..., 3] == 0, :3] = 0
                    records.append(dict(frame=n, density=d, omittedNativeCells=int(masks[n].sum()),
                                        overlayPixels=int(mask.sum()), mask=masks[n].astype(int).tolist()))
                assert np.array_equal(before[..., 3], pixels[..., 3])
                Image.fromarray(pixels).save(folder/'base.png')
                page['baseSha256'] = sha(folder/'base.png'); page['baseBytes'] = (folder/'base.png').stat().st_size
        file.write_text(json.dumps(metadata, separators=(',', ':'))+'\n'); member['sha256'] = sha(file)
    (output/'manifest.json').write_text(json.dumps(dict(catalog, revision=output.name,
        families={'environment-ctoild': family}), separators=(',', ':'))+'\n')
    evidence.write_text(json.dumps(dict(status='EXPORTED_OMITTED_BEAM_EDGE_RGB_ONLY', base=str(base.resolve()),
        baseSha256=sha(base/'manifest.json'), manifestSha256=sha(output/'manifest.json'), frames=records), separators=(',', ':'))+'\n')
    print(json.dumps(dict(output=str(output), frames=len(records), overlayPixels=sum(r['overlayPixels'] for r in records))))


if __name__ == '__main__':
    main()
