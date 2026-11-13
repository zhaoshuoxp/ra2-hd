"""Export all original castle-collapse poses from independent authored HD masters."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('stage', type=Path)
parser.add_argument('--revision', default='yr-castle-collapse-r1')
args = parser.parse_args()
stage = args.stage.resolve()
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
write = lambda file, value: file.write_text(json.dumps(value, indent=2) + '\n')
original = read(stage / 'prepared/source.json')
source, = original['sources']
assert source['identity'] == 'CATR03DM' and source['bindingRole'] == 'DESTROY_ANIMATION'
assert source['parentRules']['DestroyAnim'] == 'CATR03DM'
assert source['sha256'] == '5ee66ed709ace84da29643d01f4bf279fce9c75253e50f85c01a27532aa62283'
assert source['bodyFrames'] == 87 and source['totalFrames'] == 174 and source['hasShadow']
assert source['remapable'] is False and source['canvas'] == [260, 238]
prepared = read(stage / 'preparation.json')
masters = {row['slot']: row for row in prepared['masters']}
assert set(masters) == set(range(87))
details, checks = {}, []
for frame in source['frames'][:87]:
    slot = frame['slot']
    file = stage / 'prepared/native' / frame['indexFile']
    assert sha(file) == frame['indexSha256']
    indices = np.frombuffer(file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
    assert not np.any((indices >= 16) & (indices <= 31)), 'Keep original neutral trim and effects'
    bounds = Image.fromarray((indices != 0).astype(np.uint8) * 255).getbbox()
    master = Path(masters[slot]['file'])
    assert sha(master) == masters[slot]['sha256']
    image = Image.open(master).convert('RGBA')
    assert image.getchannel('A').getextrema()[0] == 0
    authored_bounds = image.getchannel('A').getbbox()
    assert authored_bounds and bounds
    detail = image.crop(authored_bounds)
    width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    assert detail.width >= width * 4 and detail.height >= height * 4, ('Insufficient independent 4X sampling', slot)
    details[slot] = detail, bounds
    checks.append(dict(frame=slot, master=str(master), masterSha256=sha(master),
        authoredBounds=authored_bounds, nativeBodyBounds=bounds,
        independentDensityCapacity=min(detail.width / width, detail.height / height),
        originalBodyShadePixels=int((indices == 12).sum()), originalOwnerPixels=0))
pack_root = stage / 'pack'
pack_root.mkdir(exist_ok=False)
folder = pack_root / 'members/cttr03dm-shp'
folder.mkdir(parents=True)
logical = [dict(nativeFrame=frame['slot'], trimOrigin=frame['origin'], trimSize=frame['size'],
    legacyRenderSize=[value + value % 2 for value in frame['size']], empty=frame['empty'])
    for frame in source['frames'][:87]]
manifest = dict(schemaVersion=2, packId='environment-cttr03dm-shp', packRevision=args.revision,
    source=dict(member=source['member'], sha256=source['sha256'], theater=original['theater'], kind='resolved-shp-member'),
    logical=dict(canvas=source['canvas'], frames=logical),
    color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data',
        authoredAnimation=dict(schema='source-pinned-hd-animation-v1',
            sourceSha256=source['sha256'], paletteSha256=source['palette']['sha256'],
            originalBodyIndexSha256=[frame['indexSha256'] for frame in source['frames'][:87]],
            bodyIndex12='Original dark masonry shade; reconstructed in authored body material.',
            owner='All 87 original body frames have zero owner-remap pixels.',
            shadows='All 87 original second-half shadow frames remain native and unchanged.',
            alpha='Continuous authored alpha, independently sampled from each source-pose master.',
            rate=source['nativeArt']['Rate'], originalSourceJsonSha256=prepared['originalSourceJsonSha256'])), variants=[])
allocation = {}
for density in [2, 4]:
    evidence = stage / f'frames-{density}x'
    evidence.mkdir()
    layouts, frames = [[]], []
    x, y, row_height = 2, 2, 0
    for slot, geometry in enumerate(logical):
        width, height = [value * density for value in geometry['legacyRenderSize']]
        fw, fh = geometry['trimSize']
        detail, bounds = details[slot]
        left, top, right, bottom = bounds
        body = detail.convert('RGBa').resize(((right - left) * density, (bottom - top) * density),
            Image.Resampling.LANCZOS).convert('RGBA')
        base = Image.new('RGBA', (width, height))
        base.alpha_composite(body, (left * density, top * density))
        full = Image.new('RGBA', tuple(value * density for value in source['canvas']))
        full.paste(base, tuple(value * density for value in geometry['trimOrigin']))
        full.save(evidence / f'{slot:03d}.png')
        if x + width + 2 > 2048:
            x, y, row_height = 2, y + row_height + 4, 0
        if y + height + 2 > 2048:
            layouts.append([])
            x, y, row_height = 2, 2, 0
        frame = dict(nativeFrame=slot, page=f'p{len(layouts) - 1}', sampleRect=[x, y, width, height],
            contentRect=[x, y, fw * density, fh * density])
        layouts[-1].append((frame, base))
        frames.append(frame)
        x += width + 4
        row_height = max(row_height, height)
    pages = []
    for index, layout in enumerate(layouts):
        height = max(frame['sampleRect'][1] + frame['sampleRect'][3] + 2 for frame, _ in layout)
        target = folder / str(density) / f'p{index}'
        target.mkdir(parents=True)
        base = Image.new('RGBA', (2048, height))
        data = Image.new('RGBA', base.size, (0, 0, 0, 255))
        for frame, image in layout:
            base.paste(image, tuple(frame['sampleRect'][:2]))
        page = dict(id=f'p{index}', size=list(base.size))
        for role, image in [('base', base), ('data', data)]:
            file = target / (role + '.png')
            image.save(file)
            page.update({role: f'{density}-p{index}-{role}.png', role + 'Sha256': sha(file),
                role + 'Bytes': file.stat().st_size})
        pages.append(page)
    assert len(pages) <= (8 if density == 2 else 24)
    manifest['variants'].append(dict(density=density, pages=pages, frames=frames))
    allocation[str(density)] = sum(page['size'][0] * page['size'][1] * 8 for page in pages)
write(folder / 'manifest.json', manifest)
contract = read(stage / 'contract.json')
identity, family = next(iter(contract['families'].items()))
pack = dict(schema='environment-shp-pack-v1', theater=original['theater'], editions=['yr'], revision=args.revision,
    families={identity: dict(familyHash=family['familyHash'], members=[dict(member=source['member'],
        sha256=sha(folder / 'manifest.json'), path='members/cttr03dm-shp/manifest.json')])})
write(pack_root / 'manifest.json', pack)
write(stage / 'sampling-audit.json', dict(status='PASS_ALL_87_INDEPENDENT_2X_4X_SOURCE_POSES', frames=checks,
    unpooledRgbaBytes=allocation, originalBodyFrames=87, originalShadowFrames=87, userVisualAcceptance='PENDING'))
print(json.dumps(dict(bodyFrames=87, variants=[dict(density=v['density'], pages=len(v['pages']))
    for v in manifest['variants']], unpooledRgbaBytes=allocation, stage=str(stage))))
