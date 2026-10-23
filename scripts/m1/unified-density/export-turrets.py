"""Re-export pinned turret master crops at 4x with accepted registration and masks."""
import hashlib
import sys
import json
from pathlib import Path
import numpy as np
from PIL import Image
from master_regeneration import resolve_master, master_provenance

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.artifacts/unified-density/turrets-4x-v1')
root.mkdir(parents=True, exist_ok=False)
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
for family, source in {
    'NASAM': '.artifacts/allied-buildings/turret-exports-v2/NASAM/manifest.json',
    'GTGCAN': '.artifacts/allied-buildings/turret-exports-v2/GTGCAN/manifest.json',
    'NALASR': '.local/hd-packs/soviet-nalasr-authored/4/turret/manifest.json',
    'NAFLAK': '.local/hd-packs/soviet-naflak-authored/4/turret/manifest.json',
}.items():
    if len(sys.argv) > 2 and family not in sys.argv[2:]:
        continue
    try:
        old = json.loads(Path(source).read_text())
        assert sha(old['artworkSource']) == old['artworkSha256']
        sheet = Image.open(old['artworkSource']).convert('RGBA')
        out = root / family; out.mkdir()
        frames = []
        for i, item in enumerate(old['headings']):
            cell = sheet.crop(item.get('sourceCell', [round(i % 4 * sheet.width / 4), round(i // 4 * sheet.height / 2),
                round((i % 4 + 1) * sheet.width / 4), round((i // 4 + 1) * sheet.height / 2)]))
            crop = item.get('sourceCropInCell') or cell.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
            cell = cell.crop(crop)
            rect2 = item.get('registeredRect2x') or [round(v * 2) for v in item['registeredBox']]
            rect = [v * 2 for v in rect2]
            size = (rect[2] - rect[0], rect[3] - rect[1])
            cell = resolve_master(cell, size)
            assert cell.width >= size[0] and cell.height >= size[1], (family, i, 'insufficient master')
            image = Image.new('RGBA', tuple(v * 4 for v in old['canvas']))
            image.alpha_composite(cell.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA'), tuple(rect[:2]))
            # Accepted masks are semantic data, not artwork. Preserve their exact material classification.
            mask = Image.frombytes('L', tuple(v * 2 for v in old['canvas']), (Path(source).parent/item['mask']).read_bytes())
            mask = mask.resize(image.size, Image.Resampling.NEAREST)
            image.save(out/item['base']); (out/item['mask']).write_bytes(mask.tobytes())
            frames.append({**item, 'baseSha256':sha(out/item['base']), 'baseBytes':(out/item['base']).stat().st_size,
                'maskSha256':sha(out/item['mask']), 'maskBytes':len(mask.tobytes()), 'registeredRect4x':rect,
                'masterSize':list(cell.size), 'upsampledArtwork':False})
        manifest = {**old,'density':4,'gpuBytes':8*old['canvas'][0]*old['canvas'][1]*16*5+4,'headings':frames,
            'previousManifestSha256':sha(source), 'masterProvenance':master_provenance(),
            'status':'TRUE_4X_CANDIDATE_RUNTIME_PENDING'}
        (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        print(family,'PASS',flush=True)
    except AssertionError as error:
        (root / (family + '-exception.json')).write_text(json.dumps({'family': family, 'reason': str(error)}))
        print(family, 'SOURCE_SAMPLING_EXCEPTION', str(error), flush=True)
