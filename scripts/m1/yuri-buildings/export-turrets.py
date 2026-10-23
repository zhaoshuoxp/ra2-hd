"""Export independent 2x/4x upper assemblies at original VXL world pivots."""
import json
import sys
from PIL import Image, ImageDraw, ImageFont
import numpy as np
from production_common import ROOT, sha, material_coverage

sys.path.insert(0, 'scripts/m1/owner-color')
from paint import complete_data

OUT = ROOT / sys.argv[1]
OUT.mkdir(exist_ok=False)
evidence = json.loads((ROOT / 'turret-references-v1/result.json').read_text())
dependencies = json.loads((ROOT / 'dependencies-v2.json').read_text())
assert evidence['status'] == 'PASS_ORIGINAL_TURRET_REFERENCES'
contracts = json.loads(open('desktop/building-turret-contracts.json').read())

for identity in ('YAGGUN', 'YAREFN'):
    sheet_source = ROOT / 'production-art-v1' / identity / ('headings-r2-raw.png' if identity == 'YAGGUN' else 'headings-raw.png')
    sheet = Image.open(sheet_source).convert('RGBA')
    contract, native = contracts[identity], evidence['families'][identity]
    assert native['partsOnly'] and native['parts'] == contract['builders']
    assert len({f['hash'] for f in native['frames'] if isinstance(f['heading'], int)}) == 8
    for density in (2, 4):
        target = OUT / identity / str(density)
        target.mkdir(parents=True)
        width, height = [v * density for v in contract['canvas']]
        frames = []
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
        overview = Image.new('RGB', (width * 4, (height + 40) * 2), '#34483d')
        for i, heading in enumerate(range(0, 360, 45)):
            source = sheet_source
            region = tuple(round(v) for v in (i % 4 * sheet.width / 4, i // 4 * sheet.height / 2,
                (i % 4 + 1) * sheet.width / 4, (i // 4 + 1) * sheet.height / 2))
            cell = sheet.crop(region)
            if identity == 'YAGGUN' and heading in (0, 225):
                source = ROOT / ('art-v1/YAGGUN-TURRET-0/normal-raw.png' if heading == 0
                                 else 'production-art-v1/YAGGUN/225-r2-raw.png')
                cell = Image.open(source).convert('RGBA')
                region = (0, 0, *cell.size)
            cell = material_coverage(cell, primary_component=True)
            subject = cell.getchannel('A').point(lambda v: 255 if v >= 240 else 0).getbbox()
            assert subject
            cell = cell.crop(subject)
            reference = Image.open(ROOT / 'turret-references-v1' / identity / f'{heading}.png').convert('RGBA')
            pixels = np.array(reference)
            coverage = np.max(abs(pixels[..., :3].astype(int) - [52, 72, 61]), axis=2) > 20
            yy, xx = np.where(coverage)
            scale = [reference.width / native['crop'][2], reference.height / native['crop'][3]]
            bounds = [xx.min(), yy.min(), xx.max() + 1, yy.max() + 1]
            box = [float(bounds[k] / scale[k % 2] + native['crop'][k % 2]
                - native['pivotScreen'][k % 2] - contract['offset'][k % 2]) for k in range(4)]
            # Uniform fitting corrects the three review aspect-ratio problems.
            # The pivot, logical canvas, base and depth contract never scale.
            ratio = min((box[2] - box[0]) * density / cell.width,
                        (box[3] - box[1]) * density / cell.height)
            assert ratio <= 1, ('Deficient actual subject', identity, heading, density)
            size = tuple(round(v * ratio) for v in cell.size)
            offset = (round((box[0] + box[2]) * density / 2 - size[0] / 2), round(box[3] * density - size[1]))
            assert offset[0] >= 0 and offset[1] >= 0 and offset[0] + size[0] <= width and offset[1] + size[1] <= height
            image = Image.new('RGBA', (width, height))
            image.alpha_composite(cell.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA'), offset)
            rgba = np.array(image)
            data = np.zeros_like(rgba)
            data[..., 3] = 255
            if identity == 'YAGGUN':
                # Native owner-index voxels belong to the authored red drum
                # and receiver. Seed their saturated core, including tiny
                # disconnected chipped-paint highlights; violet lights and
                # neutral steel/brass have no such material intent.
                red, green, blue = np.moveaxis(rgba[..., :3].astype(float), 2, 0)
                core = (rgba[..., 3] >= 240) & (red > 2.5 * np.maximum(green, blue)) & (red - np.maximum(green, blue) > 35)
                data[..., 0][core] = 255
                data, _, _ = complete_data(rgba, data, density, identity, 'yaggun.vxl', heading)
            mask = data[..., 0]
            assert not mask[rgba[..., 3] == 0].any()
            assert identity != 'YAREFN' or not mask.any()
            image.save(target / f'{heading}.png')
            (target / f'{heading}.mask').write_bytes(mask.tobytes())
            frame = {'heading': heading, 'base': f'{heading}.png', 'baseSha256': sha(target / f'{heading}.png'),
                'baseBytes': (target / f'{heading}.png').stat().st_size, 'mask': f'{heading}.mask',
                'maskSha256': sha(target / f'{heading}.mask'), 'maskBytes': width * height,
                'source': str(source), 'sourceHash': sha(source), 'sourceRegion': list(region),
                'subjectCrop': list(subject), 'sourceSubject': list(cell.size), 'nativePivotBox': box,
                'physicalSize': list(size), 'physicalOffset': list(offset), 'scale': ratio,
                'upsampling': False, 'ownerPixels': int((mask != 0).sum())}
            frames.append(frame)
            xy = (i % 4 * width, i // 4 * (height + 40))
            overview.paste(image, (xy[0], xy[1] + 40), image)
            ImageDraw.Draw(overview).text((xy[0] + 8, xy[1] + 3), str(heading), font=font, fill='white')
        dependency = next(r for r in dependencies['rows'] if (r['id'], r['theater']) == (identity, 'TEMPERATE'))
        manifest = {'schemaVersion': 1, 'family': identity, 'theater': 'TEMPERATE', 'density': density,
            'canvas': contract['canvas'], 'offset': contract['offset'], 'headings': frames,
            'sources': {p['member']: p['sha256'] for p in dependency['voxelParts'] if 'sha256' in p},
            'gpuBytes': 8 * width * height * 5 + 4, 'approvalHash': sha(ROOT / 'representative-acceptance-v1.json'),
            'registrationSource': str(ROOT / 'turret-references-v1/result.json'),
            'registrationHash': sha(ROOT / 'turret-references-v1/result.json'),
            'status': 'COMPLETE_DENSITY_EXPORT_NATIVE_BINDING_AND_VISUAL_QA_PENDING'}
        assert sorted(manifest['sources']) == sorted(contract['members'])
        (target / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        overview.save(target / 'headings-full-buffer.png')
        print(identity, density, manifest['gpuBytes'], manifest['status'], flush=True)
