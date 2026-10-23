"""Retain native-reference receiver placement and a stationary lower bearing."""
import json
import sys
import numpy as np
from PIL import Image
from production_common import ROOT, material_coverage, sha

output = ROOT / sys.argv[1]
source = ROOT / 'feedback-r6/gatling-lower-bearing-raw.png'
master = material_coverage(Image.open(source))
crop = master.getchannel('A').point(lambda alpha: 255 if alpha >= 240 else 0).getbbox()
master = master.crop(crop)
for density in (2, 4):
    previous = ROOT / f'turret-exports-v2/YAGGUN/{density}'
    folder = output / 'YAGGUN' / str(density)
    folder.mkdir(parents=True, exist_ok=False)
    manifest = json.loads((previous / 'manifest.json').read_text())
    insert = master.convert('RGBa').resize((19 * density, 16 * density), Image.Resampling.LANCZOS).convert('RGBA')
    offset = tuple(round(value * density) for value in (29.5, 39.5))
    for entry in manifest['headings']:
        original = Image.open(previous / entry['base']).convert('RGBA')
        image = Image.new('RGBA', original.size)
        image.alpha_composite(insert, offset); image.alpha_composite(original)
        old, new = np.array(original), np.array(image)
        assert np.array_equal(old[old[..., 3] == 255], new[old[..., 3] == 255])
        image.save(folder / entry['base'])
        (folder / entry['mask']).write_bytes((previous / entry['mask']).read_bytes())
        entry.update(baseSha256=sha(folder / entry['base']), baseBytes=(folder / entry['base']).stat().st_size,
                     fixedBearingOffset=list(offset), receiverOpaquePixels='BYTE_IDENTICAL',
                     predecessorBaseSha256=sha(previous / entry['base']))
    manifest.update(nativePivot=True, assemblyCompletionFrame=10,
                    registrationSource='feedback-r7/original-gatling-yaw-v2/report.json',
                    registrationHash=sha(ROOT / 'feedback-r7/original-gatling-yaw-v2/report.json'),
                    boundary='Native-reference HVA projection retained; stationary lower bearing; eight discrete HD views remain.')
    (folder / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(density, 'native-relative receiver registration with fixed bearing', flush=True)
