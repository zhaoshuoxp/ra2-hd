"""All-slot native geometry, material data and independent-density audit."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
from production_common import ROOT, row_for, raw_for, sha
from material_policy import intended_core, RATIONALE

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('exports')
parser.add_argument('report')
parser.add_argument('--identities', nargs='+', required=True)
parser.add_argument('--theaters', nargs='+', default=['TEMPERATE', 'SNOW'])
args = parser.parse_args()
target = ROOT / args.report
assert not target.exists()
records = []
for identity in args.identities:
    for theater in args.theaters:
        row = row_for(identity, theater)
        paired = {}
        for density in (2, 4):
            folder = ROOT / args.exports / f'{identity}-{theater}-{density}x'
            receipt = json.loads((folder / 'candidate-review.json').read_text())
            paint_color = 'purple' if identity == 'NATBNK' and any(
                'bunker-original-state-masters.png' in r['source'] for r in receipt['registrations']) else 'red'
            assert (receipt['identity'], receipt['theater'], receipt['density']) == (identity, theater, density)
            expected_count = sum(m['visibleFrames'] for m in row['members'])
            assert len(receipt['frames']) == expected_count
            declared = {(f['member'], f['nativeFrame']): f for f in receipt['frames']}
            assert len(declared) == expected_count
            slots, zeros, paint = [], 0, 0
            for member in row['members']:
                raw = raw_for(member['source']['sha256'])
                owner_material = any(16 <= p <= 31 for f in raw['frames'][:member['visibleFrames']] for p in f['pixels'])
                for n, native in enumerate(raw['frames'][:member['visibleFrames']]):
                    record = declared[member['source']['member'], n]
                    contract = {k: native[k] for k in ('x', 'y', 'width', 'height', 'legacyRenderSize', 'empty')}
                    assert record['native'] == contract
                    size = tuple(v * density for v in native['legacyRenderSize'])
                    slot = {'member': member['source']['member'], 'nativeFrame': n, 'size': list(size),
                            'physicalOrigin': [native['x'] * density, native['y'] * density], 'native': contract}
                    if not all(size):
                        assert native['empty'] and record['base'] is None and record['data'] is None
                        zeros += 1
                    else:
                        base, data = [Image.open(folder / record[role]).convert('RGBA') for role in ('base', 'data')]
                        assert base.size == data.size == size
                        a, b = np.array(base), np.array(data)
                        assert np.all(b[..., 3] == 255) and not b[..., 2].any() and b[..., 1].max() <= 15
                        # Accepted atlases use fractional R coverage at some
                        # owner-paint edges. Preserve that existing shader mix;
                        # only newly authored masks require binary coverage.
                        reused = identity in ('NAPSIS', 'NACLON') and record['operation'].startswith('Accepted same-density')
                        if not reused:
                            assert set(np.unique(b[..., 0])) <= {0, 255}, (identity, member['source']['member'], n)
                        assert not b[..., 0][a[..., 3] == 0].any()
                        if native['empty']:
                            assert not a[..., 3].any() and not b[..., 0].any()
                        if identity == 'GAFWLL':
                            assert not b[..., 0].any(), 'Citadel masonry/rust is neutral material'
                        # The quantitative scan targets saturated authored red
                        # cores. Named fixed/emissive exclusions require their
                        # source/material rationale and native observations.
                        red, green, blue = np.moveaxis(a[..., :3].astype(float), 2, 0)
                        core = (a[..., 3] >= 240) & (red > 2.5 * np.maximum(green, blue)) & (red - np.maximum(green, blue) > 35)
                        missing = core & (b[..., 0] < 128)
                        authored_owner = owner_material
                        if record.get('ownerSource'):
                            origin = record['ownerSource']
                            assert identity == 'YAGRND' and 'IDLE' in member['roles'] and n < 11
                            assert origin['bounds'] == [151, 79, 168, 101] and origin['nativeFrame'] == 0
                            body = declared[origin['member'], 0]
                            source_data = Image.open(folder / body['data']).convert('RGBA')
                            x = (native['x'] - body['native']['x']) * density
                            y = (native['y'] - body['native']['y']) * density
                            expected = np.array(source_data.crop((x, y, x + size[0], y + size[1])))
                            expected[:, native['width'] * density:, :3] = 0
                            assert np.array_equal(b, expected), 'Idle rim paint must match the body material'
                            authored_owner = True
                        intended, excluded = intended_core(identity, a, native, density, authored_owner, paint_color)
                        intended_missing = intended & (b[..., 0] < 128)
                        fixed_masked = excluded & (b[..., 0] != 0)
                        if identity in RATIONALE and not reused:
                            assert not intended_missing.any() and not fixed_masked.any(), (identity, member['source']['member'], n)
                        slot.update(baseHash=sha(folder / record['base']), dataHash=sha(folder / record['data']),
                                    ownerPixels=int((b[..., 0] != 0).sum()), saturatedUnmaskedCore=int(missing.sum()),
                                    intendedUnmaskedCore=int(intended_missing.sum()), fixedCorePixels=int(excluded.sum()),
                                    fixedCoreMarkedOwner=int(fixed_masked.sum()),
                                    materialRationale=RATIONALE.get(identity, 'Explicit material rationale pending'),
                                    ownerCoverage='PRESERVED_ACCEPTED_8_BIT_MIX' if reused else 'BINARY_AUTHORED_MATERIAL')
                        paint += slot['ownerPixels']
                    slots.append(slot)
            for registration in receipt['registrations']:
                assert sha(registration['source']) == registration['sourceHash']
                assert registration['upsampling'] is False
                assert all(v <= 1 for v in registration['scale']) if isinstance(registration['scale'], list) else registration['scale'] <= 1
                if 'physicalSize' in registration:
                    assert all(s >= t for s, t in zip(registration['sourceSubject'], registration['physicalSize']))
            for part in receipt.get('localPartTransforms', []):
                if part.get('kind') == 'crusher-axle-spin':
                    spin, hinge, rotation = [np.array(part[k]) for k in ('spinRotation', 'hingeRotation', 'rotation')]
                    for matrix in (spin, hinge, rotation):
                        assert np.allclose(matrix.T @ matrix, np.eye(3))
                        assert np.isclose(np.linalg.det(matrix), 1)
                    assert np.allclose(hinge @ spin, rotation)
                    assert np.allclose(spin @ part['axis'], part['axis'])
                    assert np.isclose(np.linalg.norm(part['axis']), 1)
                    assert part['sphereDiameterScale'] == 1 and part['wholeBuildingScale'] == [1, 1]
                    assert sha(part['source']) == part['sourceHash'] and not part['upsampling']
                    assert part['density'] == density and max(part['sourceScale']) <= 1
                    continue
                if part.get('kind') == 'central-column-vertical-spin':
                    assert part['axis'] == [0, 1, 0] and part['wholeBuildingScale'] == [1, 1]
                    assert part['density'] == density and part['bounds'] == [150, 79, 169, 111]
                    assert np.isfinite(part['angleDegrees']) and 0 <= part['angleDegrees'] <= 360
                    assert part['exposedPixels'] + part['foregroundPixels'] == 19 * 32 * density * density
                    continue
                if part.get('kind') == 'rigid-cradle-world-pose':
                    rotation = np.array(part['rotation'])
                    assert np.allclose(rotation.T @ rotation, np.eye(3))
                    assert np.isclose(np.linalg.det(rotation), 1)
                    assert np.isclose(np.linalg.norm(part['axis']), 1)
                    assert part['sphereDiameterScale'] == 1 and part['wholeBuildingScale'] == [1, 1]
                    continue
                assert sha(part['source']) == part['sourceHash'] and not part['upsampling']
                assert part['density'] == density
                assert all(s >= t for s, t in zip(part['sourceEdges'], part['physicalEdges']))
                assert np.allclose(np.array(part['nativeTargetQuad']) * density, part['physicalTargetQuad'])
            paired[density] = [{k: s[k] for k in ('member', 'nativeFrame', 'native')} for s in slots]
            records.append({'identity': identity, 'theater': theater, 'density': density,
                'candidateHash': sha(folder / 'candidate-review.json'), 'slots': slots, 'zeroExtentSlots': zeros,
                'ownerPixels': paint, 'status': 'PASS_NATIVE_GEOMETRY_AND_DATA_CONTRACT',
                'ownerEvidence': 'CORE_SCAN_REQUIRES_MATERIAL_EXCLUSIONS_AND_NATIVE_PROOF'})
        assert paired[2] == paired[4], 'Density cannot change logical frame geometry or sequence'
report = {'status': 'PASS_NEW_EXPORT_CONTRACTS_NATIVE_GAMEPLAY_PENDING', 'families': records,
          'boundary': 'Checks every exported slot and density. Material exclusions and actual native gameplay remain separate requirements.'}
target.write_text(json.dumps(report, indent=2) + '\n')
print(report['status'], len(records), sum(len(r['slots']) for r in records), 'slots', flush=True)
