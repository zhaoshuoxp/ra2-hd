"""Register authored upper assemblies to verified native pivots, without a ground base."""
import json
import numpy as np
from PIL import Image, ImageDraw
from production_common import ROOT, sha, coverage_box

captures = ROOT / 'turret-parts-v1'
evidence = json.loads((captures / 'result.json').read_text())
dependencies = json.loads((ROOT / 'dependencies-v1.json').read_text())
assert evidence['status'] == 'PASS_ORIGINAL_TURRET_REFERENCES'
out = ROOT / 'turret-exports-v1'
out.mkdir(exist_ok=False)
for identity in ('GTGCAN', 'NASAM'):
    target = out / identity
    target.mkdir()
    source = ROOT / 'production-art-v1' / identity / 'turrets-raw.png'
    sheet = Image.open(source).convert('RGBA')
    native = evidence['families'][identity]
    assert native['partsOnly']
    assert len({f['hash'] for f in native['frames'] if isinstance(f['heading'], int)}) == 8
    canvas, offset = ((160, 120), (-80, -90)) if identity == 'GTGCAN' else ((80, 90), (-40, -70))
    frames = []
    overview = Image.new('RGB', (canvas[0] * 4, (canvas[1] + 28) * 2), '#34483d')
    for i, heading in enumerate(range(0, 360, 45)):
        reference = Image.open(captures / identity / f'{heading}.png').convert('RGBA')
        pixels = np.array(reference)
        coverage = np.max(np.abs(pixels[..., :3].astype(int) - [52, 72, 61]), axis=2) > 20
        y, x = np.where(coverage)
        assert len(x) > 30
        scale = [reference.width / native['crop'][2], reference.height / native['crop'][3]]
        bounds = [x.min(), y.min(), x.max() + 1, y.max() + 1]
        box = [float(bounds[k] / scale[k % 2] + native['crop'][k % 2]
                     - native['pivotScreen'][k % 2] - offset[k % 2]) for k in range(4)]
        cell = sheet.crop((round(i % 4 * sheet.width / 4), round(i // 4 * sheet.height / 2),
                           round((i % 4 + 1) * sheet.width / 4), round((i // 4 + 1) * sheet.height / 2)))
        crop = coverage_box(cell)
        cell = cell.crop(crop)
        # A single pose registration; never use the full rotating assembly's
        # envelope to scale a fixed foundation, which is exported separately.
        rectangle = [round(v * 2) for v in box]
        size = (rectangle[2] - rectangle[0], rectangle[3] - rectangle[1])
        assert min(cell.width / size[0], cell.height / size[1]) >= 1
        assert 0 <= rectangle[0] < rectangle[2] <= canvas[0] * 2
        assert 0 <= rectangle[1] < rectangle[3] <= canvas[1] * 2
        result = Image.new('RGBA', tuple(v * 2 for v in canvas))
        result.alpha_composite(cell.resize(size, Image.Resampling.LANCZOS), tuple(rectangle[:2]))
        rgba = np.array(result)
        rgb = rgba[..., :3].astype(float)
        remap = (rgb[..., 0] > rgb[..., 1] * 1.5) & (rgb[..., 0] > rgb[..., 2] * 1.5) & (rgba[..., 3] > 0)
        result.save(target / f'{heading}.png')
        (target / f'{heading}.mask').write_bytes((np.uint8(remap) * 255).tobytes())
        frames.append({'heading': heading, 'base': f'{heading}.png', 'baseSha256': sha(target / f'{heading}.png'),
            'baseBytes': (target / f'{heading}.png').stat().st_size, 'mask': f'{heading}.mask',
            'maskSha256': sha(target / f'{heading}.mask'), 'maskBytes': canvas[0] * canvas[1] * 4,
            'sourceCropInCell': crop, 'nativePivotBox': box, 'registeredRect2x': rectangle})
        thumb = result.resize(canvas, Image.Resampling.LANCZOS)
        xy = (i % 4 * canvas[0], i // 4 * (canvas[1] + 28))
        overview.paste(thumb, (xy[0], xy[1] + 28), thumb)
        ImageDraw.Draw(overview).text((xy[0] + 5, xy[1] + 2), str(heading), fill='white', font_size=20)
    dependency = next(r for r in dependencies['rows'] if r['id'] == identity and r['theater'] == 'TEMPERATE')
    manifest = {'schemaVersion': 1, 'family': identity, 'theater': 'TEMPERATE', 'density': 2,
        'canvas': canvas, 'offset': offset, 'headings': frames,
        'sources': {part['member']: part['sha256'] for part in dependency['voxelParts']},
        'gpuBytes': 8 * canvas[0] * canvas[1] * 4 * 5 + 4,
        'artworkSource': str(source), 'artworkSha256': sha(source),
        'registrationSource': str(captures / 'result.json'), 'registrationSha256': sha(captures / 'result.json'),
        'status': 'EXPORTED_NATIVE_PIVOT_CANDIDATE_RUNTIME_PENDING'}
    (target / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    overview.save(target / 'native-headings.png')
    print(identity, manifest['gpuBytes'], 'bytes; runtime pending')
