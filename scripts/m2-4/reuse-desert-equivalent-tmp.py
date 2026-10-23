"""Repack accepted pixels only for five fully equivalent Desert source families."""
import copy
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


base = Path('.artifacts/m2-4')
root = base / 'desert-equivalent-tmp-reuse-v1'
root.mkdir(exist_ok=False)
audit_file = base / 'remaining-tmp-three-donor-audit-v1.json'
audit = read(audit_file)
sets = [35, 38, 40, 47, 76]
rows = [row for row in audit['rows'] if row['theater'] == 'DESERT' and row['set'] in sets]
assert len(rows) == 11
donor_pointer = next(donor['selectedPack'] for donor in audit['donors'] if donor['theater'] == 'TEMPERATE')
assert read(Path('.local/terrain-selection.json')) == donor_pointer
donor_root = Path('.local/terrain-packs') / donor_pointer['revision']
assert sha(donor_root / 'manifest.json') == donor_pointer['sha256']
donor = read(donor_root / 'manifest.json')
inventory_file = base / 'inventory-desert-after-batch75-v1/inventory.json'
inventory = read(inventory_file)
assert sha(inventory_file) == next(row['sha256'] for row in audit['inventories'] if row['theater'] == 'DESERT')
wanted = {row['member'] for row in rows}
all_missing = [row for row in inventory['resourceGroups'] if row['kind'] == 'tmp'
    and 'MISSING_AUTHORED_FAMILY' in row['decisions'] and row['member'] in wanted]
assert {row['member'] for row in all_missing} == wanted
native_root = base / 'desert-native-v1'
sources = [source for source in read(native_root / 'source.json')['sources']
    if source['member'] in wanted and source['format'] == 'tmp']
assert len(sources) == 11 and len({source['key'] for source in sources}) == 11
for number in sets:
    actual = {row['source']['member'] for row in inventory['rows'] if row['kind'] == 'tmp' and row['set'] == number}
    assert actual == {source['member'] for source in sources if source['setIndex'] == number}, 'No partial set reuse'
(root / 'native').symlink_to((native_root / 'native').resolve(), target_is_directory=True)
write(root / 'source.json', dict(schema='m2-4-source-equivalent-native-guides-v1', theater='DESERT',
    inventoryFile=str(inventory_file), inventorySha256=sha(inventory_file), sources=sources,
    reusedNativeSource=str(native_root / 'source.json'), reusedNativeSourceSha256=sha(native_root / 'source.json')))
prior = read(Path('.local/terrain-desert-selection.json'))
prior_root = Path('.local/terrain-packs') / prior['revision']
assert sha(prior_root / 'manifest.json') == prior['sha256']
revision = 'desert-m2-4-equivalent-tmp-reuse-v1'
pack_root = Path('.local/terrain-packs') / revision
pack_root.mkdir(exist_ok=False)
pack = copy.deepcopy(read(prior_root / 'manifest.json'))
assert len(pack['groups']) == 14
pack['revision'] = revision
for group in pack['groups']:
    for variant in group['variants']:
        assert sha(prior_root / variant['file']) == variant['sha256']
        shutil.copyfile(prior_root / variant['file'], pack_root / variant['file'])
        assert sha(pack_root / variant['file']) == variant['sha256']
