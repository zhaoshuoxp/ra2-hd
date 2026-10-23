"""Add an authored lower bearing without rescaling accepted receiver headings."""
import json
import sys
import numpy as np
from PIL import Image
from production_common import ROOT, material_coverage, sha

output = ROOT / sys.argv[1]
source = ROOT / 'feedback-r6/gatling-lower-bearing-raw.png'
master = material_coverage(Image.open(source))
crop = master.getchannel('A').point(lambda a: 255 if a >= 240 else 0).getbbox()
master = master.crop(crop)
contract = json.load(open('desktop/gatling-pivots.json'))
for density in (2, 4):
    previous = ROOT / f'turret-exports-v2/YAGGUN/{density}'
    folder = output / 'YAGGUN' / str(density)
    folder.mkdir(parents=True, exist_ok=False)
    manifest = json.loads((previous / 'manifest.json').read_text())
    size = (19 * density, 16 * density)
    assert all(s >= t for s, t in zip(master.size, size))
    insert = master.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA')
    for frame in manifest['headings']:
        heading = str(frame['heading'])
        pivot = contract['pivots'][heading]
        offset = (round((pivot[0] - 9.5) * density), round((pivot[1] - 4.5) * density))
        original = Image.open(previous / frame['base']).convert('RGBA')
        image = Image.new('RGBA', original.size)
        image.alpha_composite(insert, offset)
        image.alpha_composite(original)
        old, new = np.array(original), np.array(image)
        assert np.array_equal(old[old[..., 3] == 255], new[old[..., 3] == 255])
        image.save(folder / frame['base'])
        mask = (previous / frame['mask']).read_bytes()
        (folder / frame['mask']).write_bytes(mask)
        frame.update(baseSha256=sha(folder / frame['base']), baseBytes=(folder / frame['base']).stat().st_size,
                     predecessorBaseSha256=sha(previous / frame['base']),
                     lowerBearing={'source': str(source), 'sourceHash': sha(source), 'subjectCrop': list(crop),
                                   'sourceSubject': list(master.size), 'physicalSize': list(size),
                                   'physicalOffset': list(offset), 'upsampling': False},
                     receiverOpaquePixels='PRESERVED_BYTE_IDENTICAL', ownerMask='PRESERVED_BYTE_IDENTICAL')
    manifest['registrationSource'] = 'desktop/gatling-pivots.json'
    manifest['registrationHash'] = sha('desktop/gatling-pivots.json')
    manifest['receiverLift'] = contract['receiverLift']
    manifest['assemblyCompletionFrame'] = 10
    (folder / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('YAGGUN', density, 'eight accepted receivers, neutral lower bearing, fixed yaw pivots', flush=True)
