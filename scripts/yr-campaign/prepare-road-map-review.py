"""Declare complete native road inspection closures for every original map."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('audit', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--available-retail-only', action='store_true',
    help='Retain unavailable archive-only sources as explicit boundaries outside native launch plans.')
args = parser.parse_args()
assert not args.output.exists(); args.output.mkdir()
sha = lambda data: hashlib.sha256(data).hexdigest()
audit = json.loads(args.audit.read_text())
assert audit['status'].startswith('PASS_ALL_ORIGINAL_CAMPAIGN_AND_ARCHIVED_SKIRMISH')
catalog = json.loads(Path('src/offline/officialSkirmishCatalog.json').read_text())['maps']
plans = []
boundaries = []
if args.available_retail_only:
    assert audit['schema'] == 'all-original-map-road-slope-source-audit-v2'
    boundaries = audit['sourceBoundaries']
    assert all(row['kind'] == 'skirmish' and row['publiclyListed'] is False for row in boundaries)
for edition in ['ra2', 'yr']:
    for theater in ['TEMPERATE', 'URBAN', 'SNOW', 'NEWURBAN', 'DESERT', 'LUNAR']:
        maps = [row for row in audit['maps'] if row['edition'] == edition and row['theater'] == theater
            and any(slope['member'].startswith(('prslpe', 'drslpe')) for slope in row['slopes'])
            and (not args.available_retail_only or not row['absentOriginalTiles'])]
        if not maps:
            continue
        suffix = '' if theater == 'TEMPERATE' else '-' + theater.lower()
        pointer = json.loads(Path(f'.local/terrain{suffix}-selection.json').read_text())
        root = Path('.local/terrain-packs') / pointer['revision']
        assert sha((root / 'manifest.json').read_bytes()) == pointer['sha256']
        manifest = json.loads((root / 'manifest.json').read_text())
        names = {slope['member'] for row in maps for slope in row['slopes']
            if slope['member'].startswith(('prslpe', 'drslpe'))}
        groups = [group for group in manifest['groups'] if any(member['member'] in names for member in group['members'])]
        members = sorted({member['member'] for group in groups for member in group['members']
            if member['member'].startswith(('prslpe', 'drslpe'))})
        assert names <= set(members), f'Original road slope still lacks HD: {edition}/{theater}'
        closures = {}
        for row in maps:
            encountered = {slope['member'] for slope in row['slopes']}
            resident = [group for group in groups if any(member['member'] in encountered for member in group['members'])]
            slots = sum(len(member['images']) for group in resident for member in group['members'] if member['member'] in members)
            original = next((entry for entry in catalog if entry['edition'] == edition
                and entry['runtimeName'] == row['name']), None) if row['kind'] == 'skirmish' else None
            closures[row['name']] = dict(groups=[group['id'] for group in resident], subtiles=slots,
                sourceSha256=row['sha256'], maxSlots=original['maxSlots'] if original else None,
                sourceCells=[dict(member=slope['member'], **cell) for slope in row['slopes']
                    if slope['member'] in members for cell in slope['cells']])
        receipt = dict(schema='all-original-map-native-road-review-plan-v1', registered=True,
            originalGeometryDepthRulesUnchanged=True, acceptedPayloadsReplaced=0,
            scope='Read-only native inspection of the currently selected road artwork and every original source placement.',
            edition=edition, theater=theater, selected=pointer, members=members,
            inspectionGroups=[group['id'] for group in groups], mapClosures=closures,
            variants={group['id']: {str(variant['density']): variant['sha256'] for variant in group['variants']}
                for group in groups},
            missions=[row['name'] for row in maps], mapKinds={row['name']: row['kind'] for row in maps},
            sourceAudit=dict(file=str(args.audit.resolve()), sha256=sha(args.audit.read_bytes())))
        target = args.output / f'{edition}-{theater.lower()}.json'
        target.write_text(json.dumps(receipt, indent=2) + '\n')
        plans.append(dict(edition=edition, theater=theater, file=str(target.resolve()), maps=len(maps), members=len(members)))
(args.output / 'plans.json').write_text(json.dumps(dict(plans=plans,
    maps=sum(plan['maps'] for plan in plans), nativeQualification='PENDING',
    sourceAudit=dict(file=str(args.audit.resolve()), sha256=sha(args.audit.read_bytes())),
    availableRetailOnly=args.available_retail_only, sourceBoundaries=boundaries,
    publicMapsExcluded=0, originalSourceMapsChanged=0), indent=2) + '\n')
print(json.dumps(dict(plans=len(plans), maps=sum(plan['maps'] for plan in plans))))
