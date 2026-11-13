"""Register one verified complete campaign SHP family through existing routes."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from campaign_bridge_art import bridge_aggregate_admission, retire_bridge_predecessor_routes

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', type=Path)
parser.add_argument('revision')
parser.add_argument('receipt', type=Path)
parser.add_argument('--owner-predecessor', type=Path)
parser.add_argument('--art-predecessor', type=Path)
parser.add_argument('--art-feedback', type=Path)
parser.add_argument('--bridge-predecessor', type=Path)
parser.add_argument('--building-predecessor', type=Path)
parser.add_argument('--candidate-owner-predecessor', type=Path,
    help='Refine only owner data in an unaccepted YR task family; retain its prior family and payloads.')
parser.add_argument('--donor-only', action='store_true')
args = parser.parse_args()
assert sum(bool(value) for value in [args.owner_predecessor, args.art_predecessor,
    args.bridge_predecessor, args.building_predecessor, args.candidate_owner_predecessor]) <= 1
assert bool(args.art_predecessor or args.bridge_predecessor or args.building_predecessor) == bool(args.art_feedback)
assert args.revision and all(char in 'abcdefghijklmnopqrstuvwxyz0123456789-' for char in args.revision)
root = Path(__file__).resolve().parents[2]
read = lambda path: json.loads(path.read_text())
sha = lambda payload: hashlib.sha256(payload).hexdigest()
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
stage = args.stage.resolve()
prepared, verification = read(stage / 'preparation.json'), read(stage / 'verification.json')
inspection = read(stage / 'visual-inspection.json')
assert verification['status'] == 'PASS' and verification['sha256'] == sha((stage / 'pack/manifest.json').read_bytes())
assert inspection['status'] == 'PASS_INTERNAL_NATIVE_GEOMETRY_AND_DENSITY_INSPECTION'
assert inspection['packSha256'] == verification['sha256'] and inspection['independentDensities'] == [2, 4]
addition, pack = read(stage / 'contract.json'), read(stage / 'pack/manifest.json')
family, declared = next(iter(addition['families'].items()))
assert len(addition['families']) == 1
edition, = declared['editions']
assert edition in ('ra2', 'yr')
assert edition == 'ra2' or not any([args.owner_predecessor, args.art_predecessor, args.bridge_predecessor, args.donor_only])
assert not args.building_predecessor or edition == 'yr'
assert not args.candidate_owner_predecessor or edition == 'yr'
if len(declared['members']) != 1 and edition == 'ra2':
    assert not (args.owner_predecessor or args.art_predecessor or args.donor_only)
    original = read(stage / 'prepared/source.json')
    assert prepared['bridgeAggregate'] == bridge_aggregate_admission(original, root)
    assert declared['members'] == [source['member'] for source in original['sources']]
    assert declared['identities'] == [source['identity'] for source in original['sources']]
    assert declared['kinds'] == ['overlay'] and declared['editions'] == ['ra2']
elif edition == 'yr':
    original = read(stage / 'prepared/source.json')
    assert original['edition'] == 'yr' and prepared['userVisualAcceptance'] == 'PENDING'
    assert declared['members'] == [source['member'] for source in original['sources']]
    assert all(source['bindings'] and source['sha256'] == addition['sources'][source['member']]['sha256']
        and all(binding['identity'] in declared['identities'] for binding in source['bindings'])
        for source in original['sources'])
scoped_missions = declared['sourceScope']['campaignSources']
if edition == 'yr':
    mission, = [item for item in scoped_missions if item['mission'] == original['mission']]
    for item in scoped_missions:
        assert item['edition'] == edition
        source_map = root / '.local/campaign' / edition / item['mission'][:-4] / item['mission']
        assert sha(source_map.read_bytes()) == item['sha256']
else:
    mission, = scoped_missions
assert mission.get('edition', 'ra2') == edition
theater = addition['theater']
contract_file = root / ('desktop/environment' + ('' if theater == 'TEMPERATE' else '-' + theater.lower()) + '-hd-contract.json')
before = contract_file.read_bytes()
contract = json.loads(before)
assert family not in contract['families']
predecessor, comparison, previous_roots = None, None, {}
if args.owner_predecessor:
    predecessor = read(args.owner_predecessor)
    previous = contract['families'][predecessor['family']]
    assert previous['familyHash'] == predecessor['bundle']['familyHash']
    assert predecessor['theater'] == theater and predecessor['mission'] == mission
    assert previous['members'] == declared['members'] and previous['kinds'] == ['building']
    assert previous['editions'] == ['ra2'] and previous['sourceScope']['campaignSources']
    assert predecessor['preparation']['masters'] == prepared['masters'], 'Preserve every authored master'
    comparison = read(stage / 'owner-only-comparison.json')
    assert comparison['status'] == 'PASS' and comparison['ownerDataOnly'] is True
    assert Path(comparison['before']).resolve() == Path(predecessor['stage']).resolve() / 'pack'
    assert Path(comparison['after']).resolve() == stage / 'pack'
    assert all(row['allFixedPixelsIdentical'] for row in comparison['densities'])
    if 'CASTL04' in declared['identities']:
        assert all(row['allAlphaIdentical'] for row in comparison['densities']), 'Preserve accepted Arch edges'
    declared['sourceScope'] = copy.deepcopy(previous['sourceScope'])
    for identity in declared['identities']:
        previous_roots[identity] = contract['identities']['ra2'].get(identity)
        assert args.donor_only or previous_roots[identity] == predecessor['family']
elif args.art_predecessor:
    assert not args.donor_only
    predecessor = read(args.art_predecessor)
    previous = contract['families'][predecessor['family']]
    feedback = read(args.art_feedback)
    assert previous['familyHash'] == predecessor['bundle']['familyHash']
    assert predecessor['theater'] == theater and predecessor['mission'] == mission
    assert previous['members'] == declared['members'] and previous['kinds'] == declared['kinds'] == ['terrain']
    assert previous['editions'] == declared['editions'] == ['ra2']
    assert previous['identities'] == declared['identities']
    assert all(theater + '_' + identity in feedback['reopened'] for identity in declared['identities'])
    assert predecessor['preparation']['masters'] == prepared['masters'], 'Preserve approved material masters'
    declared['sourceScope'] = copy.deepcopy(previous['sourceScope'])
    for identity in declared['identities']:
        previous_roots[identity] = contract['identities']['ra2'].get(identity)
        assert previous_roots[identity] == predecessor['family']
    old_member, = predecessor['bundle']['members']
    new_member, = pack['families'][family]['members']
    old_file = root / '.local/campaign/ra2' / mission['mission'][:-4] / old_member['manifest']
    assert sha(old_file.read_bytes()) == old_member['sha256']
    old_metadata = read(old_file)
    new_metadata = read(stage / 'pack' / new_member['path'])
    assert old_metadata['source'] == new_metadata['source'] and old_metadata['logical'] == new_metadata['logical']
    assert 'authoredTerrainRegistration' in new_metadata['color']
else:
    assert not args.donor_only
    if args.bridge_predecessor:
        predecessor = read(args.bridge_predecessor)
        previous = contract['families'][predecessor['family']]
        feedback = read(args.art_feedback)
        assert feedback['schema'] == 'original-urban-bridge-feedback-v48'
        assert predecessor['mission'] == mission and predecessor['theater'] == theater == 'URBAN'
        assert previous['familyHash'] == predecessor['bundle']['familyHash']
        assert previous['members'] == declared['members'] and len(declared['members']) == 26
        assert previous['identities'] == declared['identities'] and declared['kinds'] == previous['kinds'] == ['overlay']
        assert previous['editions'] == declared['editions'] == ['ra2']
        assert all(member in feedback['reopened'] for member in declared['members'])
        comparison = []
        for old, new in zip(predecessor['bundle']['members'], pack['families'][family]['members']):
            assert old['member'] == new['member']
            old_file = root / '.local/campaign/ra2' / mission['mission'][:-4] / old['manifest']
            assert sha(old_file.read_bytes()) == old['sha256']
            before_metadata, after_metadata = read(old_file), read(stage / 'pack' / new['path'])
            assert before_metadata['source'] == after_metadata['source']
            assert before_metadata['logical'] == after_metadata['logical'], 'Keep every original bridge slot and pivot'
            assert after_metadata['color']['bridgePlanarMaterial']['continuousDeck']['sha256'] == feedback['continuousMaterialSha256']
            comparison.append(dict(member=old['member'], nativeSourceAndLogicalGeometryUnchanged=True))
        for identity in declared['identities']:
            previous_roots[identity] = contract['identities']['ra2'][identity]
            assert previous_roots[identity] == predecessor['family']
    elif args.candidate_owner_predecessor:
        predecessor = read(args.candidate_owner_predecessor)
        previous = contract['families'][predecessor['family']]
        assert predecessor['family'].startswith('yr-task-')
        assert predecessor['mission'] == mission and predecessor['theater'] == theater
        assert previous['familyHash'] == predecessor['bundle']['familyHash']
        assert previous['members'] == declared['members'] and previous['identities'] == declared['identities']
        assert previous['kinds'] == declared['kinds'] == ['building']
        assert previous['editions'] == declared['editions'] == ['yr']
        ledger = read(root / 'docs/campaign-art/yr-v1/task-buildings.json')
        for identity in declared['identities']:
            entry, = [item for item in ledger['families'] if item['identity'] == identity
                and item['theater'] == theater]
            assert entry['userVisualAcceptance'] == 'PENDING', 'Accepted artwork requires explicit reopening'
            assert Path(root / entry['registration']).resolve() == args.candidate_owner_predecessor.resolve()
            previous_roots[identity] = contract['identities']['yr'][identity]
            assert previous_roots[identity] == predecessor['family']
        declared['sourceScope'] = copy.deepcopy(previous['sourceScope'])
        comparison = []
        def authored_masters(preparation):
            return sorted((item['preparation']['sourceSha256'], master['slot'], master['file'], master['sha256'])
                for item in preparation.get('stages', [dict(preparation=preparation)])
                for master in item['preparation']['masters'])
        assert authored_masters(predecessor['preparation']) == authored_masters(prepared)
        assert len(predecessor['bundle']['members']) == len(pack['families'][family]['members'])
        for old, new in zip(predecessor['bundle']['members'], pack['families'][family]['members']):
            assert old['member'] == new['member']
            old_file = root / '.local/campaign/yr' / mission['mission'][:-4] / old['manifest']
            assert sha(old_file.read_bytes()) == old['sha256']
            before_metadata, after_metadata = read(old_file), read(stage / 'pack' / new['path'])
            assert before_metadata['source'] == after_metadata['source']
            assert before_metadata['logical'] == after_metadata['logical']
            assert len(before_metadata['variants']) == len(after_metadata['variants'])
            assert {key: value for key, value in before_metadata['color']['authoredBody'].items()
                if key != 'ownerPaint'} == {key: value for key, value in after_metadata['color']['authoredBody'].items()
                if key != 'ownerPaint'}
            for before_variant, after_variant in zip(before_metadata['variants'], after_metadata['variants']):
                assert before_variant['density'] == after_variant['density']
                assert before_variant['frames'] == after_variant['frames']
                assert [(page['size'], page['baseSha256']) for page in before_variant['pages']] == [
                    (page['size'], page['baseSha256']) for page in after_variant['pages']]
            comparison.append(dict(member=old['member'], sourceAndGeometryUnchanged=True,
                everyBaseRgbaPageByteIdentical=True, ownerDataOnly=True))
    elif args.building_predecessor:
        predecessor = read(args.building_predecessor)
        previous = contract['families'][predecessor['family']]
        feedback = read(args.art_feedback)
        assert feedback['schema'] == 'yr-user-material-detail-reopening-v1'
        assert predecessor['mission'] == mission and predecessor['theater'] == theater
        assert previous['familyHash'] == predecessor['bundle']['familyHash']
        assert previous['members'] == declared['members'] and previous['identities'] == declared['identities']
        assert previous['kinds'] == declared['kinds'] == ['building']
        assert previous['editions'] == declared['editions'] == ['yr']
        for identity in declared['identities']:
            example, = [item for item in feedback['examples']
                if item['identity'] == identity and item['theater'] == theater]
            assert example['status'] == 'USER_ACCEPTED_FULL_RESOLUTION_NORMAL_BASIS_SHELL_LINE_LEGIBILITY_REFINEMENT'
            assert Path(example['registration']).resolve() == args.building_predecessor.resolve()
            assert example['registrationSha256'] == sha(args.building_predecessor.read_bytes())
            previous_roots[identity] = contract['identities']['yr'][identity]
            assert previous_roots[identity] == predecessor['family']
        declared['sourceScope'] = copy.deepcopy(previous['sourceScope'])
        comparison = []
        for old, new in zip(predecessor['bundle']['members'], pack['families'][family]['members']):
            assert old['member'] == new['member']
            old_file = root / '.local/campaign/yr' / mission['mission'][:-4] / old['manifest']
            assert sha(old_file.read_bytes()) == old['sha256']
            before_metadata, after_metadata = read(old_file), read(stage / 'pack' / new['path'])
            assert before_metadata['source'] == after_metadata['source']
            assert before_metadata['logical'] == after_metadata['logical']
            comparison.append(dict(member=old['member'], nativeSourceAndLogicalGeometryUnchanged=True))
    else:
        assert all(identity not in contract['identities'][edition] for identity in declared['identities'])
for name, source in addition['sources'].items():
    if name in contract['sources'] and contract['sources'][name] != source:
        assert args.owner_predecessor or edition == 'yr'
        old = previous.get('sourceOverrides', {}).get(name, contract['sources'][name]) if args.owner_predecessor else contract['sources'][name]
        assert old['remapable'] is False and source['remapable'] is True
        assert {**old, 'remapable': True} == source, 'Only the native ownership policy can change'
        if edition == 'yr':
            assert all(binding['kind'] == 'building' for original_source in original['sources']
                if original_source['member'] == name for binding in original_source['bindings'])
        declared.setdefault('sourceOverrides', {})[name] = source
    else:
        contract['sources'][name] = source
contract['families'][family] = declared
if not args.donor_only:
    for identity in declared['identities']:
        contract['identities'][edition][identity] = family

directory = root / '.local/campaign' / edition / mission['mission'][:-4]
assert sha((directory / mission['mission']).read_bytes()) == mission['sha256']
campaign_file = directory / 'manifest.json'
campaign = read(campaign_file)
assert campaign['mission'] == mission['mission'] and campaign['edition'] == edition
retired_routes = retire_bridge_predecessor_routes(campaign, directory, predecessor) if args.bridge_predecessor else []
files, payloads, members = [], {}, []

def add(name, payload):
    assert name not in payloads and not (directory / name).exists()
    assert all(file['name'] != name for file in campaign['files'])
    payloads[name] = payload
    files.append(dict(name=name, bytes=len(payload), sha256=sha(payload),
        route=f"/local-campaign/{edition}/{mission['mission'][:-4]}/{name}"))

for member in pack['families'][family]['members']:
    metadata_file = stage / 'pack' / member['path']
    assert sha(metadata_file.read_bytes()) == member['sha256']
    metadata = copy.deepcopy(read(metadata_file))
    source = addition['sources'][member['member']]
    assert metadata['source']['sha256'] == source['sha256']
    assert len(metadata['logical']['frames']) == source['bodyFrames']
    assert sorted(variant['density'] for variant in metadata['variants']) == [2, 4]
    stem = member['member'].replace('.', '-')
    for variant in metadata['variants']:
        for page in variant['pages']:
            for role in ['base', 'data']:
                payload = (metadata_file.parent / str(variant['density']) / page['id'] / (role + '.png')).read_bytes()
                assert sha(payload) == page[role + 'Sha256'] and len(payload) == page[role + 'Bytes']
                name = f"{args.revision}-{stem}-{variant['density']}-{page['id']}-{role}.png"
                add(name, payload)
                page[role] = name
    name = f'{args.revision}-{stem}.json'
    add(name, encode(metadata))
    members.append(dict(member=member['member'], manifest=name, sha256=files[-1]['sha256']))
bundle = dict(schema='campaign-environment-extension-v1', identity=family, familyHash=declared['familyHash'],
    mission=mission['mission'], theater=theater, revision=args.revision, members=members,
    acceptance='DIRECTION_ACCEPTED_COMPLETE_NATIVE_RUNTIME_AND_USER_VISUAL_REVIEW_PENDING')
if edition == 'yr':
    bundle.update(edition='yr', acceptance='FAITHFUL_DIRECTION_AUTHORIZED_COMPLETE_NATIVE_RUNTIME_AND_USER_VISUAL_REVIEW_PENDING')
add('environment-family-' + args.revision + '.json', encode(bundle))
assert not args.receipt.exists()
for name, payload in payloads.items():
    with (directory / name).open('xb') as output:
        output.write(payload)
campaign['files'].extend(files)
assert len(campaign['files']) <= 256, 'Keep the bounded active campaign catalog; retain inactive payloads outside its route list'
campaign_file.write_bytes(encode(campaign))
contract_file.write_bytes(encode(contract))
args.receipt.write_bytes(encode(dict(status='COMPLETE_FAMILY_REGISTERED_NATIVE_AND_USER_REVIEW_PENDING',
    family=family, mission=mission, theater=theater, stage=str(stage), preparation=prepared,
    sourceVerification=verification, internalVisualInspection=inspection, bundle=bundle, files=files,
    contractBeforeSha256=sha(before), contractAfterSha256=sha(contract_file.read_bytes()),
    existingRootSelectorChanges={} if args.donor_only else previous_roots, acceptedPayloadsReplaced=0,
    ownershipCorrection=dict(previousReceipt=str(args.owner_predecessor),
        previousReceiptSha256=sha(args.owner_predecessor.read_bytes()), comparison=comparison,
        donorOnly=args.donor_only, oldFamilyRetained=True) if args.owner_predecessor else None,
    artCorrection=dict(previousReceipt=str(args.art_predecessor),
        previousReceiptSha256=sha(args.art_predecessor.read_bytes()), feedback=str(args.art_feedback),
        feedbackSha256=sha(args.art_feedback.read_bytes()), oldFamilyRetained=True,
        approvedMaterialMastersAndNativeLogicalGeometryUnchanged=True) if args.art_predecessor else None,
    bridgeCorrection=dict(previousReceipt=str(args.bridge_predecessor), feedback=str(args.art_feedback),
        feedbackSha256=sha(args.art_feedback.read_bytes()), oldFamilyRetained=True,
        sourceGeometryComparison=comparison, inactiveRoutesRetired=retired_routes,
        inactivePayloadsRetained=True) if args.bridge_predecessor else None,
    buildingRefinement=dict(previousReceipt=str(args.building_predecessor),
        previousReceiptSha256=sha(args.building_predecessor.read_bytes()), feedback=str(args.art_feedback),
        feedbackSha256=sha(args.art_feedback.read_bytes()), oldFamilyAndPayloadsRetained=True,
        sourceGeometryComparison=comparison) if args.building_predecessor else None,
    candidateOwnerRefinement=dict(previousReceipt=str(args.candidate_owner_predecessor),
        previousReceiptSha256=sha(args.candidate_owner_predecessor.read_bytes()),
        sourceGeometryComparison=comparison, previousFamilyAndPayloadsRetained=True)
        if args.candidate_owner_predecessor else None,
    policy='Independent densities, original shadows/state timing and existing fixed budgets; complete-family fallback retained.')))
print(json.dumps(dict(family=family, files=len(files), receipt=str(args.receipt))))
