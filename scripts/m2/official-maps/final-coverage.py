"""Summarize immutable inventory and copied native evidence without relabeling history."""
import collections
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
ART = ROOT / '.artifacts/m2-3'


def read(path):
    return json.loads(path.read_text())


def pin(path):
    return {'file': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    destination = pathlib.Path(sys.argv[1])
    inventory_path = ART / 'inventory-v9/inventory.json'
    inventory = read(inventory_path)
    environment = read(ROOT / '.local/environment-packs/environment-m2-3-complete-v1/manifest.json')
    baseline = read(ROOT / '.local/environment-packs/environment-m2-2-complete-v10/manifest.json')
    contract = read(ROOT / 'desktop/environment-hd-contract.json')
    new_families = set(environment['families']) - set(baseline['families'])
    maps = {item['mapId']: item for item in inventory['maps']}
    temperate = [item for item in maps.values() if item.get('theater') == 'TEMPERATE'
                 and item['classification'] == 'OFFICIAL_SKIRMISH']
    evidence = []
    published = {2: set(), 4: set()}
    bound = {2: set(), 4: set()}
    terrain_groups = {2: set(), 4: set()}
    procedural = {2: set(), 4: set()}
    state_cases = {2: {}, 4: {}}
    native_maps = {2: set(), 4: set()}
    peaks = {2: 0, 4: 0}
    for file in sorted(ART.glob('native-*/report.json')):
        report = read(file)
        if not report.get('status', '').startswith('PASS'):
            continue
        env = report.get('environment', {})
        density = env.get('density')
        if density not in (2, 4):
            continue
        edition = report['edition']
        identities = contract['identities'][edition]
        selected = report.get('selectedMap', '').lower()
        if selected:
            native_maps[density].add(f'{edition}:{selected}')
        for family, value in env.get('families', {}).items():
            if family in new_families and value['status'] == 'PUBLISHED_COMPLETE_FAMILY':
                published[density].add(family)
        for group in report.get('terrain', {}).get('groups', []):
            if group['id'].startswith('m2-3-') and group['status'] == 'PUBLISHED':
                terrain_groups[density].add(group['id'])
        objects = list(report.get('newNativeBindings', []))
        states = report.get('newNativeStates', {})
        for building in states.get('buildings', []):
            objects.append(building['normal'])
        for actor in states.get('actors', []):
            objects.extend(actor.get('samples', {}).values())
        for case in states.get('animationCases', []):
            objects.extend(case.get('before', {}).get('samples', []))
        objects.extend(report.get('newNativeAnimations', {}).get('before', {}).get('waterfalls', []))
        for lightpost in report.get('newNativeAnimations', {}).get('before', {}).get('lightposts', []):
            if lightpost['name'] == 'INGRNLMP' and lightpost['spawned'] and not lightpost['hasMainSprite']:
                assert lightpost['lampChildren'] == ['Mesh']
                procedural[density].add('environment-gglite')
        for decal in report.get('newNativeDecals', {}).get('cases', []):
            objects.append({'name': decal['name'], 'hd': decal['binding'].get('identity')})
        for crate in report.get('crates', []):
            objects.append({'name': crate['name'], 'hd': crate['binding'].get('identity')})
        for obj in objects:
            if obj.get('hd') or obj.get('shpHd') or obj.get('ready', {}).get('hd'):
                family = identities.get(obj['name'])
                if family in new_families:
                    bound[density].add(family)
        if states:
            key = (edition, selected)
            previous = state_cases[density].get(key)
            if previous is None or file.stat().st_mtime > previous[0].stat().st_mtime:
                state_cases[density][key] = (file, states)
        allocation = report.get('combinedWorldAllocation')
        if allocation:
            assert allocation['total'] <= allocation['limit']
            assert allocation['limit'] == (512 if density == 2 else 1280) * 1024 * 1024
            peaks[density] = max(peaks[density], allocation['total'])
        evidence.append({**pin(file), 'edition': edition, 'map': selected, 'density': density,
                         'app': report.get('app'), 'nativeStateStatus': states.get('status'),
                         'combinedWorldAllocation': allocation})
    family_exceptions = []
    for family in sorted(new_families - (published[2] & published[4])):
        rows = [row for row in inventory['rows'] if row['theater'] == 'TEMPERATE'
                and row.get('acceptedFamily') == family]
        usage = sorted({map_id for row in rows for map_id in row['usage']})
        eligible = [map_id for map_id in usage
                    if maps[map_id].get('runtimeEligibility') == 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH']
        family_exceptions.append({'family': family, 'members': environment['families'][family]['members'],
            'staticStatus': 'COMPLETE_INDEPENDENT_2X_4X_EXPORT_AND_REVIEW_MEDIA',
            'nativeStatus': 'NOT_EXERCISED_CONSERVATIVE_RANGE_DEPENDENCY' if eligible
                else 'NOT_EXERCISED_NO_SELECTABLE_SUPPORTED_NATIVE_MAP',
            'identities': sorted({row['id'] for row in rows}), 'maps': usage,
            'eligibleMaps': eligible, 'reasons': sorted({reason for row in rows
                for value in row['usage'].values() for reason in value['reasons']})})
    theater_summary = []
    for theater in inventory['theaters']:
        selected = [item for item in maps.values() if item.get('theater') == theater['theater']
                    and item.get('runtimeEligibility') == 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH']
        theater_summary.append({**theater, 'nativeSelectableEligibleEntries': len(selected)})
    result = {'schema': 'm2-3-final-coverage-v1',
        'status': 'COMPLETE_DECLARED_TEMPERATE_ART_WITH_EXPLICIT_NATIVE_EXCEPTIONS',
        'inventory': pin(inventory_path), 'counts': inventory['counts'], 'theaters': theater_summary,
        'temperate': {'entries': len(temperate), 'cheapStructureStatus': dict(collections.Counter(
            item['cheapStructureStatus'] for item in temperate)), 'runtimeEligibility': dict(collections.Counter(
            item['runtimeEligibility'] for item in temperate)), 'remainingAuthoredGaps': 0,
            'mapCoverage': [{key: item.get(key) for key in ['mapId', 'source', 'catalogVisibility',
                'cheapStructureStatus', 'nativeSkirmishMode', 'runtimeEligibility', 'issues']}
                for item in temperate]},
        'newEnvironmentFamilies': len(new_families), 'nativeEvidence': evidence,
        'nativeByDensity': {str(density): {'selectedMapEditionCases': sorted(native_maps[density]),
            'publishedNewFamilies': sorted(published[density]), 'boundNewFamilies': sorted(bound[density]),
            'nativeProceduralFamilies': sorted(procedural[density]),
            'terrainGroups': sorted(terrain_groups[density]), 'peakCombinedWorldChargeBytes': peaks[density],
            'worldLimitBytes': (512 if density == 2 else 1280) * 1024 * 1024,
            'latestStateEvidence': [pin(file) for file, _ in state_cases[density].values()],
            'buildingNames': sorted({building['normal']['name'] for _, states in state_cases[density].values()
                                    for building in states.get('buildings', [])}),
            'actorNames': sorted({actor['name'] for _, states in state_cases[density].values()
                                 for actor in states.get('actors', [])})} for density in [2, 4]},
        'nativeFamilyExceptions': family_exceptions,
        'nativeRenderingExceptions': [{'family': 'environment-gglite', 'identity': 'INGRNLMP',
            'status': 'NATIVE_PROCEDURAL_LIGHTPOST_RETAINED',
            'reason': 'The native renderer uses a lamp mesh and has no main SHP sprite. The authored source remains complete in the catalog and static review; no sprite is forced onto the native light effect.'}],
        'terrainNativeExceptions': [
            {'set': 51, 'members': ['w-d-01.tem', 'w-d-02.tem', 'w-d-04.tem'],
             'reason': 'XAMAZON01 requires an unavailable native mode; static export and all phase review only.'},
            {'set': 56, 'members': ['dcliff01.tem'],
             'reason': 'Only archive versions use this source; they are absent from the selected native catalog.'}],
        'sourceExceptions': [{key: row.get(key) for key in ['key', 'edition', 'kind', 'id', 'source', 'issue']}
            for row in inventory['rows'] if row['theater'] == 'TEMPERATE'
            and row['decision'] == 'UNSUPPORTED_OR_UNRESOLVED_DEPENDENCY'],
        'platform': {'mac': 'FOCUSED_COPIED_NATIVE_EVIDENCE', 'windows': 'NOT_RUN',
                     'physicalInput': 'NOT_RUN', 'userVisualAcceptance': 'PENDING_GROUPED_REVIEW'},
        'nextTheaterRecommendation': 'SNOW, followed by URBAN; no new theater authoring is authorized here.',
        'boundaries': inventory['boundaries'] + [
            'Published family counts and actual render bindings are reported separately.',
            'Controlled native fixtures do not establish an independent natural full match for every map.',
            'Archive, native-mode and unresolved-source exceptions remain in the denominator.']}
    assert not any(item['gapResources'] for item in theater_summary if item['theater'] == 'TEMPERATE')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'status': result['status'], 'evidenceReports': len(evidence),
                      'familyExceptions': len(family_exceptions)}))


if __name__ == '__main__':
    main()
