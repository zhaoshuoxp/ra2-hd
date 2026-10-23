"""Reconcile the complete catalog with exact accepted source authorities; retain every failure."""
import collections
import csv
import hashlib
import json
import subprocess
from pathlib import Path
from final_actor_materials_batch98 import ROOT
from newurban_batch89_io import pin, read, write

BASE = Path('.artifacts/m2-4')
before_file = ROOT / 'inventory-all-theaters-v1/inventory.json'
inventory_file = ROOT / 'inventory-all-theaters-v2/inventory.json'
before, inventory = read(before_file), read(inventory_file)
assert before['archivePins'] == inventory['archivePins']
assert before['counts'] == inventory['counts'] and before['issues'] == inventory['issues']
old_rows = {r['key']: r for r in before['rows']}
rows = {r['key']: r for r in inventory['rows']}
assert old_rows.keys() == rows.keys()
changes = []
native_fields = ['edition', 'theater', 'kind', 'id', 'source', 'dependencies', 'palette',
    'hasShadow', 'remapable', 'drawOffset', 'paletteType', 'nativeArt', 'nativeRules', 'usage', 'nativeSlots', 'states']
for key, row in rows.items():
    previous = old_rows[key]
    assert all(previous.get(field) == row.get(field) for field in native_fields), key
    if row['decision'] != previous['decision']:
        assert previous['decision'] == 'MISSING_AUTHORED_FAMILY'
        assert row['theater'] == 'URBAN' and row['edition'] == 'yr'
        assert row['id'] in {'CAWASH01', 'CAWASH14', 'CAWASH15', 'CAPARS11'}
        changes.append(dict(key=key, id=row['id'], before=previous['decision'], after=row['decision'],
            source=row['source'], family=row['acceptedFamily']))
assert len(changes) == 4

urban_file = BASE / 'urban-factions-batch48-v1/authority-v1.json'
urban_closure = BASE / 'urban-factions-batch48-v1/native-closure.json'
urban = read(urban_file)
assert read(urban_closure)['status'].startswith('PASS_')
authority_files = [BASE / 'accepted-faction-routing-batches79-80-20261019/coverage-and-native-closure-v1.json',
    BASE / 'legacy-faction-reuse-batch84-20261020/coverage-and-native-closure-v1.json']
accepted, evidence = {}, [pin(urban_file), pin(urban_closure)]
for file in authority_files:
    authority = read(file)
    assert authority['status'].startswith('PASS_')
    evidence.append(pin(file))
    previous_inventory = Path(authority['currentInventory']['file'])
    assert pin(previous_inventory) == authority['currentInventory']
    original_rows = {r['key']: r for r in read(previous_inventory)['rows']}
    for theater in authority['theaters']:
        for group in theater['coveredSourceGroups']:
            accepted[(theater['theater'], group['key'])] = dict(group=group, rows=original_rows, authority=pin(file))

theaters, credits, remaining = [], [], []
for theater in inventory['theaters']:
    name = theater['theater']
    raw = [g for g in inventory['resourceGroups'] if g['theater'] == name and 'MISSING_AUTHORED_FAMILY' in g['decisions']]
    credited = []
    for group in raw:
        if name == 'URBAN':
            matches = [row for row in urban['rows'] if row['family'] in group['identities']
                and any(m['actualMember'] == group['member'] and m['sourceSha256'] == group['sha256'] for m in row['members'])]
            if not matches:
                remaining.append(group)
                continue
            credited.append(dict(group=group, authority=pin(urban_closure),
                originalSourceAudit=pin(urban_file), sourceCells=[dict(edition=r['edition'], family=r['family'],
                    selection=r['selection'], familyHash=r['familyHash']) for r in matches],
                deduplication='Reuse accepted edition/source cells and explicit shared-path deduplication. No new artwork credit.'))
        else:
            accepted_row = accepted.get((name, group['key']))
            if not accepted_row:
                remaining.append(group)
                continue
            old = accepted_row['group']
            assert old['member'] == group['member'] and old['sha256'] == group['sha256']
            for key in group['rowKeys']:
                a, b = accepted_row['rows'][key], rows[key]
                assert all(a.get(field) == b.get(field) for field in native_fields), (name, group['member'], key)
            credited.append(dict(group=group, authority=accepted_row['authority'],
                sourceContexts='Every original source, palette, rule, slot, state and usage field remains exact.'))
    credits.extend(credited)
    theater_gaps = [g for g in remaining if g['theater'] == name]
    theaters.append(dict(theater=name, directoryEntries=theater['maps'], rawMissingGroups=len(raw),
        reusedAcceptedGroups=len(credited), remainingAuthoredGaps=len(theater_gaps),
        blockedOriginalMaps=theater['blockedMaps'], resources=theater['resources'],
        lunarScope='OUT_OF_SCOPE_NO_OFFICIAL_MAP' if name == 'LUNAR' else None))
assert not remaining, [(g['theater'], g['member']) for g in remaining]
assert {t['theater']: t['reusedAcceptedGroups'] for t in theaters} == {
    'TEMPERATE': 0, 'URBAN': 49, 'SNOW': 0, 'DESERT': 49, 'NEWURBAN': 47, 'LUNAR': 0}

