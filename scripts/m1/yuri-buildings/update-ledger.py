"""Refresh one compact resumable production ledger from actual task artifacts."""
import json
from pathlib import Path
from production_common import ROOT, INVENTORY, sha

catalog = json.loads(Path('desktop/yuri-building-coverage.json').read_text())
previous_path = ROOT / 'production-ledger.json'
previous = json.loads(previous_path.read_text()) if previous_path.exists() else {}
selected_exports = {'GAFWLL': 'full-exports-v2', 'NAPSIS': 'full-exports-v36', 'NACLON': 'reuse-exports-v2',
                    'YAPOWR': 'full-exports-v14', 'YAGGUN': 'full-exports-v13', 'YAREFN': 'full-exports-v17',
                    'YABRCK': 'full-exports-v22', 'YACNST': 'full-exports-v27',
                    'YAPSYT': 'full-exports-v28', 'NATBNK': 'full-exports-v31', 'YAGRND': 'full-exports-v34',
                    'YATECH': 'full-exports-v37', 'YAGNTC': 'full-exports-v38',
                    'YAPPET': 'full-exports-v40', 'YAWEAP': 'full-exports-v43', 'YAYARD': 'full-exports-v42'}
exceptions = {
    'YADEPT': ['Native TechLevel 15 is unavailable under normal skirmish limit 10; original denominator retained'],
    'NAPSIS': ['Accepted operating pixels and weighted mask retained; complete YR hinged-panel construction selected; native states/remap pending'],
    'NACLON': ['Selected complete same-density accepted reuse; extra indexed native shadow-control tail retained; native visual check pending'],
    'YAPOWR': ['Selected v14 fixes local assembly and fixed-material owner-mask leaks; native gameplay and final acceptance pending'],
    'YAGGUN': ['Selected v13 projects complete barrels directly from the raw master; native stages, component sockets and final acceptance pending'],
    'GAFWLL': ['Complete published resource candidate; native gameplay and final user acceptance pending'],
    'YAREFN': ['Selected v17 uses five compact yaw keys, local outriggers/conveyor and four fixed tube collars; native deployment/socket/owner proof pending'],
    'YABRCK': ['v22 uses complete head/base/hose/antenna modules and native early-pallet occlusion; native actions/owner and final acceptance pending'],
    'YACNST': ['v27 separates fixed body, active fork and native-joint production crane; complete MCV/floor/local deployment; native assembly, production socket, owner and final acceptance pending'],
    'YAPSYT': ['v28 uses complete orbiting electrodes and a local projected fork; extra snow damaged-pose source slots retain their independent contract; native spin, control/power/owner and final acceptance pending'],
    'NATBNK': ['v31 preserves three source groups, native empty bodies and centered snow/New Urban members; fixed bib and front/rear guards; native occupant occlusion/owner and final acceptance pending'],
}
families = []
for identity in sorted({r['id'] for r in INVENTORY['matrix']}):
    rows = [r for r in INVENTORY['matrix'] if r['id'] == identity]
    receipts = sorted(str(p.relative_to(ROOT)) for p in (ROOT / 'production-art-v1' / identity).glob('*receipt.json'))
    bindings = {key: {'path': value['familyPath'], 'hash': value['familyHash'], 'densities': value['densities']}
                for key, value in catalog.items() if value['family'] == identity}
    exports = {}
    for theater in ('TEMPERATE', 'SNOW', 'NEWURBAN'):
        for density in (2, 4):
            if identity not in selected_exports:
                continue
            folder = ROOT / selected_exports[identity] / f'{identity}-{theater}-{density}x'
            receipt = folder / 'candidate-review.json'
            if receipt.exists():
                data = json.loads(receipt.read_text())
                exports[f'{theater}-{density}x'] = {'path': str(receipt.relative_to(ROOT)), 'hash': sha(receipt),
                    'slots': len(data['frames']), 'status': data['status'], 'visualAccepted': False}
    old = next((f for f in previous.get('families', []) if f['identity'] == identity), {})
    families.append({'identity': identity, 'applicable': identity != 'YADEPT',
        'sourceInventory': 'source-v1/inventory.json', 'sourceCells': len(rows),
        'members': {r['theater']: [{'member': m['source']['member'], 'hash': m['source']['sha256'],
            'visibleFrames': m['visibleFrames'], 'canvas': m['canvas'], 'offset': m['aggregateOffset'], 'roles': m['roles']}
            for m in r['members']] for r in rows},
        'representativeApproval': 'REUSED_ACCEPTED' if identity in ('NAPSIS', 'NACLON') else 'EXCLUDED_NATIVE' if identity == 'YADEPT' else 'APPROVED_BATCH_DIRECTION',
        'provenanceReceipts': receipts, 'candidateExports': exports, 'selectedManifests': bindings,
        'complete2x': bool(bindings), 'complete4x': bool(bindings),
        'completionBoundary': 'Complete resource slots are distinct from native/visual acceptance',
        'nativeEvidence': old.get('nativeEvidence', []), 'finalVisualAcceptance': 'PENDING',
        'blockers': exceptions.get(identity, ['Complete published 2x/4x state candidates; grouped native actions, owner proof and final acceptance pending'])})
