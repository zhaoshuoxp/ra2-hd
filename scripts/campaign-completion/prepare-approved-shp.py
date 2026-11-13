"""Prepare hash-pinned authored states for the existing native SHP exporter."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('recipe', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'scripts/m2'))
from showcase_body_reuse import accepted_body_frames
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
write = lambda file, value: file.write_text(json.dumps(value, indent=2) + '\n')
recipe = read(args.recipe)
if 'baseRecipe' in recipe:
    reference = recipe['baseRecipe']
    base_recipe = (root / reference['file']).resolve()
    assert sha(base_recipe) == reference['sha256']
    inherited = read(base_recipe)
    assert 'baseRecipe' not in inherited, 'Keep recipe inheritance one level deep'
    recipe = {**inherited, **recipe}
source_file = (root / recipe['source']).resolve()
assert sha(source_file) == recipe['sourceJsonSha256']
original = read(source_file)
assert original['mission'] == recipe['mission'] and original['missionSha256'] == recipe['missionSha256']
source = next(row for row in original['sources'] if row['identity'] == recipe['identity'])
assert source['format'] == 'shp' and source['sha256'] == recipe['sourceSha256']
assert sha(source_file.parent / 'native' / source['member']) == source['sha256']
assert recipe['kind'] in ('building', 'terrain', 'overlay', 'animation')
if 'nativeObjectType' in source:
    assert original['nativeRegistryQualification']['schema'] == 'retail-shp-object-kind-v1'
    assert source['nativeKind'] == recipe['kind']
    assert source['nativeObjectType'] == {'building': 2, 'overlay': 4, 'terrain': 6, 'animation': 8}[recipe['kind']]
if recipe['kind'] == 'animation':
    assert source['bindingRole'] == 'DESTROY_ANIMATION'
    assert source['identity'] in source['parentRules']['DestroyAnim'].split(',')
approval_file = root / 'docs/campaign-art/user-direction-approvals-20261028.json'
edition = recipe.get('edition', 'ra2')
assert edition in ('ra2', 'yr')
if edition == 'yr':
    authorization_file = (root / recipe['authorization']['file']).resolve()
    assert sha(authorization_file) == recipe['authorization']['sha256']
    authorization = read(authorization_file)
    assert authorization['schema'] == 'yr-campaign-art-direction-authorization-v1'
    assert authorization['faithfulReconstructionAuthorized'] is True
    assert original['edition'] == 'yr' and original['mission'] in authorization['missions']
    direction = dict(directionAuthorization=recipe['authorization'], userVisualAcceptance='PENDING')
else:
    approval = next(row for row in read(approval_file)['records']
                    if row['questionItemId'] == recipe['questionItemId'] and row['sha256'] == recipe['approvedSampleSha256'])
    assert sha((root / approval['sample']).resolve()) == approval['sha256']
    direction = dict(directionApproval=recipe['questionItemId'])

stage = args.output.resolve()
stage.mkdir(exist_ok=False)
prepared, authoring = stage / 'prepared', stage / 'authoring'
native = prepared / 'native'
native.mkdir(parents=True)
authoring.mkdir()
for palette in [source['palette'], *source.get('framePalettes', {}).values()]:
    file = source_file.parent / 'native' / palette['member']
    assert sha(file) == palette['sha256']
    shutil.copyfile(file, native / file.name)
for frame in source['frames']:
    stem = f"{source['member']}-{frame['slot']}"
    index = source_file.parent / 'native' / (stem + '.index')
    assert sha(index) == frame['indexSha256']
    shutil.copyfile(index, native / index.name)
    rgba = b'' if frame['empty'] else Image.open(source_file.parent / 'native' / frame['png']).convert('RGBA').tobytes()
    file = native / (stem + '.rgba')
    file.write_bytes(rgba)
    frame.update(file=file.name, rgbaSha256=sha(file), indexFile=index.name)
source['bindings'] = [dict(identity=recipe['identity'], kind=recipe['kind'], role=source.get('bindingRole', 'body'),
    nativeRules=source['nativeRules'], nativeArt=source['nativeArt'],
    **(dict(damagedNativeArt=source['damagedNativeArt']) if source.get('damagedNativeArt') else {}))]
write(prepared / 'source.json', {**original, 'sources': [source]})
descriptor = {key: source[key] for key in ['sha256', 'canvas', 'totalFrames', 'bodyFrames',
                                          'palette', 'hasShadow', 'remapable', 'framePalettes']}
identity = recipe['family']
basis = dict(theater=original['theater'], members={source['member']: descriptor}, identities=[recipe['identity']])
family_hash = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
write(stage / 'contract.json', dict(schema='environment-shp-source-contract-v1', theater=original['theater'],
    sources={source['member']: descriptor}, families={identity: dict(members=[source['member']],
    identities=[recipe['identity']], editions=[edition], kinds=[recipe['kind']], familyHash=family_hash,
    sourceScope=dict(campaignSources=[dict(mission=original['mission'], sha256=original['missionSha256'],
        **(dict(edition='yr') if edition == 'yr' else {}))]))},
    identities={name: {recipe['identity']: identity} if name == edition else {} for name in ['ra2', 'yr']}))

reuse = recipe.get('acceptedNativeBodyFrames', {})
assert set(reuse).issubset({source['member']})
reused_slots = reuse.get(source['member'], {}).get('slots', [])
markers = recipe.get('nativePaletteMarkerFrames', {})
assert set(markers).issubset({source['member']})
marker_slots = markers.get(source['member'], {}).get('frames', {})
slots, membership, duplicates, masters = {}, [], {}, []
for frame in source['frames'][:source['bodyFrames']]:
    number = frame['slot']
    palette = source.get('framePalettes', {}).get(str(number), source['palette'])
    signature = (frame['indexSha256'], *frame['size'], palette['sha256'],
        palette.get('remapable', source['remapable']))
    if str(number) in marker_slots:
        assert source.get('bindingRole') == 'ACTIVE' and number >= int(source['nativeArt']['LoopEnd'])
        assert int(source['nativeArt'].get('LoopCount', '1')) == -1
        declaration = markers[source['member']]
        assert declaration['sourceSha256'] == source['sha256'] and declaration['indices'] == [1]
        assert marker_slots[str(number)] == frame['indexSha256']
        indices = np.frombuffer((native / frame['indexFile']).read_bytes(), np.uint8)
        assert 1 in indices and set(indices).issubset({0, 1})
        membership.append(dict(slot=number, status='RETAINED_ORIGINAL_UNUSED_PALETTE_MARKER'))
        continue
    if number in reused_slots:
        membership.append(dict(slot=number, status='EXACT_RENDERED_ACCEPTED_BODY_DONOR'))
        continue
    if signature in duplicates:
        membership.append(dict(slot=number, status='EXACT_NATIVE_DUPLICATE', canonical=duplicates[signature]))
        continue
    duplicates[signature] = number
    assert not frame['empty'], 'An empty body needs an explicit export policy'
    declaration = recipe['masters'][str(number)]
    master = (root / declaration['file']).resolve()
    assert sha(master) == declaration['sha256']
    image = Image.open(master).convert('RGBA')
    assert image.getchannel('A').getextrema()[0] == 0, 'A sprite master must have real transparency'
    indices = np.frombuffer((native / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
    body = indices != 0 if recipe['kind'] == 'animation' else (indices != 0) & (indices != 12)
    bounds = Image.fromarray(body.astype(np.uint8) * 255).getbbox()
    assert bounds, 'A contact-only body needs its explicit native policy'
    key = f"{source['member']}-{number:03d}"
    slots[key] = dict(member=source['member'], nativeSlot=number, nativeBounds=list(bounds),
        kind=recipe['kind'], group=recipe['kind'], nativeMetadata=frame, sourceSha256=source['sha256'],
        board=str(master), boardSize=list(image.size), slotRect=[0, 0, *image.size], occupied=1,
        rejectFluorescentFringe=True)
    guard = declaration.get('exteriorDarkMatteExtrusion')
    if guard:
        assert guard['masterRgbaSha256'] == hashlib.sha256(image.tobytes()).hexdigest()
        slots[key]['exteriorDarkMatteExtrusion'] = guard
    membership.append(dict(slot=number, key=key, status='AWAITING_AUTHORED_SLOT'))
    masters.append(dict(slot=number, file=str(master), sha256=sha(master)))
write(authoring / 'worklist.json', dict(schema='m2-2-shp-native-slot-worklist-v1',
    preparedSourceSha256=sha(prepared / 'source.json'), slots=slots,
    members=[dict(member=source['member'], sourceSha256=source['sha256'], palette=source['palette'],
        bodyCount=source['bodyFrames'], totalNativeSlots=source['totalFrames'], slots=membership,
        shadowPolicy='Unchanged original separate shadow slots; never generated body shadows')], batches=[]))
regions = recipe.get('authoredRegionRegistration', {})
assert set(regions).issubset({source['member']})
profile = dict(authoredRegionRegistration=regions)
if recipe.get('authoredOwnerPaint'):
    assert edition == 'yr' and recipe['kind'] == 'building'
    sys.path.insert(0, str(root / 'scripts/yr-campaign'))
    from owner_paint import owner_paint_declaration
    profile['sourcePinnedAuthoredOwnerPaint'] = {
        source['member']: owner_paint_declaration(source, recipe['authoredOwnerPaint'])}
if markers:
    profile['nativePaletteMarkerFrames'] = markers
assembly = recipe.get('sourcePinnedComponentAssembly', {})
assert set(assembly).issubset({source['member']})
if assembly:
    assert recipe['kind'] == 'building' and not source['remapable'] and not regions
    profile['sourcePinnedComponentAssembly'] = assembly
pyramid = recipe.get('sourcePinnedPyramid')
if pyramid:
    assert edition == 'yr' and recipe['kind'] == 'building'
    assert source['identity'] in ['CAEGYP01', 'CAEGYP04', 'CAEGYP05']
    assert set(pyramid) == {source['member']} and source['bodyFrames'] == 4
    assert not any(16 <= index <= 31 for frame in source['frames'][:3]
        for index in (native / frame['indexFile']).read_bytes())
    profile['sourcePinnedPyramid'] = pyramid
if reuse:
    profile['acceptedNativeBodyFrames'] = reuse
body_material = recipe.get('bodyIndex12Material', {})
assert set(body_material).issubset({source['member']})
if body_material:
    assert recipe['kind'] == 'building' and (source['hasShadow'] or source.get('bindingRole') == 'ACTIVE')
    profile['bodyIndex12Material'] = body_material
curved = recipe.get('curvedArchRegistration')
if curved:
    assert set(curved['masters']) == set(recipe['masters'])
    declaration = {**curved, 'masters': {slot: {**registration,
        'file': str((root / recipe['masters'][slot]['file']).resolve()),
        'sha256': recipe['masters'][slot]['sha256']} for slot, registration in curved['masters'].items()}}
    profile['sourcePinnedCurvedArchRegistration'] = {source['member']: declaration}
rubble = recipe.get('authoredRubbleRegistration')
if rubble:
    assert recipe['kind'] == 'building' and set(recipe['masters']) == {'3'}
    assert reused_slots == [0, 1, 2], 'Authored rubble requires pinned accepted body states'
    master = recipe['masters']['3']
    image = Image.open((root / master['file']).resolve()).convert('RGBA')
    declaration = {**rubble, 'sourceSha256': source['sha256'],
        'indexSha256': source['frames'][3]['indexSha256'],
        'paletteSha256': source['framePalettes']['3']['sha256'],
        'master': str((root / master['file']).resolve()), 'masterSha256': master['sha256'],
        'masterRgbaSha256': hashlib.sha256(image.tobytes()).hexdigest()}
    profile['sourcePinnedAuthoredRubbleContours'] = {source['member']: declaration}
authored_terrain = recipe.get('authoredTerrainContours')
authored_scenery = recipe.get('authoredSceneryContours')
assert not (authored_terrain and authored_scenery)
if authored_terrain:
    assert recipe['kind'] == 'terrain' and set(recipe['masters']) == {'0'}
    assert not regions and not curved and not rubble and not reuse
    master = recipe['masters']['0']
    file = (root / master['file']).resolve()
    image = Image.open(file).convert('RGBA')
    profile['sourcePinnedAuthoredTerrainContours'] = {source['member']: {**authored_terrain,
        'sourceSha256': source['sha256'], 'indexSha256': source['frames'][0]['indexSha256'],
        'paletteSha256': source['palette']['sha256'], 'master': str(file),
        'masterSha256': master['sha256'], 'masterRgbaSha256': hashlib.sha256(image.tobytes()).hexdigest()}}
elif authored_scenery:
    assert edition == 'yr' and recipe['kind'] in ['terrain', 'overlay'] and set(recipe['masters']) == {'0'}
    if recipe['kind'] == 'overlay':
        assert original['theater'] == 'NEWURBAN' and source['identity'] in ['TROCK03', 'SROCK05']
    assert not regions and not curved and not rubble and not reuse
    assert source['bodyFrames'] == 1 and source['totalFrames'] == 2 and source['hasShadow']
    assert not source['remapable'] and not source.get('framePalettes')
    assert authored_scenery == dict(schema='yr-source-pinned-authored-scenery-v1',
        alphaCutoff=180, rejectFluorescentFringe=True)
    master = recipe['masters']['0']
    file = (root / master['file']).resolve()
    image = Image.open(file).convert('RGBA')
    profile['sourcePinnedAuthoredScenery'] = {source['member']: {**authored_scenery,
        'sourceSha256': source['sha256'], 'indexSha256': source['frames'][0]['indexSha256'],
        'paletteSha256': source['palette']['sha256'], 'master': str(file),
        'masterSha256': master['sha256'], 'masterRgbaSha256': hashlib.sha256(image.tobytes()).hexdigest()}}
elif recipe['kind'] == 'building':
    profile['nativeStructuralCoverage'] = dict(schema='native-structural-subpixel-coverage-v1',
        toleranceNativePixels=.7, maximumContourAreaChangeFraction=.025, stairCornerCutNativePixels=.5,
        maximumShortStairRunNativePixels=8, tinyContourAreaPreserved=4, supersamplesPerOutputAxis=8)
else:
    # Non-building outlines require an explicit source/theater/palette/body
    # admission. Never broaden the accepted historical building profile.
    admission = dict(schema='source-pinned-structural-contours-v1', theater=original['theater'],
        kind=recipe['kind'], sourceSha256=source['sha256'], paletteSha256=source['palette']['sha256'],
        bodyIndexSha256=[frame['indexSha256'] for frame in source['frames'][:source['bodyFrames']]])
    if recipe.get('continuousDiagonalBodyContours'):
        assert recipe['kind'] == 'terrain' and not source['remapable']
        assert source['bodyFrames'] == 1 and source['hasShadow']
        admission.update(schema='source-pinned-structural-contours-v2', continuousDiagonalBody=True)
    assert recipe.get('sourcePinnedContourAdmission') == admission
    profile['sourcePinnedStructuralCoverage'] = {source['member']: admission}
if reuse:
    accepted = accepted_body_frames(profile, {source['member']: source})
    assert set(accepted[source['member']]) == {(number, density) for number in reused_slots for density in [2, 4]}
write(stage / 'material-profile.json', profile)
write(stage / 'preparation.json', dict(status='PREPARED_NATIVE_REGISTRATION_AND_RUNTIME_PENDING',
    recipe=str(args.recipe.resolve()), recipeSha256=sha(args.recipe), originalSourceJsonSha256=recipe['sourceJsonSha256'],
    sourceSha256=source['sha256'], masters=masters, **direction,
    **(dict(acceptedBodyFrames=reuse) if reuse else {}),
    qualification='Only original guides are converted. Authored masters are referenced without copying or modification. Complete state coverage, independent exports, alpha/geometry and runtime acceptance require subsequent verification.'))
print(json.dumps(dict(family=identity, slots=len(slots), bodyFrames=source['bodyFrames'], output=str(stage))))
