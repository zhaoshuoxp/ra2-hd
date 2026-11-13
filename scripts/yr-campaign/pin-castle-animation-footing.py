"""Register authored castle states by their stationary foundation, not smoke bounds."""
import copy
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
sha = lambda data: hashlib.sha256(data).hexdigest()
directory = root / '.local/campaign/yr/sov07tmd'
contract_file = root / 'desktop/environment-hd-contract.json'
campaign_file = directory / 'manifest.json'
contract, campaign = read(contract_file), read(campaign_file)
old_body = read(directory / 'yr-transylvania-castle-r2-cttran03-shp.json')
inspection = root / '.artifacts/yr-campaign/castle-footing-r3'
inspection.mkdir(exist_ok=False)


def footing(image):
    mask = (np.array(image.getchannel('A')) > 128).astype(np.uint8)
    _, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    mask = labels == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    yy, xx = np.nonzero(mask)
    lower = yy > yy.min() + (yy.max()-yy.min())*.48
    xx, yy = xx[lower], yy[lower]
    left, right = xx.min(), xx.max()
    width = right-left
    lx = [left, np.median(yy[xx <= left+max(1, width*.004)])]
    rx = [right, np.median(yy[xx >= right-max(1, width*.004)])]
    bx = left+width*.42
    by = yy[np.abs(xx-bx) <= max(1, width*.008)].max()
    return np.array([lx, rx, [bx, by]], dtype=float)


def full_frame(metadata, density, slot):
    variant = next(v for v in metadata['variants'] if v['density'] == density)
    frame = variant['frames'][slot]
    page = next(p for p in variant['pages'] if p['id'] == frame['page'])
    x, y, width, height = frame['sampleRect']
    whole = Image.new('RGBA', tuple(v*density for v in metadata['logical']['canvas']))
    whole.paste(Image.open(directory/page['base']).crop((x, y, x+width, y+height)),
        tuple(v*density for v in metadata['logical']['frames'][slot]['trimOrigin']))
    return whole