cache, proofs = {}, []
for number in sets:
    selected = sorted((source for source in sources if source['setIndex'] == number), key=lambda source: source['member'])
    group = dict(id=f'm2-4-desert-equivalent-set{number}', scope='COMPLETE_SCOPED_ORIGINAL_SET_ACCEPTED_PIXEL_REUSE',
        members=[], variants=[])
    for source in selected:
        assert sha(native_root / 'native' / source['nativeFile']) == source['sha256']
        matches = [row for row in rows if row['member'] == source['member'] and row['sourceSha256'] == source['sha256']]
        assert len(matches) == 1
        proof = next(item for item in matches[0]['comparisons'] if item['theater'] == 'TEMPERATE')
        assert proof['status'] == 'EXACT_ORIGINAL_EQUIVALENCE_ONLY'
        assert {case['edition'] for case in proof['editions']} == {'ra2', 'yr'}
        assert all(not case['differences'] for case in proof['editions'])
        donor_group = next(item for item in donor['groups'] if item['id'] == proof['group'])
        donor_member = next(item for item in donor_group['members'] if item['member'] == proof['member'])
        metadata = [{key: value for key, value in image.items() if key not in
            ['nativeOffset', 'size', 'file', 'rgbaSha256']} for image in source['images']]
        expected = [{**image, 'member': source['member']} for image in donor_member['images']]
        assert metadata == expected
        group['members'].append(dict(member=source['member'], sourceHashes={edition: source['sha256']
            for edition in ['ra2', 'yr']}, images=metadata))
        proofs.append(dict(member=source['member'], set=number, donorMember=proof['member'], donorGroup=proof['group'],
            sourceSha256=source['sha256'], completeEquivalence=proof, densityFrames=[]))
    for density in [2, 4]:
        pieces = []
        for source in selected:
            proof = next(record for record in proofs if record['member'] == source['member'])
            donor_group = next(item for item in donor['groups'] if item['id'] == proof['donorGroup'])
            variant = next(item for item in donor_group['variants'] if item['density'] == density)
            donor_file = donor_root / variant['file']
            if str(donor_file) not in cache:
                assert sha(donor_file) == variant['sha256']
                cache[str(donor_file)] = Image.frombytes('RGBA', tuple(variant['size']), donor_file.read_bytes())
            offset = 0
            for member in donor_group['members']:
                if member['member'] == proof['donorMember']:
                    break
                offset += len(member['images'])
            for index, source_image in enumerate(source['images']):
                x, y, width, height = variant['rects'][offset+index]
                crop = cache[str(donor_file)].crop((x, y, x+width, y+height))
                assert crop.size == tuple(value*density for value in source_image['logical'])
                native_file = native_root / 'native' / source_image['file']
                assert sha(native_file) == source_image['rgbaSha256']
                original = Image.frombytes('RGBA', tuple(source_image['logical']), native_file.read_bytes())
                enlarged = original.resize(crop.size, Image.Resampling.NEAREST)
                assert np.array_equal(np.asarray(crop)[..., 3], np.asarray(enlarged)[..., 3])
                if source_image['nativeOffset'] <= 0:
                    assert crop.tobytes() == enlarged.tobytes()
                pieces.append(crop)
                proof['densityFrames'].append(dict(density=density, subTile=index, donorFile=str(donor_file),
                    donorSha256=variant['sha256'], donorRect=[x, y, width, height],
                    pixelsSha256=hashlib.sha256(crop.tobytes()).hexdigest(), pixelsUnchanged=True))
        atlas_width, x, y, row_height, rects = 2048, 2, 2, 0, []
        for piece in pieces:
            assert piece.width+4 <= atlas_width
            if x+piece.width+2 > atlas_width:
                x, y, row_height = 2, y+row_height+4, 0
            rects.append([x, y, piece.width, piece.height])
            x += piece.width+4
            row_height = max(row_height, piece.height)
        atlas = Image.new('RGBA', (atlas_width, y+row_height+2))
        for piece, rect in zip(pieces, rects, strict=True):
            atlas.paste(piece, tuple(rect[:2]))
        file = f'{group["id"]}-{density}x.rgba'
        (pack_root / file).write_bytes(atlas.tobytes())
        # Independent publication receipts preserve every accepted crop exactly.
        decoded = Image.frombytes('RGBA', atlas.size, (pack_root / file).read_bytes())
        for piece, rect in zip(pieces, rects, strict=True):
            x, y, width, height = rect
            assert decoded.crop((x, y, x+width, y+height)).tobytes() == piece.tobytes()
            assert not decoded.crop((x-2, y-2, x+width+2, y)).getbbox()
            assert not decoded.crop((x-2, y+height, x+width+2, y+height+2)).getbbox()
            assert not decoded.crop((x-2, y, x, y+height)).getbbox()
            assert not decoded.crop((x+width, y, x+width+2, y+height)).getbbox()
        group['variants'].append(dict(density=density, file=file, size=list(atlas.size),
            rects=rects, sha256=sha(pack_root / file)))
    pack['groups'].append(group)
assert len(pack['groups']) == 19
write(pack_root / 'manifest.json', pack)
pointer = dict(schemaVersion=1, revision=revision, sha256=sha(pack_root / 'manifest.json'))
write(root / 'static-closure-v1.json', dict(status='PASS_COMPLETE_SOURCE_EQUIVALENCE_ACCEPTED_PIXELS_NATIVE_ALPHA_AND_GUTTERS',
    selectedPack=pointer, priorTerrain=prior, acceptedDonor=donor_pointer,
    audit=dict(file=str(audit_file), sha256=sha(audit_file)), newFamilies=5, newMembers=11,
    exactPreservedPriorGroups=14, members=proofs, windows='NOT_RUN', native='PENDING',
    visual='ACCEPTED_ART_REUSE_NO_NEW_ARTWORK', selection='NOT_SELECTED',
    note='Twelve equivalent paved-road members remain unselected until their eight different sibling members '
        'have authored detail and complete set20 can publish. No rejected road mothers are selected.'))
print(json.dumps(dict(pack=pointer, completeFamilies=5, members=11, newArtwork=False, selected=False)))