ledger = {'schemaVersion': 1, 'status': 'APPROVED_PRODUCTION_IN_PROGRESS', 'initialHead': '3e251383f7f59d2d0525e4c25987fb83f6715f82',
    'rulesIdentities': 17, 'applicableIdentities': 16, 'sourceCells': 102, 'applicableCells': 96,
    'representativeApproval': 'representative-acceptance-v1.json', 'sourceAudit': 'source-audit-v1.json',
    'families': families, 'runtimeCompleteFamilies': sum(bool(f['nativeEvidence']) for f in families),
    'resourceCandidateFamilies': len({v['family'] for v in catalog.values()}),
    'mapFix': {'commit': 'ee35fcf', 'detailed': '../map-selection-layout/final-package-yr-v5/report.json',
               'secondEdition': '../map-selection-layout/final-package-ra2-v3/report.json'},
    'failedAttempts': ['yuri-contract-tests-yr-v1.log: test counted original shadow slots as HD-visible slots; fixed test source slicing',
        'typecheck-wall-v2.log: incorrect script name; typecheck:entry succeeds in v3',
        'yuri-contract-tests-yr-v3.log: default 5-second timeout killed PNG decoder; bounded larger timeout required for actual-page checks',
        'Bio Reactor v11 fixed-material owner leak corrected in v14; Gatling disconnected muzzle fragments corrected in v13',
        'registration-contracts-v1.log: test assumed shared turret routes disappear; v2 correctly retains validated intact snow-peer routes while withholding failed family SHP routes',
        'Barracks v18 passes slot/data contracts but fails mechanical visual review; complete authored local hidden-surface parts replace that unselected attempt',
        'Construction Yard v23-v25 exposed partial garage cuts and assigned its active member to windows; v27 separates complete local garage/machinery and correct active-fork ownership',
        'Psychic Tower snow has an extra colored damaged-pose group outside normal/damaged loops; compare it to matching dry damaged geometry, not the dry shadow tail',
        'Tank Bunker damaged guard generation differs by one canvas pixel per axis; inherit original top-left coordinates without recropping or realigning',
        'Tank Bunker v29 wheel-strip rectangle also copied a clipped hazard-ring fragment; v30 isolates complete local metal strips',
        'Grinder flat/misaligned pools and c2-c7 failed measured page/family limits; c8 lossless color plus categorical remap pooling passes both native-density contracts under unchanged caps',
        'Sensor accepted weighted coverage must remain unchanged rather than be rewritten to match a new binary-core intent; all new construction masks remain binary',
        'Battle Lab early parts incorrectly transferred the fixed silver pipe; final v37 uses native-owned short rear fork and separate dark crescent',
        'Dominator ACTIVE has fewer than 64 sparse neutral control pixels, not an empty indexed tail; full chamber/detail remains photographically authored in SUPER members',
        'Factory snow contains additional colored damaged poses and separate indexed tails; v43 preserves those contracts and reuses corresponding normal snow deposit support',
        'Dominator first audit ran before final snow receipt finished; v2 audit covers all complete exports',
        'reuse audit originally required binary R; accepted same-density fractional R edge coverage is retained, categorical G unchanged']}
consolidated_path = ROOT / 'consolidated-native-v1.json'
if consolidated_path.exists():
    native = json.loads(consolidated_path.read_text())
    assert native['status'] == 'PASS_INCREMENTAL_NATIVE_BATCH'
    for family in families:
        if family['applicable']:
            assert family['identity'] in native['families']
            assert all(b['densities'] == [2, 4] for b in family['selectedManifests'].values())
            family['nativeEvidence'] = [r['report'] for r in native['primaryRuns']] + [
                native['destruction'], 'native-snow-4x-v2/report.json']
            family['nativeStatus'] = 'PASS_INCREMENTAL_NATIVE_CASES'
            family['completionBoundary'] = 'Complete independent 2X/4X resources and native evidence; final visual acceptance pending'
            family['blockers'] = ['Final consolidated user visual acceptance pending']
        else:
            family['nativeStatus'] = 'EXCLUDED_NATIVE_TECH_LEVEL'
    ledger['status'] = 'TECHNICAL_REVIEW_READY_FINAL_VISUAL_ACCEPTANCE_PENDING'
    ledger['runtimeCompleteFamilies'] = len(native['families'])
    ledger['consolidatedNativeEvidence'] = 'consolidated-native-v1.json'
    ledger['mapFix']['finalCombinedApp'] = '../map-selection-layout/final-c-app-v1/report.json'
    ledger['failedAttempts'] += [
        'build-v1 omitted map.png in the packaged page reader: seven requested 4X families explicitly fell back to 2X; corrected build-v2 and final package-v3 show all sixteen at true requested density',
        'package-v1 deduplicated routes without copying every family-relative turret file; package-v3 copies all dependency paths independently',
        'Early native BOOM/queue, Dominator victim, eager-peer and Sensor cloak/shore/shroud assumptions failed; immutable reports are resolved by targeted native follow-ups',
        'native-snow-4x-v1 has snow=false and is supplemental temperate evidence; actual snow primary is v2',
        'native-lifecycle-v1 used nonexistent gameMenu; v2 uses the actual menu/options UI and passes teardown, whole-family fallback, recovery and relaunch',
        'native-destruction-v1/v2 incorrectly expected HealthTrait damage notifications alone to destroy a building; native warhead path v3 verifies all sixteen destruction events and selection cleanup']
previous_path.write_text(json.dumps(ledger, indent=2) + '\n')
print(ledger['status'], ledger['resourceCandidateFamilies'], 'resource candidates;', ledger['runtimeCompleteFamilies'], 'native-complete families')