mode_file = BASE / 'checkpoint-2-v3/mode-adaptation.json'
mode_rows = {row['mapId']: row for row in read(mode_file)['maps']}
maps = [m for m in inventory['maps'] if m['classification'] == 'OFFICIAL_SKIRMISH']
assert len(maps) == len(mode_rows) == 305
table = []
approved = 'a4f07f9b927148f871136237e48253cadff9ff631602cb79de46e86e1100c574'
for m in maps:
    mode = mode_rows[m['mapId']]
    assert m['source']['sha256'] == mode['source']['sha256']
    assert m['starts'] == mode['starts'] and m['unifiedSkirmish']['maxSlots'] == mode['maxSlots']
    assert m['nativeSkirmishMode']['status'] == 'AVAILABLE_STANDARD_MODE'
    table.append(dict(mapId=m['mapId'], edition=m['edition'], theater=m['theater'], source=m['source'],
        runtimeName=m['unifiedSkirmish']['runtimeName'], originalModes=m['unifiedSkirmish']['originalModes'],
        maxSlots=m['starts'], menuSelectable=mode['menuSelectable'],
        adaptation=m['unifiedSkirmish']['adaptation'], standardModeIni='mpbattle.ini',
        approvedStartingUnitRestorations=['HTNK', 'E2', 'SHK', 'LTNK', 'MTNK', 'HOWI', 'E1'] if m['source']['sha256'] == approved else [],
        mapMechanismsPreserved=True, cheapLoadStatus=m['cheapStructureStatus'], nativeStatus=mode['nativeStatus'],
        acceptedNativeEvidence=mode['nativeEvidence'], originalIssues=m.get('issues', [])))
write(ROOT / 'final-mode-adaptation-v1.json', dict(schema='m24-final-unified-mode-table-v1', maps=table))
with (ROOT / 'final-mode-adaptation-v1.csv').open('x') as stream:
    fields = ['mapId', 'edition', 'theater', 'runtimeName', 'originalModes', 'maxSlots', 'menuSelectable',
        'adaptation', 'cheapLoadStatus', 'nativeStatus', 'originalIssues']
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    for row in table:
        writer.writerow({k: json.dumps(row[k], separators=(',', ':')) if isinstance(row[k], (list, dict)) else row[k] for k in fields})

protected = ['src/offline/officialSkirmish.ts', 'src/engine/MapList.ts', 'src/engine/MapManifest.ts',
    'src/gui/screen/mainMenu/lobby/PregameController.ts', 'src/game/ini/GameModes.ts', 'src/game/GameFactory.ts']
paths = []
for file in protected:
    prior = subprocess.check_output(['git', 'show', '0e82175d:' + file])
    assert prior == Path(file).read_bytes(), file
    paths.append(dict(current=pin(file), sameAsAcceptedRuntime='0e82175d'))
starting = [BASE / 'approved-starting-units-user-decision-20261012-v1.json',
    BASE / 'approved-starting-units-audit-v1.json', BASE / 'native-approved-starting-units-ra2-v1/report.json',
    BASE / 'native-approved-starting-units-yr-v1/report.json']
for file in starting:
    assert file.exists(), file
result = dict(status='PASS_ALL_THEATER_ART_SOURCE_COVERAGE_WITH_FOUR_EXPLICIT_ORIGINAL_DATA_BLOCKERS',
    inventory=pin(inventory_file), priorInventory=pin(before_file), scannerCorrection=changes,
    counts=dict(catalogDeclarations=298, inventoriedEntries=417, officialScopeEntries=305,
        independentSourceFiles=234, independentByteStreams=234, overlappingOriginalModeLabels=376,
        unlabelledSources=31, actualSelectableEntries=sum(t['menuSelectable'] for t in table),
        acceptedNativeEntries=301, blockedOriginalEntries=4, acceptedFactionGroupsReused=len(credits)),
    theaters=theaters, reusedSourceAuthorities=evidence, creditedSourceGroups=credits,
    remainingAuthoredGaps=remaining, originalIssues=inventory['issues'],
    unifiedModeTable=pin(ROOT / 'final-mode-adaptation-v1.json'), acceptedModeAuthority=pin(mode_file),
    unchangedRoutingPaths=paths, approvedStartingUnitEvidence=[pin(f) for f in starting],
    rowDecisionCounts=dict(collections.Counter(r['decision'] for r in inventory['rows'])),
    sourceArchivePins=inventory['archivePins'], newArtworkVisual='PENDING_CIV1_AND_DNOA_ONLY',
    nativeRuntime='DETAILED_ACTOR_AND_SOURCE_LIGHTING_PASSED_CURRENT_MAIN_LOADING_INCREMENT_PENDING',
    windows='NOT_RUN_ON_THIS_MAC', finalIndependentMacDelivery='PENDING_FINAL_ACCEPTANCE', m24Complete=False)
write(ROOT / 'all-theater-reconciliation-v1.json', result)
print(dict(counts=result['counts'], remainingArtworkGroups=0, originalDataBlockers=4, scannerCorrections=len(changes)))
