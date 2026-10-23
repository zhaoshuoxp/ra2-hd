"""Register complete rounded receiver centers above a stationary lower bearing."""
import json
import sys
import numpy as np
from PIL import Image
from production_common import ROOT, material_coverage, sha

output = ROOT / sys.argv[1]
contract_file = 'desktop/gatling-sphere-pivots.json'
contract = json.load(open(contract_file))
master = material_coverage(Image.open(ROOT / 'feedback-r6/gatling-lower-bearing-raw.png'))
master = master.crop(master.getchannel('A').point(lambda a: 255 if a >= 240 else 0).getbbox())
for density in (2, 4):
    source = ROOT / f'turret-exports-v2/YAGGUN/{density}'
    target = output / 'YAGGUN' / str(density)
    target.mkdir(parents=True)
    manifest = json.loads((source / 'manifest.json').read_text())
    bearing = master.convert('RGBa').resize((19*density, 16*density), Image.Resampling.LANCZOS).convert('RGBA')
    for entry in manifest['headings']:
        center = contract['centers'][str(entry['heading'])]
        delta = [round((t-c)*density) for t,c in zip(contract['targetCenter'], center)]
        original = Image.open(source / entry['base']).convert('RGBA')
        mask = Image.fromarray(np.frombuffer((source / entry['mask']).read_bytes(), np.uint8).reshape(original.height, original.width))
        image = Image.new('RGBA', original.size)
        image.alpha_composite(bearing, (round(29.5*density), round(39.5*density)))
        moved = Image.new('RGBA', original.size); moved.paste(original, tuple(delta))
        moved_mask = Image.new('L', original.size); moved_mask.paste(mask, tuple(delta))
        assert np.array(moved)[...,3].sum() == np.array(original)[...,3].sum(), 'Receiver clipping'
        assert np.array(moved_mask).sum() == np.array(mask).sum(), 'Owner mask clipping'
        image.alpha_composite(moved); image.save(target / entry['base'])
        (target / entry['mask']).write_bytes(moved_mask.tobytes())
        entry.update(baseSha256=sha(target / entry['base']), baseBytes=(target / entry['base']).stat().st_size,
                     maskSha256=sha(target / entry['mask']), sphereCenter=center, pixelTranslation=delta,
                     registeredCenter=[center[i]+delta[i]/density for i in (0,1)])
    manifest.update(nativePivot=True, assemblyCompletionFrame=10,
                    registrationSource=contract_file, registrationHash=sha(contract_file),
                    boundary='Whole receiver center registered to stationary pedestal axis; separate fixed lower bearing; no scaling.')
    (target / 'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('PASS_SPHERE_CENTER_EXPORT',density,flush=True)
