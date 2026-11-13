"""Retain authored Lunar RGB and restore original opaque internal tile contacts."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('output', type=Path)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
read = lambda p: json.loads(p.read_text())
encode = lambda v: (json.dumps(v, indent=2) + '\n').encode()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pointer_file = Path('.local/terrain-lunar-selection.json')
contract_file = Path('desktop/terrain-theater-hd-contracts.json')
prior = read(pointer_file)
assert prior == dict(schemaVersion=1, revision='yr-lunar-complete-terrain-candidate-r1',
                     sha256='c453b047674873c9069f0102777bc50bbf451b050ea537f508e34d134fcca1ca')
contracts = read(contract_file)
assert contracts['LUNAR'] == prior
old = Path('.local/terrain-packs') / prior['revision']
assert sha(old / 'manifest.json') == prior['sha256']
manifest = read(old / 'manifest.json')
assert manifest['theater'] == 'LUNAR' and manifest['editions'] == ['yr']
source_file = Path('.local/source-art/yr-campaign-v1/lunar-terrain/source.json')
source = read(source_file)
prepared = Path('.artifacts/yr-campaign/lunar-native-r1')
assert sha(prepared / 'source.json') == source['preparedSourceSha256']
sources = {m['member']: m['native'] for m in source['members']}
pack = old.with_name(args.revision)
assert not pack.exists() and not args.output.exists()
pack.mkdir()
manifest = copy.deepcopy(manifest)
manifest['revision'] = args.revision
repaired_groups = {'yr-lunar-v1-set09', 'yr-lunar-v1-set43'}
records, retained = [], []
for group in manifest['groups']:
    repair = group['id'] in repaired_groups
    if repair:
        del group['contourReconstruction']
    for variant in group['variants']:
        density = variant['density']
        original = old / variant['file']
        assert sha(original) == variant['sha256']
        target = pack / variant['file']
        if not repair:
            os.link(original, target)
            retained.append(dict(file=variant['file'], sha256=variant['sha256']))
            continue
        original_pixels = np.frombuffer(original.read_bytes(), np.uint8).reshape(
            variant['size'][1], variant['size'][0], 4)
        pixels = original_pixels.copy()
        frame = 0
        for member in group['members']:
            native = sources[member['member']]
            assert member['sourceHashes'] == {'yr': native['sha256']}
            assert len(member['images']) == len(native['images'])
            for metadata, image in zip(member['images'], native['images']):
                assert all(metadata[k] == image[k] for k in metadata)
                payload = prepared / 'native' / image['file']
                assert sha(payload) == image['rgbaSha256']
                rgba = np.frombuffer(payload.read_bytes(), np.uint8).reshape(*image['size'][::-1], 4)
                x, y, width, height = variant['rects'][frame]
                frame += 1
                alpha = rgba[:, :, 3].repeat(density, 0).repeat(density, 1)
                assert alpha.shape == (height, width)
                before = pixels[y:y+height, x:x+width, 3].copy()
                # These are internal ground cuts. Adjacent source tiles depend on
                # their exact opaque coverage; exposed-object AA is inappropriate.
                pixels[y-2:y+height+2, x-2:x+width+2, 3] = np.pad(alpha, 2, mode='edge')
                records.append(dict(member=member['member'], subTile=image['subTile'], density=density,
                    originalRgbaSha256=image['rgbaSha256'], changedAlphaPixels=int((before != alpha).sum()),
                    restoredOpaqueSamples=int(((alpha == 255) & (before < 128)).sum()),
                    rgbUnchanged=True, exactOriginalAlpha=True))
        assert frame == len(variant['rects'])
        assert np.array_equal(pixels[:, :, :3], original_pixels[:, :, :3])
        target.write_bytes(pixels.tobytes())
        variant['sha256'] = sha(target)
(pack / 'manifest.json').write_bytes(encode(manifest))
selected = dict(schemaVersion=1, revision=args.revision, sha256=sha(pack / 'manifest.json'))
assert len(manifest['groups']) == 9
assert sum(len(m['images']) for g in manifest['groups'] for m in g['members']) == 338
assert all(sha(pack / r['file']) == r['sha256'] for r in retained)
if args.apply:
    assert read(pointer_file) == prior and read(contract_file) == contracts
    pointer_file.write_bytes(encode(selected))
    contract_file.write_bytes(encode({**contracts, 'LUNAR': selected}))
report = dict(schema='yr-lunar-internal-ground-contact-coverage-repair-v1',
    status='SELECTED_EXACT_SOURCE_ALPHA_AUTHORED_RGB_NATIVE_REVIEW_PENDING' if args.apply
        else 'UNSELECTED_EXACT_SOURCE_ALPHA_AUTHORED_RGB_NATIVE_REVIEW_PENDING',
    priorSelection=prior, selectedPack=selected, repairedGroups=sorted(repaired_groups),
    source=dict(file=str(source_file), sha256=sha(source_file)),
    preparedSourceSha256=source['preparedSourceSha256'], retainedAtlases=retained, frames=records,
    originalGeometryDepthRulesUnchanged=True, acceptedPayloadsReplaced=0,
    originalRgbUsedAsNewDetail=False, allAuthoredRgbUnchanged=True,
    worldBudgetsChanged=False, runtimeCodeChanged=False,
    registered=args.apply, userVisualAcceptance='PENDING', windows='NOT_RUN_ON_THIS_MAC')
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_bytes(encode(report))
print(json.dumps(dict(status=report['status'], pack=selected,
    repairedDensityFrames=sum(r['changedAlphaPixels'] > 0 for r in records),
    restoredOpaqueSamples=sum(r['restoredOpaqueSamples'] for r in records))))
