"""Verify completed native cases before resuming a pinned all-map road matrix."""
import argparse
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('plan', type=Path)
parser.add_argument('density', type=int, choices=[2, 4])
parser.add_argument('matrices', type=Path, nargs='+')
args = parser.parse_args()
sha = lambda data: hashlib.sha256(data).hexdigest()
read = lambda file: json.loads(file.read_text())
assert args.output.resolve().is_relative_to(ROOT / '.artifacts/yr-campaign') and not args.output.exists()
plan = read(args.plan)
expected = {}
for entry in plan['plans']:
    receipt = read(Path(entry['file']))
    for mission in receipt['missions']:
        expected[(entry['edition'], mission)] = receipt
verified, sources, excluded = {}, [], []
for matrix_file in args.matrices:
    matrix_bytes = matrix_file.read_bytes()
    matrix = json.loads(matrix_bytes)
    assert matrix['density'] == args.density
    sources.append(dict(file=str(matrix_file.resolve()), sha256=sha(matrix_bytes),
        status=matrix['status'], completedCases=len(matrix['maps'])))
    for case in matrix['maps']:
        key = (case['edition'], case['mission'])
        if key not in expected or not (case.get('status') or '').startswith('PASS_NATIVE_ORIGINAL_TMP'):
            continue
        file = Path(case['report'])
        raw = file.read_bytes()
        assert sha(raw) == case['reportSha256'], f'Completed native report changed: {file}'
        native = json.loads(raw)
        assert native['status'] == 'PASS_NATIVE_ORIGINAL_TMP_PLACEMENTS_HD_MESH_DENSITY_FROZEN_WORLD_AND_SCENE_RELEASE'
        assert native['density'] == case['density'] == args.density
        assert native['edition'] == case['edition'] and native['mission'] == case['mission']
        assert not native['errors'] and not native['failedResources'] and not native.get('consoleErrors')
        assert native['before'] == native['after']
        for released in native['release'].values():
            assert released['disposed'] and all(released[k] == 0 for k in ['gpuBytes', 'retainedCpuBytes', 'worldChargeBytes'])
        target = expected[key]
        closure = target['mapClosures'][case['mission']]
        earlier = read(Path(native['receipt']))['mapClosures'][case['mission']]
        assert earlier['sourceSha256'] == closure['sourceSha256']
        assert earlier['sourceCells'] == closure['sourceCells']
        assert native['sourceCells']['checked'] == len(closure['sourceCells'])
        groups = native['terrain']['groups']
        current_art = len(groups) == len(closure['groups']) and all(
            group['sha256'] == target['variants'].get(group['id'], {}).get(str(args.density)) for group in groups)
        if not current_art:
            excluded.append(dict(edition=key[0], mission=key[1], report=str(file), reason='SELECTED_ATLAS_CHANGED'))
            continue
        assert len(native['terrain']['bindings']) == closure['subtiles']
        assert native['terrain']['allocation'] <= native['terrain']['budget']
        for group in groups:
            assert group['status'] == 'PUBLISHED' and group['density'] == args.density
        for binding in native['terrain']['bindings']:
            assert binding['actualHdTerrainMesh'] and binding['density'] == args.density
            assert binding['sample'] == [size * args.density for size in binding['logical']]
        for capture in native['captures']:
            image = file.parent / capture['file']
            pixels = image.read_bytes()
            assert pixels[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', pixels[16:24]) == (900, 600)
            assert capture['glError'] == 0 and not capture['scenePreparing']
        verified[key] = {**case, 'verifiedForResumeFrom': str(matrix_file.resolve()), 'reportSha256': sha(raw)}
missing = [dict(edition=edition, mission=mission) for edition, mission in expected if (edition, mission) not in verified]
report = dict(schema='verified-native-road-matrix-resume-v1', status='VERIFIED_COMPLETED_NATIVE_CASES_FOR_RESUME',
    density=args.density, planFile=str(args.plan.resolve()), planSha256=sha(args.plan.read_bytes()),
    plannedMaps=len(expected), maps=list(verified.values()), missing=missing, sources=sources,
    invalidatedPriorCases=excluded, sourceBoundaries=plan.get('sourceBoundaries', []),
    sourceMapsModified=False, selectorsModified=False,
    scope='Only independently passing child cases with matching original source cells, selected atlases, native mesh density, frozen world, zero-charge release and actual unscaled PNG captures are reused. Interrupted parent matrices remain explicitly identified; unfinished and failing cases receive no pass credit.')
args.output.mkdir()
(args.output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(status=report['status'], verified=len(verified), planned=len(expected), missing=missing)))
