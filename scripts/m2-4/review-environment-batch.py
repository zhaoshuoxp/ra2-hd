"""Collect matched native scenes, object actions and source comparisons as exact PNGs."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--case', nargs=4, action='append', required=True,
                    metavar=('NAME', 'ORIGINAL', 'HD2', 'HD4'))
parser.add_argument('--supplemental', nargs=2, action='append', default=[],
                    metavar=('NAME', 'HD2'))
parser.add_argument('--comparisons', type=Path, nargs=2, required=True)
parser.add_argument('--additional-comparisons', type=Path, nargs=2, action='append', default=[],
                    help='Additional exact-density frame boards, paired in 2X/4X order')
parser.add_argument('--technology-service-reports', type=Path, nargs=2,
                    help='Independent native vehicle-service reports, paired in 2X/4X order')
parser.add_argument('--title', required=True)
parser.add_argument('--summary', required=True)
parser.add_argument('--theater', choices=['SNOW', 'URBAN', 'NEWURBAN', 'DESERT'], default='SNOW')
parser.add_argument('--representative-direction', action='store_true')
parser.add_argument('--visual-feedback-repair', action='store_true')
parser.add_argument('--scene-from-wall-normal', action='store_true',
                    help='Use the original placed wall before damage for matching Original scenes')
parser.add_argument('--single-density-building-states', action='store_true',
                    help='Include bounded 2X building-state fixtures while reusing accepted art state evidence')
parser.add_argument('--building-states', action='store_true',
                    help='Include complete paired native building-state captures at both densities')
parser.add_argument('--building-state-kinds', nargs='+', choices=['normal', 'occupied', 'damaged', 'rubble'],
                    help='Show only changed building art states; retain complete technical state reports')
parser.add_argument('--building-state-names', nargs='+',
                    help='Show selected identities once when multiple native families share identical changed art')
parser.add_argument('--omit-technology-state-images', action='store_true',
                    help='Retain technology-action reports without repeating accepted body and animation images')
parser.add_argument('--scoped-closure', type=Path, action='append', default=[],
                    help='Explicit bridge suite and separate lifecycle closure for an immutable failed overall report')
parser.add_argument('--building-state-closure', type=Path, action='append', default=[],
                    help='Reuse a hash-pinned completed body suite from an immutable failed diagnostic')
parser.add_argument('--building-subset-closure', type=Path, action='append', default=[],
                    help='Reuse explicitly completed named state cases before a later failed fixture')
parser.add_argument('--building-recapture-closure', type=Path, action='append', default=[],
                    help='Replace only named clipped captures with hash-pinned native recaptures')
parser.add_argument('--gate-reports', type=Path, nargs=3,
                    help='Complete native gate phase reports, in Original/2X/4X order')
parser.add_argument('--neutral-vehicle-reports', type=Path, nargs=3,
                    help='Actual original-placement voxel bearings, in Original/2X/4X order')
args = parser.parse_args()
assert not args.building_state_kinds or args.building_states or args.single_density_building_states
assert not args.building_state_names or args.building_states or args.single_density_building_states
args.output.mkdir(exist_ok=False)
media = args.output / 'media'
media.mkdir()
files, scenes, states, comparisons, evidence = [], [], [], [], []
reviewed_building_names = set()
scoped_reports = {}
for path in args.scoped_closure:
    closure = json.loads(path.read_text())
    assert closure['status'] == 'PASS_NATIVE_BRIDGE_AND_SEPARATE_LIFECYCLE_CHECK'
    source = Path(closure['bridgeReport']).resolve()
    assert sha(source) == closure['bridgeReportSha256']
    report = json.loads(source.read_text())
    assert report['status'] == 'FAIL' and not report['errors'] and report['graphics']['glError'] == 0
    assert report['newNativeBridge']['status'] == closure['bridgeAssertion'] == \
        'PASS_NATIVE_LOW_WOOD_BRIDGE_PASSAGE_DAMAGE_DEMOLITION_REPAIR'
    assert '1 !== 4' in report['failure'] and report['environment']['density'] == 4
    assert report['combinedWorldAllocation']['total'] <= report['combinedWorldAllocation']['limit']
    lifecycle_file = Path(closure['lifecycleReport'])
    assert sha(lifecycle_file) == closure['lifecycleReportSha256']
    lifecycle = json.loads(lifecycle_file.read_text())
    assert lifecycle['status'] == 'PASS_SELECTED_NATIVE_CASES' and not lifecycle['errors']
    assert lifecycle['lifecycleStatus'] == 'PASS_SNOW_4X_ORIGINAL_REENTRY_TEMP_4X_RELEASE'
    scoped_reports[source] = path
    evidence.append(dict(path=str(path.resolve()), sha256=sha(path)))


def copy_image(source, name):
    target = media / name
    assert not target.exists()
    shutil.copyfile(source, target)
    assert sha(source) == sha(target)
    files.append(dict(file='media/' + name, source=str(source.resolve()), sha256=sha(target),
                      size=list(Image.open(target).size), rescaled=False))
    return 'media/' + name


def collect_actions(report, root, name, density, actions):
    for cycle in report.get('linkedBuildingCycles', []):
        assert cycle['status'] == 'PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN'
        for capture in cycle['captures']:
            assert capture['rescaled'] is False
            images = actions.setdefault((cycle['name'], f'linked flag phase {capture["phase"]}'), {})
            images[f'{density}X'] = copy_image(root / capture['file'], f'{name}-{density}X-{capture["file"]}')
    technology = report.get('newNativeTechnology')
    if technology:
        assert technology['status'] == 'PASS_ORIGINAL_PLACEMENTS_NATIVE_CAPTURE_REPAIR_AND_OWNED_ANIMATION'
        for row in ([] if args.omit_technology_state_images else technology['cases']):
            for key in ['neutralCapture', 'capturedCapture', 'damagedCapture', 'repairedCapture']:
                capture = row[key]
                assert capture['rescaled'] is False
                images = actions.setdefault((row['name'], 'technology ' + key.removesuffix('Capture')), {})
                images[f'{density}X'] = copy_image(root / capture['file'], f'{name}-{density}X-{capture["file"]}')
    walls = report.get('newNativeWalls')
    if walls:
        assert walls['status'] == 'PASS_NATIVE_WALL_DAMAGE_REMOVAL_ADJACENT_REBINDING'
        for key in ['beforeCapture', 'damagedCapture', 'removedCapture']:
            capture = walls[key]
            assert capture['rescaled'] is False
            images = actions.setdefault((walls['name'], key.removesuffix('Capture')), {})
            images[f'{density}X'] = copy_image(root / capture['file'], f'{name}-{density}X-{capture["file"]}')
    for bridge in report.get('nativeBridges', report.get('snowNativeBridges', [])):
        assert bridge['status'].startswith('PASS_NATIVE_')
        stages = ['standing', 'native-passage', 'damaged', 'demolished', 'repaired']
        if bridge.get('originalInitial'):
            stages.insert(0, 'original-initial')
        for stage in stages:
            file = f'{bridge["kind"]}-bridge-{stage}-framebuffer.png'
            images = actions.setdefault((bridge['kind'], stage), {})
            images[f'{density}X'] = copy_image(root / file, f'{name}-{density}X-{file}')
    for key, kind in [('urbanNativeTrees', 'TREE'), ('urbanNativeProps', 'PROP')]:
        terrain_objects = report.get(key)
        if not terrain_objects:
            continue
        assert terrain_objects['status'] == f'PASS_ORIGINAL_{kind}_BINDINGS_AND_REPRESENTATIVE_NATIVE_WARHEAD_DAMAGE_REMOVAL'
        for action in terrain_objects['actions']:
            for phase in ['normal', 'damaged', 'removed']:
                capture = action[phase + 'Capture']
                assert capture['rescaled'] is False
                images = actions.setdefault((action['name'], 'native ' + kind.lower() + ' ' + phase), {})
                images[f'{density}X'] = copy_image(root / capture['file'], f'{name}-{density}X-{capture["file"]}')
    overlays = report.get('newNativeOverlayObjects')
    if overlays:
        expected_rocks = 5 if report.get('theater') == 'URBAN' else 10
        assert overlays['status'] == f'PASS_ALL_{expected_rocks}_PLACED_ROCKS_AND_NATIVE_LAND_WATER_CRATE_PICKUP'
        assert len(overlays['rocks']) == expected_rocks and len(overlays['crates']) == 2
        for row in overlays['rocks']:
            capture = row['capture']
            assert capture['rescaled'] is False
            images = actions.setdefault((row['name'], 'original map placement'), {})
            images[f'{density}X'] = copy_image(root / capture['file'], f'{name}-{density}X-{capture["file"]}')
        for row in overlays['crates']:
            for key in ['beforeCapture', 'afterCapture']:
                capture = row[key]
                assert capture['rescaled'] is False
                images = actions.setdefault((row['name'], key.removesuffix('Capture')), {})
                images[f'{density}X'] = copy_image(root / capture['file'], f'{name}-{density}X-{capture["file"]}')
    decals = report.get('newNativeDecals')
    if decals:
        assert decals['status'] == 'PASS_ALL_24_NATIVE_DECAL_BINDINGS_AND_UNSCALED_CAPTURES'
        assert len(decals['cases']) == 24
        for sample in decals['cases']:
            file = f'{sample["name"]}-native-detail.png'
            assert list(Image.open(root / file).size) == sample['sourceRect'][2:]
            assert all(sample['sourceRect'][i] >= 0 for i in (0, 1))
            images = actions.setdefault((sample['name'], 'native decal creation'), {})
            images[f'{density}X'] = copy_image(root / file, f'{name}-{density}X-{file}')
    resources = report.get('newNativeResources')
    if resources:
        assert resources['status'] == 'PASS_NATIVE_ORE_GEM_GATHER_DEPLETION_AND_CREATED_ORE_HD'
        for item in resources['harvest']:
            for key in ['beforeCapture', 'gatheringCapture', 'depletedCapture']:
                capture = item[key]
                assert capture['rescaled'] is False
                images = actions.setdefault((item['kind'], key.removesuffix('Capture')), {})
                images[f'{density}X'] = copy_image(root / capture['file'], f'{name}-{density}X-{capture["file"]}')
        capture = resources['growthCapture']
        assert capture['rescaled'] is False
        images = actions.setdefault(('ore', 'native creation'), {})
        images[f'{density}X'] = copy_image(root / capture['file'], f'{name}-{density}X-{capture["file"]}')
    native = report.get('newNativeStates')
    if native:
        assert native['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
        if args.single_density_building_states or args.building_states:
            for building in native['buildings']:
                if args.building_state_names and building['normal']['name'] not in args.building_state_names:
                    continue
                for key, capture in building.items():
                    if not key.endswith('Capture') or not isinstance(capture, dict):
                        continue
                    if args.building_state_kinds and key.removesuffix('Capture') not in args.building_state_kinds:
                        continue
                    assert capture['rescaled'] is False
                    reviewed_building_names.add((building['normal']['name'], density))
                    images = actions.setdefault((building['normal']['name'], 'building ' + key.removesuffix('Capture')), {})
                    images[f'{density}X'] = copy_image(root / capture['file'], f'{name}-{density}X-{capture["file"]}')
        for actor in native['actors']:
            for key, capture in actor.items():
                if not key.endswith('Capture') or not isinstance(capture, dict):
                    continue
                assert capture['rescaled'] is False
                images = actions.setdefault((actor['name'], key.removesuffix('Capture')), {})
                images[f'{density}X'] = copy_image(root / capture['file'],
                                                  f'{name}-{density}X-{capture["file"]}')
    terrain = report.get('newNativeTerrainObjects')
    if terrain:
        assert terrain['status'] == 'PASS_NATIVE_RESOURCE_SPAWN_ANIMATION_AND_TERRAIN_REMOVAL'
        for key, capture in terrain.items():
            if not key.endswith('Capture') or not isinstance(capture, dict):
                continue
            assert capture['rescaled'] is False
            fixture = 'tree' if key.startswith('tree') else 'spawner'
            actor = terrain['fixtures'][fixture]['name']
            images = actions.setdefault((actor, key.removesuffix('Capture')), {})
            images[f'{density}X'] = copy_image(root / capture['file'],
                                              f'{name}-{density}X-{capture["file"]}')


for name, *paths in args.case:
    roots = [Path(path) for path in paths]
    reports = [json.loads((root / 'report.json').read_text()) for root in roots]
    assert all(not report['errors'] and (report['status'] == 'PASS_SELECTED_NATIVE_CASES' or
               (root / 'report.json').resolve() in scoped_reports)
               for root, report in zip(roots, reports))
    route = reports[1]['captureRoute']
    standing_wall = args.scene_from_wall_normal and reports[1].get('newNativeWalls')
    if standing_wall:
        route = [dict(name=standing_wall['name'], tile=standing_wall['before']['wall']['tile'])]
        assert reports[0]['captureRoute'] == route
        assert reports[2]['newNativeWalls']['before']['wall']['tile'] == route[0]['tile']
    else:
        assert all(report['captureRoute'] == route for report in reports)
    assert len({report['selectedMap'] for report in reports}) == 1
    for index, row in enumerate(route):
        file = f'{index:02d}-{row["name"]}-framebuffer.png'
        images = {}
        for label, root, report in zip(['Original', '2X', '4X'], roots, reports):
            scene_file = file
            if args.scene_from_wall_normal and label != 'Original' and report.get('newNativeWalls'):
                wall = report['newNativeWalls']
                assert wall['name'] == row['name'] and wall['before']['wall']['tile'] == row['tile']
                scene_file = wall['beforeCapture']['file']
            images[label] = copy_image(root / scene_file, f'{name}-{label}-{file}')
        assert len({tuple(Image.open(args.output / file).size) for file in images.values()}) == 1
        scenes.append(dict(name=f'{name} / {row["name"]}', tile=row['tile'], images=images))
    actions = {}
    recaptures = {}
    for file in args.building_recapture_closure:
        closure = json.loads(file.read_text())
        assert closure['status'] == 'PASS_SCOPED_NATIVE_RECAPTURE_WITH_UNCHANGED_PRIMARY_EVIDENCE'
        for item in closure['cases']:
            primary, source = Path(item['primaryReport']), Path(item['recaptureReport'])
            assert sha(primary) == item['primarySha256'] and sha(source) == item['recaptureSha256']
            assert primary.resolve() in {(root / 'report.json').resolve() for root in roots[1:]}
            old, fresh = json.loads(primary.read_text()), json.loads(source.read_text())
            assert old['status'] == fresh['status'] == 'PASS_SELECTED_NATIVE_CASES'
            assert not old['errors'] and not fresh['errors'] and fresh['graphics']['glError'] == 0
            for key in ['selectedMap', 'edition', 'theater', 'selectedEnvironmentRevision']:
                assert old[key] == fresh[key]
            assert old['environment']['density'] == fresh['environment']['density'] == item['density']
            assert fresh['newNativeStates']['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
            fresh_names = {row['normal']['name'] for row in fresh['newNativeStates']['buildings']}
            old_names = {row['normal']['name'] for row in old['newNativeStates']['buildings']}
            assert fresh_names == set(item['names']) and fresh_names.issubset(old_names)
            assert primary.resolve() not in recaptures
            recaptures[primary.resolve()] = (fresh, source.parent, fresh_names)
        evidence.append(dict(path=str(file.resolve()), sha256=sha(file)))
    for density, root, report in zip([2, 4], roots[1:], reports[1:]):
        recapture = recaptures.get((root / 'report.json').resolve())
        if recapture:
            fresh, fresh_root, replaced = recapture
            retained = dict(report, newNativeStates=dict(report['newNativeStates'], buildings=[
                row for row in report['newNativeStates']['buildings'] if row['normal']['name'] not in replaced]))
            collect_actions(retained, root, name, density, actions)
            collect_actions({'newNativeStates': fresh['newNativeStates']}, fresh_root, name, density, actions)
        else:
            collect_actions(report, root, name, density, actions)
    for file in args.building_state_closure:
        closure = json.loads(file.read_text())
        assert closure['status'] == 'PASS_REUSED_NATIVE_BODY_STATES_SEPARATE_TECHNOLOGY_CLOSURE'
        source, paired = Path(closure['bodyReport']), Path(closure['technologyReport'])
        assert sha(source) == closure['bodyReportSha256'] and sha(paired) == closure['technologyReportSha256']
        assert paired.resolve() == (roots[1] / 'report.json').resolve()
        old = json.loads(source.read_text())
        assert old['status'] == 'FAIL' and not old['errors']
        assert 'CAOILD: native captured flag must bind HD' in old['failure']
        assert old['newNativeStates']['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
        assert old['selectedMap'] == reports[1]['selectedMap'] and old['edition'] == reports[1]['edition']
        collect_actions({'newNativeStates': old['newNativeStates']}, source.parent, name, 2, actions)
        evidence.append(dict(path=str(file.resolve()), sha256=sha(file)))
    for file in args.building_subset_closure:
        closure = json.loads(file.read_text())
        assert closure['status'] == 'PASS_HASH_PINNED_COMPLETED_WALL_STATES_FROM_FAILED_LATER_DIAGNOSTIC'
        source = Path(closure['report'])
        assert sha(source) == closure['sha256']
        old = json.loads(source.read_text())
        assert old['status'] == 'FAIL' and not old['errors']
        assert old['selectedMap'] == reports[1]['selectedMap'] and old['edition'] == reports[1]['edition']
        assert old['selectedEnvironmentRevision'] == reports[1]['selectedEnvironmentRevision'] == closure['selectedRevision']
        assert old['environment']['density'] == reports[1]['environment']['density'] == 2
        completed = old['newNativeStates']['buildings']
        assert set(closure['completedNames']) == {row['normal']['name'] for row in completed}
        assert all(row['normal']['frame'] == 0 and row['damaged']['frame'] == 1
                   and row['destroyed']['destroyed'] and not row['normal']['canOccupy'] for row in completed)
        verified_subset = dict(status='PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES',
                               buildings=completed, actors=[])
        collect_actions({'newNativeStates': verified_subset}, source.parent, name, 2, actions)
        evidence.append(dict(path=str(file.resolve()), sha256=sha(file)))
    if args.technology_service_reports:
        for density, directory, primary in zip([2, 4], args.technology_service_reports, reports[1:]):
            source = directory / 'report.json'
            service_report = json.loads(source.read_text())
            assert service_report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not service_report['errors']
            assert service_report['graphics']['glError'] == 0
            assert service_report['environment']['density'] == density
            assert service_report['selectedMap'] == primary['selectedMap']
            assert service_report['edition'] == primary['edition']
            assert service_report['selectedEnvironmentRevision'] == primary['selectedEnvironmentRevision']
            allocation = service_report['combinedWorldAllocation']
            assert allocation['total'] <= allocation['limit']
            service = service_report['newNativeTechnologyService']
            assert service['status'] == 'PASS_NATIVE_OUTPOST_VEHICLE_REPAIR_AND_ALL_THREE_MECHANICAL_PHASES'
            assert service['trace'][-1]['health'] == 100
            for phase in service['phases']:
                capture = phase['capture']
                assert capture['rescaled'] is False
                action = 'native vehicle service observed ' + phase['sourceImage']
                images = actions.setdefault(('CAOUTP', action), {})
                images[f'{density}X'] = copy_image(directory / capture['file'],
                    f'{name}-{density}X-service-{capture["file"]}')
            evidence.append(dict(path=str(source.resolve()), sha256=sha(source)))
    for (actor, action), images in actions.items():
        assert set(images) == {'2X', '4X'} or (args.single_density_building_states
            and action.startswith('building ') and set(images) == {'2X'})
        states.append(dict(name=f'{name} / {actor} / {action}', images=images))
    evidence.extend(dict(path=str((root / 'report.json').resolve()), sha256=sha(root / 'report.json'),
                         historicalOverallStatus=report['status'],
                         scopedClosure=str(scoped_reports[(root / 'report.json').resolve()])
                         if (root / 'report.json').resolve() in scoped_reports else None)
                    for root, report in zip(roots, reports))
for name, directory in args.supplemental:
    root = Path(directory)
    report = json.loads((root / 'report.json').read_text())
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['environment']['density'] == 2 and report['newNativeBindings']
    for index, row in enumerate(report['captureRoute']):
        file = f'{index:02d}-{row["name"]}-framebuffer.png'
        states.append(dict(name=f'{name} / {row["name"]} / supplemental native 2X',
                           images={'2X': copy_image(root / file, f'{name}-2X-{file}')}))
    evidence.append(dict(path=str((root / 'report.json').resolve()), sha256=sha(root / 'report.json')))
if args.gate_reports:
    gate_states = {}
    for label, root in zip(['Original', '2X', '4X'], args.gate_reports):
        report = json.loads((root / 'report.json').read_text())
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        assert report['gateStatus'] == 'PASS_NATIVE_NORMAL_AND_DAMAGED_OPEN_PASSAGE_CLOSE_REPAIR_AND_DESTRUCTION'
        assert report['original'] == (label == 'Original')
        assert len(report['originalPlacements']) == 4 and len(report['captures']) == 20
        for capture in report['captures']:
            assert capture['rescaled'] is False
            gate_states.setdefault(capture['frame'], {})[label] = copy_image(root / capture['file'],
                f'gate-{label}-{capture["file"]}')
        evidence.append(dict(path=str((root / 'report.json').resolve()), sha256=sha(root / 'report.json')))
    for frame, images in sorted(gate_states.items()):
        assert set(images) == {'Original', '2X', '4X'}
        states.append(dict(name=f'GAGATE_A / native {"damaged" if frame >= 10 else "normal"} phase {frame % 10}',
                           images=images))
if args.neutral_vehicle_reports:
    bearings = {}
    for label, root in zip(['Original', '2X', '4X'], args.neutral_vehicle_reports):
        report = json.loads((root / 'report.json').read_text())
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        if label == 'Original':
            cases = report['matchedNeutralVehicleBearings']
        else:
            native = report['newNativeNeutralVehicles']
            assert native['status'] == 'PASS_ORIGINAL_PLACEMENTS_ALL_NATIVE_BEARINGS_MOVE_DAMAGE_AND_DESTRUCTION'
            cases = native['cases']
        assert [case['name'] for case in cases] == ['WINI', 'TRUCKB']
        for case in cases:
            captures = case['captures'] if label == 'Original' else case['bearings']
            assert [capture['heading'] for capture in captures] == [0, 45, 90, 135, 180, 225, 270, 315]
            for capture in captures:
                assert capture['rescaled'] is False
                bearings.setdefault((case['name'], capture['heading']), {})[label] = copy_image(
                    root / capture['file'], f'vehicle-{label}-{capture["file"]}')
        evidence.append(dict(path=str((root / 'report.json').resolve()), sha256=sha(root / 'report.json')))
    for (name, heading), images in bearings.items():
        assert set(images) == {'Original', '2X', '4X'}
        states.append(dict(name=f'{name} / actual original placement / posed native bearing {heading}', images=images))
for group, pair in enumerate([args.comparisons, *args.additional_comparisons]):
    for density, root in zip([2, 4], pair):
        entries = json.loads((root / 'index.json').read_text())
        if isinstance(entries, dict):
            assert entries['status'] == 'PREPARED_FOR_VISUAL_QA'
            entries = entries['records']
        for row in entries:
            assert row['density'] == density
            source = Path(row['file'])
            label = f'{row["member"]} / native and HD {density}X'
            suffix = f'-group{group}' if group else ''
            if group:
                label += (f' / frames {row["frames"][0]}–{row["frames"][-1]}' if 'frames' in row
                          else f' / native subtiles {row["nativeSubtiles"]}')
            comparisons.append(dict(name=label,
                image=copy_image(source, f'atlas-{density}X{suffix}-{source.name}')))
if args.building_state_names:
    densities = [2, 4] if args.building_states else [2]
    assert reviewed_building_names == {(name, density) for name in args.building_state_names for density in densities}
manifest = dict(schema='m2-4-environment-production-batch-review-v1', title=args.title,
    summary=args.summary, scenes=scenes, states=states, comparisons=comparisons, files=files,
    technical='PASS_SELECTED_NATIVE_CASES',
    visualDirection=('REPRESENTATIVE_DIRECTION_PENDING_USER_REVIEW' if args.representative_direction else
                     'USER_REJECTED_EXCESS_SNOW_SURFACE_TEXTURE_AND_TOWN_PATTERNS; REPRESENTATIVE_REPAIR_PENDING'
                     if args.visual_feedback_repair else f'USER_ACCEPTED_{args.theater}_REPRESENTATIVE_DIRECTION'),
    visual=(f'{args.theater}_SURFACE_REPAIR_AND_NEW_BINDINGS_PENDING_USER_REVIEW'
            if args.visual_feedback_repair else f'NEW_{args.theater}_BINDINGS_PENDING_USER_REVIEW'),
    fullSnowCoverage=False, m24Complete=False,
    disclosure='Original map placements, rules and source files remain unchanged. Object actions use legal native fixtures with original orders, stock warhead damage and sequences. Primary camera routes are matched; state ticks and action frames can differ between densities. Supplemental scenes show native 2X bindings with complete 4X shared-loader checks. Original action captures are not claimed.',
    reports=evidence)
if scoped_reports:
    manifest['disclosure'] += ' One retained overall 4X report failed only its later HD re-enable fixture; its complete bridge assertions and a separate fresh native lifecycle closure are explicitly pinned. The overall FAIL record is preserved.'
if args.single_density_building_states:
    manifest['disclosure'] += ' Bounded building state fixtures are labeled 2X only. Accepted unchanged art and complete density-state metadata are reused; primary new Snow placement bindings pass at both densities.'
if args.building_subset_closure:
    manifest['disclosure'] += ' Four completed 2X wall state fixtures are reused from a hash-pinned diagnostic that failed its later tower regarrison. Only explicitly verified completed cases are included; the original overall FAIL report remains unchanged. The separate tower/statue retry and all 4X cases pass.'
if args.gate_reports or args.neutral_vehicle_reports:
    manifest['disclosure'] += ' Original action captures are included only where the individual row has an Original column. Gate phases advance naturally; vehicle bearings are graphics-only review poses at actual source placements. Earlier unchanged family evidence is reused across frozen source checkpoints.'
(args.output / 'review-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(args.output / 'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8">'
    '<title>Embedded review entry</title><p><a href="index-embedded.html">Open the standalone embedded review</a></p></html>\n')
print(json.dumps(dict(output=str(args.output.resolve()), images=len(files), scenes=len(scenes),
                      states=len(states))))
