"""Verify a complete task NPC pack and append exact original campaign routes."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('identity', choices=['CAML', 'EINS', 'MUMY', 'RMNV', 'PENTGEN', 'DNOB'])
parser.add_argument('worklist', type=Path)
parser.add_argument('staged', type=Path)
parser.add_argument('inspection', type=Path)
parser.add_argument('receipt', type=Path)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, indent=2)+'\n'
work, manifest = read(args.worklist), read(args.staged/'manifest.json')
member, = work['families'][args.identity]['members']
source_file = Path(member['sourceFile'])
source, inspection = read(source_file), read(args.inspection)
assert source['schema'] == 'yr-original-task-infantry-slots-v1' and source['identity'] == args.identity
assert source['sha256'] == member['sourceSha256'] == manifest['source']['sha256']
assert manifest['rulesIdentities'] == [args.identity]
assert manifest['provenance']['inspectionSha256'] == sha(args.inspection)
assert manifest['provenance']['worklistSha256'] == sha(args.worklist)
assert inspection['status'] == 'PASS_INTERNAL_COMPLETE_NPC_DENSITY_EXPORT_INSPECTION'
assert inspection['identity'] == args.identity and inspection['completeSourceCoverage']
assert inspection['nativePoses'] == source['bodyFrames'] == member['requiredSlots']
assert inspection['manifestSha256'] == manifest['provenance']['reviewSha256']
logical = [dict(nativeFrame=i, trimOrigin=[f['x'], f['y']], trimSize=[f['width'], f['height']],
    legacyRenderSize=[f['width']+f['width']%2, f['height']+f['height']%2], empty=f['empty'])
    for i, f in enumerate(source['frames'][:source['bodyFrames']])]
assert manifest['logical'] == dict(canvas=source['canvas'], frames=logical)
assert sorted(variant['density'] for variant in manifest['variants']) == [2, 4]
neutral = not any(16 <= pixel <= 31 for frame in source['frames'][:source['bodyFrames']]
    for pixel in frame['pixels'])
for variant in manifest['variants']:
    assert [frame['nativeFrame'] for frame in variant['frames']] == list(range(source['bodyFrames']))
    for page in variant['pages']:
        for role in ['base', 'data'] + (['map'] if 'map' in page else []):
            file = args.staged/page[role]
            assert sha(file) == page[role+'Sha256'] and file.stat().st_size == page[role+'Bytes']
            assert list(Image.open(file).size) == page['mapSize' if role == 'map' else 'size']
        if neutral:
            assert not np.asarray(Image.open(args.staged/page['data']))[..., 0].any()
pack_id, revision = manifest['packId'], manifest['packRevision']
assert pack_id == 'yr-task-npc-'+args.identity.lower()
assert revision.replace('-', '').isalnum()
pack_path = Path('hd-packs')/pack_id/revision
family_path = Path('hd-packs')/(pack_id+'-family')/revision/'family.json'
theater = source['sourceContexts'][0]['theater']
family = dict(schemaVersion=1, identity=args.identity, edition='yr', theater=theater, revision=revision,
    members=[dict(member=source['member'], packId=pack_id, revision=revision,
        sha256=sha(args.staged/'manifest.json'), sourceSha256=source['sha256'], frames=source['bodyFrames'])],
    projectiles=[], sourceScopes=source['sourceContexts'], originalShadowRendering=source['originalShadowRendering'])
family_bytes = encode(family).encode()
family_hash = hashlib.sha256(family_bytes).hexdigest()
contract = dict(identity=args.identity, edition='yr', authoringTheater=theater,
    hash=family_hash, familyHash=family_hash, familyPath=str(family_path),
    members=[dict(member=source['member'], sourceHash=source['sha256'],
        frames=source['bodyFrames'], totalFrames=len(source['frames']), canvas=source['canvas'],
        manifestHash=sha(args.staged/'manifest.json'))], projectiles=[])
scopes = []
for context in source['sourceContexts']:
    assert context['source']['sha256'] == source['sha256']
    campaigns = []
    for mission in context['missions']:
        file = ROOT/'.local/campaign/yr'/Path(mission).stem/mission
        recorded, = [item for item in work['families'][args.identity]['sourceCampaigns']
            if item['mission'] == mission]
        assert sha(file) == recorded['sha256']
        campaigns.append(dict(mission=mission, sha256=recorded['sha256']))
    scopes.append(dict(identity=args.identity, edition='yr', theater=context['theater'],
        familyHash=family_hash, unitPalette=source['paletteIdentity'], campaignSources=campaigns))
catalog_file = ROOT/'desktop/yr-campaign-npc-contracts.json'
catalog = read(catalog_file)
assert args.identity not in catalog['shp'] and not any(scope['identity'] == args.identity
    for scope in catalog['sourceScopes'])
assert not args.receipt.exists()
receipt = dict(schema='yr-complete-task-npc-registration-v1',
    status='REGISTERED_COMPLETE_SOURCE_EXPORTS_NATIVE_PENDING' if args.apply else 'VERIFIED_UNSELECTED_NATIVE_PENDING',
    identity=args.identity, sourceSlotsSha256=sha(source_file), worklistSha256=sha(args.worklist),
    inspectionSha256=sha(args.inspection), manifestSha256=sha(args.staged/'manifest.json'),
    priorCatalogSha256=sha(catalog_file), contract=contract, scopes=scopes,
    independentDensityFrames=source['bodyFrames']*2, originalSeparateShadowSlots=source['bodyFrames'],
    originalShadowRendering=source['originalShadowRendering'], neutralColors=neutral,
    acceptedPayloadsReplaced=0, globalTheaterEligibility=[], registered=args.apply,
    nativeRuntime='PENDING', userVisualAcceptance='PENDING', windows='NOT_RUN_ON_THIS_MAC')
if args.apply:
    assert not (ROOT/'.local'/pack_path).exists() and not (ROOT/'.local'/family_path).exists()
    shutil.copytree(args.staged, ROOT/'.local'/pack_path)
    (ROOT/'.local'/family_path).parent.mkdir(parents=True, exist_ok=True)
    (ROOT/'.local'/family_path).write_bytes(family_bytes)
    updated = dict(catalog, shp={**catalog['shp'], args.identity: contract},
        sourceScopes=catalog['sourceScopes']+scopes)
    temporary = catalog_file.with_suffix('.json.tmp')
    temporary.write_text(encode(updated))
    temporary.replace(catalog_file)
args.receipt.write_text(encode(receipt))
print(json.dumps(dict(status=receipt['status'], identity=args.identity,
    densityFrames=receipt['independentDensityFrames'], sourceContexts=len(scopes),
    sourceMissions=sum(len(scope['campaignSources']) for scope in scopes))))
