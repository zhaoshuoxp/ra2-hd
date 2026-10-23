"""Record produced identities and additive transfer closure without changing frozen inputs."""
import argparse
import hashlib
import json
import stat
from collections import Counter
from pathlib import Path

root = Path.cwd()
base = root / '.artifacts/m2-2'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--yr', required=True)
parser.add_argument('--ra2', required=True)
args = parser.parse_args()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
ledger_file = root / 'docs/m2-2-map-coverage.json'
ledger = json.loads(ledger_file.read_text())
contract = json.loads((root / 'desktop/environment-hd-contract.json').read_text())
terrain_pointer = json.loads((root / '.local/terrain-selection.json').read_text())
terrain_root = root / '.local/terrain-packs' / terrain_pointer['revision']
environment_root = root / '.local/environment-packs' / contract['selectedPack']['revision']
terrain = json.loads((terrain_root / 'manifest.json').read_text())
terrain_members = {member['member']: group['id'] for group in terrain['groups'] for member in group['members']}
runtime = {}
runtime_exceptions = []
for edition, directory in [('yr', args.yr), ('ra2', args.ra2)]:
    file = base / directory / 'report.json'
    if file.exists():
        report = json.loads(file.read_text())
        if report['status'].startswith('PASS'):
            runtime[edition] = {name: [row for row in report['placed'] if row['name'] == name]
                                for name in {row['name'] for row in report['placed']}}
            placeholders = [row for row in report['placed']
                            if row.get('nativeException') == 'INVISIBLE_NATIVE_BRIDGE_PLACEHOLDER']
            if placeholders:
                runtime_exceptions.append(dict(edition=edition, identity='LOBRDG27', instances=len(placeholders),
                    status='INVISIBLE_NATIVE_BRIDGE_PLACEHOLDER',
                    reason='Native OverlayDrawable suppresses invisible bridge placeholders; visible bridge members retain complete HD families.',
                    evidence=str(file.relative_to(root))))
rows = []
for row in ledger['rows']:
    if row['decision'] != 'MISSING_HD_TO_PRODUCE':
        continue
    member, edition, identity = row['source']['member'], row['edition'], row['id']
    if row['kind'] == 'tmp':
        production = dict(status='EXPORTED_NATIVE_CLOSURE_2X_4X', group=terrain_members[member])
    elif row['kind'] == 'vehicle':
        assert identity in contract['vxl'] or identity == 'TRUCKA'
        production = dict(status='ACCEPTED_SOURCE_IDENTICAL_REUSE' if identity == 'TRUCKA' else 'EXPORTED_NATIVE_CLOSURE_2X_4X',
                          identity='DTRUCK' if identity == 'TRUCKA' else identity)
    elif identity in contract['identities'].get(edition, {}):
        production = dict(status='EXPORTED_NATIVE_CLOSURE_2X_4X', family=contract['identities'][edition][identity],
                          canonicalMember=contract['aliases'].get(member, member))
    else:
        assert not any(usage.get('count') for name, usage in row['usage'].items() if name in ['XMP03T4.map', 'MP03T4.map'])
        production = dict(status='UNUSED_NATIVE_RANGE_MEMBER', reason='Zero placements and not reachable through native ore/bridge growth on the selected map.')
    placed = runtime.get(edition, {}).get(identity, [])
    if placed:
        assert all(object.get('hd') or object.get('vxlHd') for object in placed), identity
    rows.append(dict(edition=edition, kind=row['kind'], id=identity, source=member, sourceSha256=row['source']['sha256'],
        production=production, applicableNativeStates=row.get('states', []), placedInstancesVerified=len(placed),
        runtimeStatus='PASS_ACTUAL_PLACED_BINDING' if placed else 'EXPORTED_STATE_DEPENDENCY_OR_NOT_IN_OBJECT_LIST',
        stateValidation='Complete exported native slots plus representative category native orders; no every-object/action claim.'))
resolution = dict(schema='m2-2-production-state-resolution-v1', frozenInventorySha256=sha(ledger_file),
    selections=dict(terrain=terrain_pointer, environment=contract['selectedPack']),
    runtimeEvidence=dict(yr=args.yr, ra2=args.ra2),
    nativeRuntimeExceptions=runtime_exceptions,
    rows=rows, counts=dict(Counter(row['production']['status'] for row in rows)),
    status='PRODUCED_IDENTITIES_NATIVE_SELECTED_CASES_RECORDED_USER_ACCEPTANCE_PENDING',
    boundary='The frozen inventory is unchanged. Original 375 identity count and 750 edition rows are distinct. Unused zero-placement range members are not claimed as visible HD production.')
(root / 'docs/m2-2-production-state-resolution.json').write_text(json.dumps(resolution, indent=2) + '\n')

def entries(paths):
    result = []
    for file in sorted({file for path in paths for file in ([path] if path.is_file() else path.rglob('*')) if file.is_file()}):
        assert not file.is_symlink(), file
        result.append(dict(path=str(file.relative_to(root)), sha256=sha(file), bytes=file.stat().st_size,
                           mode=oct(stat.S_IMODE(file.stat().st_mode))))
    return result

runtime_paths = [root / '.local/terrain-selection.json', root / '.local/environment-selection.json',
    terrain_root, environment_root]
runtime_paths += [root / '.local' / Path(variant['path']).parent for family in contract['vxl'].values() for variant in family['variants']]
authoring_paths = [path for path in base.iterdir() if path.is_dir() and (path.name.startswith(('authoring-', 'direction-references-', 'prepared-native-'))
    or path.name in ['source-v5', 'rubble-native-guides-v3', 'vxl-native-reference-v2'])]
authoring_paths += [base / 'registration-correction-v1']
authoring_paths += [path for path in base.iterdir() if path.is_file() and path.suffix in ['.json', '.log']
    and not path.name.startswith('complete-state-transfer')]
transfer = dict(schema='m2-2-resource-transfer-v2', status='PINNED_FULL_PRODUCTION_MAIN_PROMOTION_PENDING_ACCEPTANCE',
    policy='ADD_IF_ABSENT_OR_IDENTICAL', sourceRoot=str(root), baseline=ledger['baseline'],
    selectedTerrain=json.loads((root / '.local/terrain-selection.json').read_text()), selectedEnvironment=contract['selectedPack'],
    runtimeFiles=entries(runtime_paths), authoringFiles=entries(authoring_paths),
    selectorPolicy='Reconcile main selectors only after the authorized acceptance gate; retain its world/UI/prepared identities.',
    boundary='Only selected runtime closure is packaged. Guides, masters and failed evidence remain separate authoring inputs.')
(root / 'docs/m2-2-resource-transfer.json').write_text(json.dumps(transfer, indent=2) + '\n')
print(json.dumps(dict(resolution=resolution['counts'], runtimeFiles=len(transfer['runtimeFiles']),
    authoringFiles=len(transfer['authoringFiles']), runtimeBytes=sum(row['bytes'] for row in transfer['runtimeFiles']))))
