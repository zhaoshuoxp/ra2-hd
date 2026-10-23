"""Verify packed component coverage, rigid floors and scoped asset preservation."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import maximum_filter

from buildup import artwork_frames, native_indices, read, sha, unpack, write
from painted_rig import encode_owner, place
from painted_motion import reduce_material


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('authoring', type=Path)
    parser.add_argument('predecessor', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--expected-changed-sequences', type=int)
    args = parser.parse_args()
    current, before = read(args.authoring), read(args.predecessor)
    args.output.mkdir(exist_ok=False)
    result = {'status': 'PASS_PAINTED_PIXELS_ROLES_AND_PRESERVATION', 'families': [],
              'selectedSequences': len(current['hdRepaintProgress']['registeredCandidateKeys']),
              'checkedDensityFrames': sum(r['frames']*2 for r in current['families']
                  if r['key'] in current['hdRepaintProgress']['registeredCandidateKeys']),
              'changedSequences': 0, 'changedDensityFrames': 0, 'unchangedSequences': 0,
              'visualAcceptance': 'PENDING', 'windowsRuntime': 'NOT_RUN'}
    for record in current['families']:
        old = next(f for f in before['families'] if f['key'] == record['key'])
        if record == old:
            assert sha(old['newFamilyPath']) == old['newFamilySha256']
            result['unchangedSequences'] += 1
            continue
        rig = record['componentRig']
        assert sha(record['nativeSource']) == rig['nativeSourceSha256']
        member = record['newMember']
        root = Path('.local/hd-packs') / member['packId'] / member['revision']
        old_root = Path('.local/hd-packs') / old['newMember']['packId'] / old['newMember']['revision']
        manifest, previous = read(root/'manifest.json'), read(old_root/'manifest.json')
        assert sha(root/'manifest.json') == member['sha256']
        assert manifest['logical'] == previous['logical'] and manifest['source'] == previous['source']
        family, old_family = read(record['newFamilyPath']), read(old['newFamilyPath'])
        assert family['members'] == [member if m == old['newMember'] else m for m in old_family['members']]
        for slot in ('turret', 'turrets'):
            def hashes(value):
                if isinstance(value, dict):
                    return [value['sha256']] if 'sha256' in value else sum((hashes(v) for v in value.values()), [])
                return []
            assert hashes(family.get(slot)) == hashes(old_family.get(slot)), 'Finished turret changed'
        assert sha(record['newFamilyPath']) == record['newFamilySha256']
        for variant in manifest['variants']:
            assert len(variant['pages']) <= 8
            for page in variant['pages']:
                assert max(page['size']) <= 2048
                for role in ('base', 'data'):
                    assert sha(root/page[role]) == page[role+'Sha256']
        raw = read(record['nativeSource'])
        palette = np.asarray(record['palette'], np.uint8)
        canvas = manifest['logical']['canvas']
        foundation = rig.get('foundationSource')
        master_pair = None
        if foundation:
            master = place(Image.open(foundation['image']), foundation['box'], canvas)
            master_pair = encode_owner(master, palette)
        checks = []
        for phase, nodes in enumerate(rig['phases']):
            layers = []
            if not isinstance(nodes, dict):
                for node in nodes:
                    assert sha(node['image']) == node['sha256']
                    layers.append(place(Image.open(node['image']), node['box'], canvas))
                # Independent alpha-only recurrence; RGB authoring is not reused.
                expected_alpha = np.zeros(layers[0].shape[:2], float)
                for layer in layers:
                    expected_alpha = np.floor(layer[..., 3] + expected_alpha*(1-layer[..., 3]/255)+.5)
                if foundation and phase >= rig['foundationStableFrom']:
                    assert nodes[0] == foundation, 'Foundation transform/material changed'
            for density in (2, 4):
                base, data = [unpack(root, manifest, density, phase, role) for role in ('base', 'data')]
                assert not (data[..., 1] > 15).any() and not data[..., 2].any()
                assert not data[..., 0][base[..., 3] == 0].any()
                indices = native_indices(raw, phase)
                if not ((indices >= 16) & (indices <= 31)).any():
                    assert not data[..., 0].any(), 'Ownership precedes native surface stage'
                f = artwork_frames(manifest)[phase]
                x, y = (v*density for v in f['trimOrigin'])
                w, h = (v*density for v in f['legacyRenderSize'])
                for role, array in [('base', base), ('data', data)]:
                    file = Path(record['exportsPath']) / f'{phase:02}-{density}x-{role}-canvas.png'
                    exported = np.asarray(Image.open(file))
                    assert np.array_equal(array[y:y+h, x:x+w], exported[y:y+h, x:x+w]), 'Atlas changed pixels'
                if isinstance(nodes, dict):
                    assert all(np.array_equal(unpack(root, manifest, density, phase, role),
                                              unpack(old_root, previous, density, phase, role)) for role in ('base', 'data'))
                elif density == 4:
                    assert np.max(np.abs(base[..., 3].astype(float)-expected_alpha)) <= 1
                    exposed = None
                    if master_pair and phase >= rig['foundationStableFrom']:
                        occluded = np.zeros(layers[0].shape[:2], bool)
                        for layer in layers[1:]:
                            occluded |= layer[..., 3] > 0
                        exposed = (master_pair[0][..., 3] > 0) & ~occluded
                        assert np.array_equal(base[exposed], master_pair[0][exposed]), 'Exposed fixed floor changed'
                        assert np.array_equal(data[exposed, :3], master_pair[1][exposed, :3])
                else:
                    high = [unpack(root, manifest, 4, phase, role) for role in ('base', 'data')]
                    expected_pair = reduce_material(high, palette)
                    assert np.array_equal(base, expected_pair[0]), '2X alpha/material reduction drift'
                    assert np.array_equal(data[y:y+h, x:x+w], expected_pair[1][y:y+h, x:x+w])
                checks.append({'phase': phase, 'density': density, 'coverage': 'PASS',
                               'terminal': phase == record['frames']-1})
        result['changedSequences'] += 1
        result['changedDensityFrames'] += len(checks)
        result['families'].append({'key': record['key'], 'checks': checks,
                                   'foundationStableFrom': rig.get('foundationStableFrom'),
                                   'originalNeutralRgbCopied': 0})
    if args.expected_changed_sequences is not None:
        assert result['changedSequences'] == args.expected_changed_sequences
    else:
        assert result['changedSequences'] in (12, 14)
    write(args.output/'pixel-validation.json', result)
    write(args.output/'temporal-validation.json', {
        'status': 'PASS_PAINTED_CONTINUITY_AND_CONSTRUCTION_PRESERVATION',
        'candidateAuthoringSha256': sha(args.authoring), 'foundationChecks': result['families'],
        'boundary': 'Immutable authored floors including alpha; moving component anatomy awaits user review'})
    print(result['changedSequences'], result['changedDensityFrames'], 'component density frames validated')


if __name__ == '__main__':
    main()