reference = full_frame(old_body, 4, 0)
target = footing(reference)/4
reference.save(inspection/'retained-intact-reference-4x.png')
jobs = [
    ('CATRAN03', 'yr-sov07-transylvania-castle-v1', 'yr-feedback-castle-body-r3',
     'yr-transylvania-castle-r2-cttran03-shp.json', 'transylvania-castle-body.json'),
    ('CATR03DM', 'yr-sov07-castle-collapse-v1', 'yr-feedback-castle-collapse-r3',
     'yr-castle-collapse-r2-cttr03dm-shp.json', 'transylvania-castle-collapse-r2.json'),
]
records, payloads = [], {}
for identity, prior_family, family, member_file, recipe_file in jobs:
    metadata = copy.deepcopy(read(directory/member_file))
    recipe = read(root/'docs/campaign-art/yr-v1'/recipe_file)
    source_file = root/recipe['source']
    source, = read(source_file)['sources']
    assert source['sha256'] == metadata['source']['sha256']
    registration = {}
    for slot, master in recipe['masters'].items():
        slot = int(slot)
        if identity == 'CATRAN03' and slot not in (1, 2):
            continue
        file = root/master['file']
        assert sha(file.read_bytes()) == master['sha256']
        image = Image.open(file).convert('RGBA')
        anchors = footing(image)
        dx = (target[1, 0]-target[0, 0])/(anchors[1, 0]-anchors[0, 0])
        tx = target[0, 0]-dx*anchors[0, 0]
        vertical = np.linalg.solve(np.c_[anchors, np.ones(3)], target[:, 1])
        matrix = np.array([[dx, 0, tx], vertical], dtype=float)
        capacity = 1/np.linalg.svd(matrix[:, :2], compute_uv=False).max()
        assert capacity >= 4, (identity, slot, capacity)
        registration[slot] = image, matrix
        records.append({'identity': identity, 'frame': slot, 'master': str(file.relative_to(root)),
            'masterSha256': master['sha256'], 'foundationAnchors': anchors.tolist(),
            'sourceCanvasTransform': matrix.tolist(), 'independentDensityCapacity': capacity})
    if identity == 'CATRAN03':
        registration[2] = registration[1]
    for variant in metadata['variants']:
        density = variant['density']
        for page in variant['pages']:
            old_bytes = (directory/page['base']).read_bytes()
            assert sha(old_bytes) == page['baseSha256']
            atlas = Image.open(directory/page['base']).convert('RGBA')
            for frame in [f for f in variant['frames'] if f['page'] == page['id']
                    and f['nativeFrame'] in registration]:
                slot = frame['nativeFrame']
                image, matrix = registration[slot]
                raw = np.array(image).astype(float)
                raw[..., :3] *= raw[..., 3:4]/255
                size = tuple(value*density for value in metadata['logical']['canvas'])
                warped = cv2.warpAffine(raw, matrix*density, size, flags=cv2.INTER_LANCZOS4)
                warped = np.clip(warped, 0, 255)
                warped[..., :3] = np.where(warped[..., 3:4] > 0,
                    warped[..., :3]*255/np.maximum(1e-6, warped[..., 3:4]), 0)
                whole = Image.fromarray(warped.astype(np.uint8))
                geometry = metadata['logical']['frames'][slot]
                ox, oy = [value*density for value in geometry['trimOrigin']]
                width, height = [value*density for value in geometry['legacyRenderSize']]
                sprite = whole.crop((ox, oy, ox+width, oy+height))
                native = source['frames'][slot]
                indices = np.frombuffer((source_file.parent/'native'/
                    f"{source['member']}-{slot}.index").read_bytes(), np.uint8).reshape(native['size'][::-1])
                native_mask = np.pad((indices != 0).astype(np.uint8), ((1, 1), (1, 1)))
                # A half-pixel continuous contour keeps the original dynamic
                # silhouette while all RGB comes from registered HD paint.
                inside = cv2.distanceTransform(native_mask, cv2.DIST_L2, 5)
                outside = cv2.distanceTransform(1-native_mask, cv2.DIST_L2, 5)
                contour = cv2.resize((inside-outside)[1:-1, 1:-1],
                    (native['size'][0]*density, native['size'][1]*density), interpolation=cv2.INTER_LINEAR)
                alpha = np.clip(contour+.5, 0, 1)
                rgba = np.array(sprite)
                h, w = alpha.shape
                rgba[:h, :w, 3] = np.minimum(rgba[:h, :w, 3], (alpha*255).astype(np.uint8))
                rgba[h:, :, 3] = 0; rgba[:, w:, 3] = 0
                sprite = Image.fromarray(rgba)
                x, y, fw, fh = frame['sampleRect']
                assert sprite.size == (fw, fh)
                atlas.paste(sprite, (x, y))
                full = Image.new('RGBA', size); full.paste(sprite, (ox, oy))
                destination = inspection/f'{identity.lower()}-{density}x'
                destination.mkdir(exist_ok=True)
                full.save(destination/f'{slot:03d}.png')
            base_name = f'{family}-{density}-{page["id"]}-base.png'
            file = directory/base_name
            assert not file.exists()
            atlas.save(file)
            payloads[base_name] = file.read_bytes()
            page.update(base=base_name, baseSha256=sha(payloads[base_name]), baseBytes=len(payloads[base_name]))
    metadata['packRevision'] = family
    metadata['color']['temporalRegistration'] = {'schema': 'source-pinned-stationary-foundation-v1',
        'referenceMember': old_body['source'], 'referenceFrame': 0, 'referenceSourceAnchors': target.tolist(),
        'retainedIntactAndRubblePixelsExact': identity == 'CATRAN03',
        'originalSourceTrimPivotFramesRateAndShadowsUnchanged': True,
        'independentDensities': [2, 4]}
    declared = copy.deepcopy(contract['families'][prior_family])
    declared['familyHash'] = sha(encode({'sourceFamilyHash': declared['familyHash'],
        'registration': 'source-pinned-stationary-foundation-v1', 'family': family}))
    assert family not in contract['families'] and contract['identities']['yr'][identity] == prior_family
    contract['families'][family] = declared
    contract['identities']['yr'][identity] = family
    name = family+'-member.json'
    payloads[name] = encode(metadata)
    bundle = {'schema': 'campaign-environment-extension-v1', 'identity': family,
        'familyHash': declared['familyHash'], 'mission': 'sov07tmd.map', 'theater': 'TEMPERATE',
        'edition': 'yr', 'revision': family, 'members': [{'member': metadata['source']['member'],
            'manifest': name, 'sha256': sha(payloads[name])}],
        'acceptance': 'USER_REOPENED_CASTLE_ANIMATION_NATIVE_VISUAL_REVIEW_PENDING'}
    payloads['environment-family-'+family+'.json'] = encode(bundle)
assert len(campaign['files'])+len(payloads) <= 256
prior_names = {row['name'] for row in campaign['files']}
for name, data in payloads.items():
    assert name not in prior_names
    file = directory/name
    if file.exists():
        assert file.read_bytes() == data
    else:
        file.open('xb').write(data)
    campaign['files'].append({'name': name, 'bytes': len(data), 'sha256': sha(data),
        'route': f'/local-campaign/yr/sov07tmd/{name}'})
campaign_file.write_bytes(encode(campaign)); contract_file.write_bytes(encode(contract))
receipt = {'schema': 'yr-castle-stationary-foundation-repair-v1', 'status': 'SELECTED_NATIVE_VISUAL_REVIEW_PENDING',
    'targetAnchors': target.tolist(), 'frames': records, 'priorPayloadsChanged': 0,
    'bodyIntactAndRubblePixelsPreserved': True, 'nativeGeometryShadowsTimingAndMapsUnchanged': True,
    'independentDensities': [2, 4], 'userVisualAcceptance': 'PENDING'}
(root/'docs/yr-campaign-castle-animation-registration-20261108.json').open('xb').write(encode(receipt))
print(json.dumps({'status': receipt['status'], 'registeredPoses': len(records), 'addedFiles': len(payloads)}))
