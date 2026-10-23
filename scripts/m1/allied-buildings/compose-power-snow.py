"""Add proven snow surfaces to exact accepted GAPOWR frame geometry/art."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from production_common import DENSITY, ROOT, row_for, raw_for, indices, export_frames, sheet_cells, register, resting, sha
from mechanical_common import add_native_snow

row = row_for('GAPOWR', 'SNOW')
dry = row_for('GAPOWR')
family_path = Path('.local/hd-packs/power-plant-authored/1/family.json')
assert sha(family_path) == '31b76d8632f470e41886aaf2987c3df618370f1b25ea80725d044e450f94b2d2'
family = json.loads(family_path.read_text())
snow_path = ROOT / 'production-art-v1/GAPOWR/snow-raw.png'
snow = sheet_cells(Image.open(snow_path).convert('RGBA'), 2, 1)
snow_master, _ = register(snow[0], row['members'][0]['canvas'], resting(row).getbbox())
frames, proof = {}, []
for native, original, binding in zip(row['members'], dry['members'], family['members']):
    assert native['roles'] == original['roles'] and native['canvas'] == original['canvas']
    root = Path('.local/hd-packs') / binding['packId'] / binding['revision']
    manifest_path = root / 'manifest.json'
    assert sha(manifest_path) == binding['sha256']
    manifest = json.loads(manifest_path.read_text())
    assert manifest['source']['sha256'] == original['source']['sha256']
    variant = next(v for v in manifest['variants'] if v['density'] == DENSITY)
    pages = {p['id']: Image.open(root / p['base']).convert('RGBA') for p in variant['pages']}
    for p in variant['pages']:
        assert sha(root / p['base']) == p['baseSha256']
    for n in range(native['visibleFrames']):
        assert np.array_equal(indices(native, n) != 0, indices(original, n) != 0), 'Distinct snow geometry requires new construction'
        image = Image.new('RGBA', tuple(v * DENSITY for v in native['canvas']))
        if n < len(variant['frames']):
            f = variant['frames'][n]
            logical = manifest['logical']['frames'][n]
            x, y, width, height = f['sampleRect']
            image.alpha_composite(pages[f['page']].crop((x, y, x + width, y + height)),
                                  tuple(v * DENSITY for v in logical['trimOrigin']))
            image = add_native_snow(row, native, n, image, snow_master)
        else:
            assert 'ACTIVE' in native['roles'] and n >= 16, 'Only unreferenced shadow tail may be blank'
        frames[native['source']['member'], n] = image
    proof.append({'nativeSnow': native['source'], 'acceptedDry': original['source'],
                  'manifestSha256': binding['sha256'], 'alphaTopology': 'IDENTICAL_ALL_FRAMES',
                  'canvas': native['canvas'], 'checkedFrames': native['visibleFrames']})
export_frames(row, frames, ROOT / 'full-exports-v1/GAPOWR-SNOW',
              {'acceptedFamilySha256': sha(family_path), 'snowMasterSha256': sha(snow_path),
               'mechanism': 'Exact accepted geometry and full construction; source-proven authored snow deposits',
               'geometryReuseProof': proof, 'acceptedDryModified': False})
print(len(frames), 'snow power-plant slots; accepted dry art unchanged')
