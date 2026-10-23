"""Bind complete runtime coverage, immutable additions and retained evidence."""
import csv
import json
from pathlib import Path
from production_common import ROOT, INVENTORY, sha

catalog = json.loads(Path('desktop/soviet-building-coverage.json').read_text())
packs = json.loads((ROOT / 'pack-validation-v3.json').read_text())
assert packs['status'].startswith('PASS')
matrix = json.loads((ROOT / 'native-matrix-v1/matrix.json').read_text())
functions_path = ROOT / 'native-yr-functions-v4/result.json'
functions = json.loads(functions_path.read_text())
assert functions['newBuildingFunctions']['status'].startswith('PASS')
cases = {(r['coverage']['edition'], r['coverage']['theater']): (r['coverage'], str(ROOT / 'native-matrix-v1' / r['name'] / 'result.json'))
         for r in matrix['results'] if r.get('coverage') and r['coverage'].get('status', '').startswith('PASS')}
cases['yr', 'TEMPERATE'] = (functions['buildingCoverage'], str(functions_path))
assert len(cases) == 8
lunar = functions['buildingCoverage']['lunar']
assert len(lunar['results']) == 18 and lunar['glError'] == 0
rows = []
for source in INVENTORY['matrix']:
    if source['theater'] == 'LUNAR':
        result = next(r for r in lunar['results'] if r['id'] == source['id'])
        evidence, boundary = str(functions_path), 'CONTROLLED_LUNAR_VFS_AND_GL_NOT_SKIRMISH'
        members = result['sources']
    else:
        case, evidence = cases[source['edition'], source['theater']]
        result = next(r for r in case['families'] if r['id'] == source['id'])
        members, boundary = result['members'], 'RETAIL_MAP_NATIVE_LOADER_AND_CONTROLLED_PLACEMENT'
    assert result['report']['density'] == (4 if source['id'] == 'NAPOWR' else 2)
    assert {m['member'] for m in members} == {m['source']['member'] for m in source['members']}
    rows.append({'edition': source['edition'], 'theater': source['theater'], 'identity': source['id'],
                 'status': 'HD_ACTIVE_COMPLETE_FAMILY', 'density': result['report']['density'],
                 'gpu_bytes': result['report']['gpuBytes'], 'fallback_reason': '', 'boundary': boundary,
                 'members': ';'.join(m['source']['member'] for m in source['members']),
                 'source_hashes': ';'.join(m['source']['sha256'] for m in source['members']),
                 'evidence': evidence, 'evidence_sha256': sha(evidence), 'new_visual_acceptance': 'PENDING'})
