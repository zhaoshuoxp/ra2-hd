"""Export original Hollywood hero geometry with independently sampled HD poses."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm1/allied-units'))
from authored_cells import isolated_cells

parser = argparse.ArgumentParser()
parser.add_argument('--revision', default='yr-hollywood-r1')
parser.add_argument('--audit-only', action='store_true')
parser.add_argument('--preview', type=Path)
args = parser.parse_args()
root = Path('.local/source-art/yr-campaign-v1/hollywood-heroes')
original = root / 'original'
work = json.loads((root / 'pose-jobs-r1/worklist.json').read_text())
source = json.loads((original / 'source.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def original_red_materials(paint, indices, palette, density):
    """Keep authored red edges while separating original house paint from neutral red props."""
    owner = (indices >= 16) & (indices <= 31)
    native = palette[indices]
    red, green, blue = [native[..., channel] for channel in range(3)]
    neutral = (red > 35) & (red > green * 1.5) & (red > blue * 1.5)
    neutral &= (green - blue < (red - blue) * .25) & ~owner
    if not owner.any():
        return np.zeros_like(paint), int(neutral.sum())
    if not neutral.any():
        return paint, 0
    house_seeds = np.argwhere(owner).astype(np.float32) + .5
    neutral_seeds = np.argwhere(neutral).astype(np.float32) + .5
    pixels = np.argwhere(paint)
    classified = paint.copy()
    for offset in range(0, len(pixels), 512):
        block = pixels[offset:offset + 512]
        points = (block.astype(np.float32) + .5) / density
        house_distance = ((points[:, None] - house_seeds[None]) ** 2).sum(2).min(1)
        neutral_distance = ((points[:, None] - neutral_seeds[None]) ** 2).sum(2).min(1)
        classified[block[:, 0], block[:, 1]] = house_distance < neutral_distance
    return classified, int(neutral.sum())


assert work['sourceJsonSha256'] == sha(original / 'source.json')
assert work['sequencesSha256'] == sha(original / 'sequences.json')
overrides_path = root / 'selected-masters.json'
overrides = json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
overrides = {'arnd-ready-000-007': 'arnd-ready-r1.png', 'stln-ready-000-007': 'stln-ready-r3.png', **overrides}
frame_choices_path = root / 'selected-frames.json'
frame_choices = json.loads(frame_choices_path.read_text()) if frame_choices_path.exists() else {}
details, audit, missing, invalid = {}, [], [], []
for job in work['jobs']:
    master = root / 'masters' / overrides.get(job['id'], job['id'] + '-r1.png')
    if not master.exists():
        missing.append(job['id'])
        continue
    assert sha(Path(job['reference'])) == job['referenceSha256']
    try:
        cells = isolated_cells(Image.open(master), *job['grid'], len(job['frames']))
    except AssertionError as error:
        invalid.append(dict(job=job['id'], master=str(master), error=str(error)))
        continue
    actor = next(item for item in source['sources'] if item['identity'] == job['identity'])
    for slot, (detail, _) in zip(job['frames'], cells, strict=True):
        selected = frame_choices.get(f"{actor['identity']}:{slot}")
        frame_master = master
        if selected:
            assert sha(Path(selected['reference'])) == selected['referenceSha256']
            frame_master = root / 'masters' / selected['master']
            detail = isolated_cells(Image.open(frame_master), *selected['grid'], selected['count'])[selected['cell']][0]
        frame = actor['frames'][slot]
        native = original / 'native' / f"{actor['member']}-{slot}.index"
        assert sha(native) == frame['indexSha256']
        indices = np.frombuffer(native.read_bytes(), np.uint8).reshape(frame['size'][::-1])
        body = Image.fromarray(np.uint8((indices != 0) & (indices != 12)) * 255).getbbox()
        assert body, (actor['identity'], slot)
        density = min(detail.width / (body[2] - body[0]), detail.height / (body[3] - body[1]))
        details[(actor['identity'], slot)] = (detail, body)
        audit.append(dict(identity=actor['identity'], frame=slot, job=job['id'], master=str(frame_master),
                          masterSha256=sha(frame_master), availableDensity=density, nativeBodyBounds=body))
insufficient = [item for item in audit if item['availableDensity'] < 4]
report = dict(schema='yr-hollywood-sampling-v1', status='PASS_SAMPLING' if not missing and not insufficient and not invalid else 'INCOMPLETE',
              presentFrames=len(details), requiredFrames=sum(actor['bodyFrames'] for actor in source['sources']),
              missing=missing, invalid=invalid, insufficient=insufficient, frames=audit, userVisualAcceptance='PENDING')
(root / 'sampling-audit.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k != 'frames'}))
if args.audit_only and not args.preview:
    raise SystemExit(0)
if not args.preview:
    assert not missing and not insufficient and not invalid, 'Complete every original body slot before publishing a family'
if args.preview:
    args.preview.mkdir(parents=True, exist_ok=False)
for actor in source['sources']:
    identity = actor['identity']
    palette = np.frombuffer((original / 'native' / actor['palette']['member']).read_bytes(), np.uint8).reshape(256, 3).astype(float) * 4
    pack_id = 'yr-hollywood-heroes-' + identity.lower()
    out = args.preview / identity.lower() if args.preview else Path('.local/hd-packs') / pack_id / args.revision
    out.mkdir(parents=True, exist_ok=False)
    frame_root = out if args.preview else Path('.artifacts/yr-campaign') / ('hollywood-exports-' + args.revision) / identity.lower()
    logical = []
    for slot, frame in enumerate(actor['frames'][:actor['bodyFrames']]):
        logical.append(dict(nativeFrame=slot, trimOrigin=frame['origin'], trimSize=frame['size'],
                            legacyRenderSize=[value + value % 2 for value in frame['size']], empty=frame['empty']))
    variants, checks = [], []
    for density in [2, 4]:
        folder = frame_root / f'{density}x'
        folder.mkdir(parents=True, exist_ok=False)
        layouts, packed = [[]], []
        x, y, row_height = 2, 2, 0
        for slot, geometry in enumerate(logical):
            if (identity, slot) not in details:
                assert args.preview
                continue
            frame = actor['frames'][slot]
            native = original / 'native' / f"{actor['member']}-{slot}.index"
            indices = np.frombuffer(native.read_bytes(), np.uint8).reshape(frame['size'][::-1])
            fw, fh = frame['size']
            width, height = [value * density for value in geometry['legacyRenderSize']]
            base = Image.new('RGBA', (width, height))
            shadow = np.zeros((fh, fw, 4), np.uint8)
            shadow[..., 3] = (indices == 12) * 255
            base.alpha_composite(Image.fromarray(shadow).resize((fw * density, fh * density), Image.Resampling.NEAREST))
            detail, body = details[(identity, slot)]
            left, top, right, bottom = body
            sprite = detail.convert('RGBa').resize(((right - left) * density, (bottom - top) * density),
                                                 Image.Resampling.LANCZOS).convert('RGBA')
            base.alpha_composite(sprite, (left * density, top * density))
            rgba = np.array(base)
            native_owner = bool(np.any((indices >= 16) & (indices <= 31)))
            red, green, blue = [rgba[..., channel].astype(float) for channel in range(3)]
            paint = (rgba[..., 3] > 0) & (red > 35) & (red > green * 1.5) & (red > blue * 1.5)
            paint &= green - blue < (red - blue) * .25
            paint, neutral_red_seeds = original_red_materials(paint, indices, palette, density)
            # Original neutral eyes, blood and arrow tips keep their authored colors.
            assert not native_owner or paint.any(), ('Missing original owner region', identity, slot)
            shades = np.abs(red[..., None] - palette[16:32, 0]).argmin(axis=2).astype(np.uint8)
            data = np.zeros_like(rgba)
            data[..., 3] = 255
            data[..., 0] = paint * 255
            data[..., 1] = np.where(paint, shades, 0)
            full = Image.new('RGBA', tuple(value * density for value in actor['canvas']))
            full.paste(base, tuple(value * density for value in frame['origin']))
            full.save(folder / f'{slot:04d}.png')
            if x + width + 2 > 2048:
                x, y, row_height = 2, y + row_height + 4, 0
            if y + height + 2 > 2048:
                layouts.append([])
                x, y, row_height = 2, 2, 0
            item = dict(nativeFrame=slot, page=f'p{len(layouts) - 1}', sampleRect=[x, y, width, height],
                        contentRect=[x, y, fw * density, fh * density])
            packed.append(item)
            layouts[-1].append((item, base, Image.fromarray(data)))
            x += width + 4
            row_height = max(row_height, height)
            checks.append(dict(frame=slot, density=density, nativeOwner=native_owner,
                               ownerPixels=int(paint.sum()), originalNeutralRedSeeds=neutral_red_seeds,
                               originalBodyShadowPixels=int((indices == 12).sum())))
        pages = []
        for index, layout in enumerate(layouts):
            if not layout:
                continue
            height = (max(item['sampleRect'][1] + item['sampleRect'][3] + 2 for item, _, _ in layout) + 15) // 16 * 16
            page = dict(id=f'p{index}', size=[2048, height])
            for offset, role in [(1, 'base'), (2, 'data')]:
                atlas = Image.new('RGBA', (2048, height), (0, 0, 0, 255 if role == 'data' else 0))
                for entry in layout:
                    atlas.paste(entry[offset], tuple(entry[0]['sampleRect'][:2]))
                name = f'{density}x-p{index}-{role}.png'
                atlas.save(out / name)
                page.update({role: name, role + 'Sha256': sha(out / name), role + 'Bytes': (out / name).stat().st_size})
            pages.append(page)
        variants.append(dict(density=density, pages=pages, frames=packed))
    manifest = dict(schemaVersion=2, packId=pack_id, packRevision=args.revision,
                    rulesIdentities=[identity], purpose='Complete original Hollywood hero body slots; user visual acceptance pending',
                    source=dict(member=actor['member'], sha256=actor['sha256'], theater='TEMPERATE', kind='resolved-shp-member'),
                    logical=dict(canvas=actor['canvas'], frames=logical),
                    color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data'), variants=variants,
                    provenance=dict(sourceSha256=sha(original / 'source.json'), worklistSha256=sha(root / 'pose-jobs-r1/worklist.json'),
                                    samplingAuditSha256=sha(root / 'sampling-audit.json'),
                                    originalShadows='Native second-half shadow frames remain unchanged in the source SHP.',
                                    ownerPaint='Original native material seeds classify authored red contours. Neutral eyes, blood and arrow tips remain neutral.'))
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (out / 'receipt.json').write_text(json.dumps(dict(status='PARTIAL_PREVIEW_NOT_REGISTERED' if args.preview else 'COMPLETE_DUAL_DENSITY_RUNTIME_PENDING',
        manifestSha256=sha(out / 'manifest.json'), checks=checks, userVisualAcceptance='PENDING'), indent=2) + '\n')
