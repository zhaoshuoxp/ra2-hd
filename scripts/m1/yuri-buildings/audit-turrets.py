"""Every required heading, independent density, native pivot and paint core."""
import json
import sys
import numpy as np
from PIL import Image
from production_common import ROOT, sha

source, target = ROOT / sys.argv[1], ROOT / sys.argv[2]
assert not target.exists()
contracts = json.loads(open('desktop/building-turret-contracts.json').read())
rows = []
for identity in ('YAGGUN', 'YAREFN'):
    for density in (2, 4):
        folder = source / identity / str(density)
        manifest = json.loads((folder / 'manifest.json').read_text())
        assert manifest['density'] == density
        contract = contracts[identity]
        assert manifest['canvas'] == contract['canvas'] and manifest['offset'] == contract['offset']
        assert sorted(manifest['sources']) == sorted(contract['members'])
        headings = []
        for index, heading in enumerate(range(0, 360, 45)):
            frame = manifest['headings'][index]
            assert frame['heading'] == heading and not frame['upsampling']
            assert sha(frame['source']) == frame['sourceHash']
            for role in ('base', 'mask'):
                assert sha(folder / frame[role]) == frame[role + 'Sha256']
            image = Image.open(folder / frame['base']).convert('RGBA')
            assert image.size == tuple(v * density for v in contract['canvas'])
            assert frame['scale'] <= 1
            assert all(a >= b for a, b in zip(frame['sourceSubject'], frame['physicalSize']))
            rgba = np.array(image)
            mask = np.frombuffer((folder / frame['mask']).read_bytes(), np.uint8).reshape(rgba.shape[:2])
            assert set(np.unique(mask)) <= {0, 255}
            assert not mask[rgba[..., 3] == 0].any()
            red, green, blue = np.moveaxis(rgba[..., :3].astype(float), 2, 0)
            core = (rgba[..., 3] >= 240) & (red > 2.5 * np.maximum(green, blue)) & (red - np.maximum(green, blue) > 35)
            assert not (core & (mask == 0)).any()
            if identity == 'YAREFN':
                assert not mask.any() and not core.any()
            headings.append({'heading': heading, 'ownerPixels': int((mask != 0).sum()),
                'paintCorePixels': int(core.sum()), 'missingPaintCore': 0, 'sourceHash': frame['sourceHash']})
        rows.append({'identity': identity, 'density': density, 'manifestHash': sha(folder / 'manifest.json'),
            'headings': headings, 'gpuBytes': manifest['gpuBytes'],
            'materialRationale': 'Native owner-index red receiver/drum; fixed violet light and neutral steel/brass' if identity == 'YAGGUN'
                else 'Native VXL has no owner-index voxels; complete assembly is neutral'})
report = {'status': 'PASS_ALL_REQUIRED_TURRET_EXPORT_CONTRACTS_NATIVE_PENDING', 'rows': rows,
    'boundary': 'All 32 heading exports checked; native socket, rotation/stage and owner-color observations remain pending'}
target.write_text(json.dumps(report, indent=2) + '\n')
print(report['status'])