assert len(rows) == 162
with Path('docs/m1-6c-coverage-matrix.csv').open('w', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n"); writer.writeheader(); writer.writerows(rows)
files = set()
for entry in catalog.values():
    family_path = Path('.local') / entry['familyPath']
    files.add(family_path)
    family = json.loads(family_path.read_text())
    for binding in family['members']:
        directory = Path('.local/hd-packs') / binding['packId'] / binding['revision']
        if not binding['packId'].startswith('soviet-coverage-'):
            continue
        files.update(p for p in directory.iterdir() if p.is_file())
resources = {'schema': 'm1-6c-selected-additions-v1', 'status': 'FINAL_VISUAL_GAMEPLAY_ACCEPTANCE_PENDING',
             'families': catalog, 'files': [{'path': str(p).removeprefix('.local/'), 'bytes': p.stat().st_size, 'sha256': sha(p)} for p in sorted(files)]}
Path('docs/m1-6c-added-resources.json').write_text(json.dumps(resources, indent=2) + '\n')
protected = json.loads(Path('docs/m1-6c-representative-evidence.json').read_text())['immutableArtifacts']
for item in protected:
    assert sha(item['path']) == item['sha256'], item['path']
units = json.loads(Path('docs/m1-7-accepted-resources.json').read_text())['files']
for item in units:
    assert sha(Path('.local') / item['path']) == item['sha256'], item['path']
report = {'status': 'PASS_162_RUNTIME_BUILDING_CELLS_FINAL_HUMAN_ACCEPTANCE_PENDING',
          'currentMainIntegratedBaseline': '477341f', 'editions': {'ra2': 18, 'yr': 18}, 'union': 20,
          'runtimeCells': 162, 'buildingOriginalExceptions': [], 'unitExceptionsUnchanged': ['SQD', 'YURIPR'],
          'retainedRepresentativeFiles': len(protected), 'retainedUnitResourceFiles': len(units),
          'newSelectedFiles': len(files), 'newFamilySelections': len(catalog),
          'packValidation': str(ROOT / 'pack-validation-v3.json'),
          'lifecycle': str(ROOT / 'native-lifecycle-v1/result.json'),
          'display': str(ROOT / 'native-yr-snow-display-v2/result.json'),
          'sustained': str(ROOT / 'native-sustained-v1/result.json'),
          'civilian': str(ROOT / 'native-civilian-default-v1/result.json'),
          'review': str(ROOT / 'full-review-v2/Soviet-Buildings-Complete-Review.html'),
          'familyLedger': [{'identity': id, 'cells': sum(r['identity'] == id for r in rows), 'runtime': 'HD_ACTIVE_COMPLETE_FAMILY',
                            'finalVisualAcceptance': 'PENDING_NEW_SCOPE'} for id in INVENTORY['union']],
          'failures': [
              {'family': 'NAINDP', 'revision': 'exports-v2', 'failure': 'Independent image strips produced floating architecture', 'resolution': 'exports-v3 fixed-size assembly under fixed ground occlusion'},
              {'family': 'NATECH', 'revision': 'snow-v1', 'failure': 'Native snow canvas is larger', 'resolution': 'Center-preserving 19x5 logical offset, no scale change'},
              {'family': 'NAPOWR', 'revision': 'variant-pack-1', 'failure': 'Unused data alpha outside reused canvas was zero', 'resolution': 'Member revision 2 normalizes unused data alpha'},
              {'family': 'NACNST', 'revision': 'snow-pack-1', 'failure': 'Empty frame bitmap placeholder was used as logical dimensions', 'resolution': 'Member revision 2 retains native zero-size logical rectangles'},
              {'family': 'TESLA', 'revision': 'runtime-v2', 'failure': 'Rules identity was used instead of NATSLA image identity', 'resolution': 'Pinned source catalog uses native Image name'},
              {'family': 'NABNKR', 'revision': 'runtime-v3', 'failure': 'Evacuation made a built military bunker neutral', 'resolution': 'Runtime v4 retains buildable-defense ownership; native enter/fire/exit/destroy and civilian regressions pass'},
              {'family': 'NAMISL', 'revision': 'offline-review-v1', 'failure': 'Offline resting preview omitted the first SUPER layer', 'resolution': 'Review v2 includes the native superweapon idle layer'},
              {'family': 'TEST_HARNESS', 'failure': 'Naval-only snow map selected in standard mode; ZEP incorrectly treated as AircraftTypes; guard fixture ran after attacks were disabled', 'resolution': 'Correct standard snow map and VehicleTypes identity; guard regression runs in separate packaged matches'},
              {'family': 'PACKAGE_PROFILE', 'revision': 'delivery-v1', 'failure': 'New M1.6C metadata fell through to legacy app profile identity; isolated packaged test rejected it before gameplay', 'resolution': 'Dedicated M1.6C profile and companion-resource discovery in runtime-final-v2; retained failed delivery and test receipt'},
              {'family': 'DISPLAY_HARNESS', 'failure': 'macOS constrained requested 1080-high content window to 927 pixels', 'resolution': '960x540 native window produces exact 1920x1080 and 3840x2160 buffers; 1440x900 validates 16:10'}]}
for field in ['lifecycle', 'display', 'civilian']:
    assert json.loads(Path(report[field]).read_text())['status'].startswith('PASS')
assert json.loads(Path(report['sustained']).read_text())['sustained']['status'].startswith('PASS')
Path('docs/m1-6c-final-evidence.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['runtimeCells', 'newSelectedFiles', 'retainedRepresentativeFiles', 'retainedUnitResourceFiles']}))
