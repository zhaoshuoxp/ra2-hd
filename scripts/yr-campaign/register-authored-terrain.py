"""Append verified complete authored TMP members while retaining selected artwork."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_snow_scope import admit_snow_scope

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('authoring', type=Path)
parser.add_argument('revision')
parser.add_argument('receipt', type=Path)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
authoring = args.authoring.resolve()
export = authoring / args.revision
recipe, validation = read(export / 'recipe.json'), read(export / 'validation.json')
inspection = read(export / 'visual-inspection.json')
source = read(authoring / 'source.json')
assert source['editions'] == ['yr'] and source['theater'] in ('TEMPERATE', 'URBAN', 'NEWURBAN', 'SNOW')
if source['theater'] == 'SNOW':
    admit_snow_scope(recipe['materialProfile'], source)
assert validation['status'] == 'PASS_NEW_COMPLETE_GROUPS_NATIVE_METADATA_ALPHA_GUTTERS_AND_ACCEPTED_REUSE'
assert validation['pack'] == recipe['pack'] and recipe['pack']['revision'] == args.revision
assert not recipe['authorizedReplacementGroups'], 'Retain accepted terrain groups'
pack = Path('.local/terrain-packs') / args.revision
assert sha(pack / 'manifest.json') == recipe['pack']['sha256']
assert inspection['status'] == 'PASS_INTERNAL_INDEPENDENT_DENSITY_VISUAL_INSPECTION'
assert inspection['packSha256'] == recipe['pack']['sha256'] and inspection['densities'] == [2, 4]
assert all(sha(item['master']) == item['sha256'] and item['capacity'] >= 4 for item in recipe['masters'])
theater = source['theater']
pointer_file = Path('.local/terrain' + ('' if theater == 'TEMPERATE' else '-' + theater.lower()) + '-selection.json')
contract_file = Path('desktop/terrain-hd-contract.json' if theater == 'TEMPERATE'
    else 'desktop/terrain-theater-hd-contracts.json')
before_pointer, before_contract = read(pointer_file), read(contract_file)
assert before_pointer == recipe['acceptedBase']
assert (before_contract if theater == 'TEMPERATE' else before_contract[theater]) == before_pointer
old_root = pack.with_name(before_pointer['revision'])
assert sha(old_root / 'manifest.json') == before_pointer['sha256']
old, manifest = read(old_root / 'manifest.json'), read(pack / 'manifest.json')
assert manifest['schema'] == 'tmp-terrain-hd-v1' and manifest['theater'] == theater
assert manifest['groups'][:len(old['groups'])] == old['groups']
assert manifest['editions'] == old['editions']
new_groups = manifest['groups'][len(old['groups']):]
assert new_groups and len(manifest['groups']) <= 256
assert (pack / 'manifest.json').stat().st_size <= 2 * 1024 ** 2
old_members = {member['member'] for group in old['groups'] for member in group['members']}
new_members = [member for group in new_groups for member in group['members']]
assert not old_members.intersection(member['member'] for member in new_members)
assert {member['member'] for member in new_members} == {member['member'] for member in source['members']}
assert all(set(member['sourceHashes']) == {'yr'} for member in new_members)
for group in manifest['groups']:
    for variant in group['variants']:
        assert sha(pack / variant['file']) == variant['sha256']
        if group in old['groups']:
            assert sha(old_root / variant['file']) == variant['sha256']
missions = sorted({mission for member in source['members'] for binding in member['native']['bindings']
    for mission in binding['mapIds']})
receipt = dict(schema='yr-authored-complete-terrain-registration-v1',
    status='REGISTERED_COMPLETE_SOURCE_EXPORTS_NATIVE_PENDING' if args.apply else 'VERIFIED_UNSELECTED_NATIVE_PENDING',
    theater=theater, priorSelection=before_pointer, selectedPack=recipe['pack'],
    authoring=str(authoring), originalPreparedSourceSha256=source['preparedSourceSha256'],
    sourceSha256=sha(authoring / 'source.json'), exportRecipeSha256=sha(export / 'recipe.json'),
    validationSha256=sha(export / 'validation.json'), visualInspectionSha256=sha(export / 'visual-inspection.json'),
    addedGroups=[group['id'] for group in new_groups], members=[member['member'] for member in new_members],
    completeSourceSubtiles=sum(len(member['images']) for member in new_members), missions=missions,
    inheritedGroupsRetained=len(old['groups']), originalGeometryDepthRulesUnchanged=True,
    acceptedPayloadsReplaced=0, originalRgbUsedAsNewDetail=False, worldBudgetsChanged=False,
    registered=args.apply, nativeValidation='PENDING', userVisualAcceptance='PENDING', windows='NOT_RUN_ON_THIS_MAC')
assert not args.receipt.exists()
if args.apply:
    pointer_file.write_bytes(encode(recipe['pack']))
    contract_file.write_bytes(encode(recipe['pack'] if theater == 'TEMPERATE'
        else {**before_contract, theater: recipe['pack']}))
args.receipt.write_bytes(encode(receipt))
print(json.dumps(dict(status=receipt['status'], theater=theater, members=len(new_members),
    originalSubtiles=receipt['completeSourceSubtiles'], receipt=str(args.receipt))))
