"""Keep new moving crusher metal neutral and retain all accepted owner panels."""
import json
import shutil
import sys
import numpy as np
from PIL import Image
from production_common import ROOT, sha

source, output, predecessor = [ROOT / value for value in sys.argv[1:4]]
summary = []
for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        suffix = f'YAGRND-{theater}-{density}x'
        folder, old, target = source / suffix, predecessor / suffix, output / suffix
        target.mkdir(parents=True, exist_ok=False)
        receipt = json.loads((folder / 'candidate-review.json').read_text())
        previous = json.loads((old / 'candidate-review.json').read_text())
        painted, corrected, active_frames = 0, 0, 0
        for frame, accepted in zip(receipt['frames'], previous['frames']):
            assert (frame['member'], frame['nativeFrame'], frame['native']) == (
                accepted['member'], accepted['nativeFrame'], accepted['native'])
            for role in ('base', 'data'):
                if frame[role]:
                    shutil.copyfile(folder / frame[role], target / frame[role])
            if not frame['member'].endswith('grnd_b.shp') or not frame['base']:
                continue
            active_frames += 1
            base = np.array(Image.open(target / frame['base']))
            before = np.array(Image.open(old / accepted['base']))
            assert np.array_equal(base[..., 3], before[..., 3])
            changed = np.any(base[..., :3] != before[..., :3], axis=2) & (base[..., 3] > 0)
            # All changed RGB belongs to the separately projected neutral
            # crusher surface; body panels and floor lighting are unchanged.
            # Resolve warm shadow/rust samples as brass, rather than allowing
            # a saturated-red core to seed an owner-painted island.
            maximum = np.maximum(base[..., 1], base[..., 2]).astype(float)
            limit = np.floor(2.4 * maximum)
            fixed = changed & (base[..., 0] > limit)
            base[..., 0][fixed] = np.uint8(limit[fixed])
            data = np.array(Image.open(old / accepted['data']))
            painted += int((changed & (data[..., 0] > 0)).sum())
            data[..., :2][changed] = 0
            corrected += int(fixed.sum())
            Image.fromarray(base).save(target / frame['base'])
            Image.fromarray(data).save(target / frame['data'])
            frame.update(ownerPixels=int((data[..., 0] > 0).sum()),
                neutralSurfacePixels=int(changed.sum()), neutralRustCorrections=int(fixed.sum()),
                acceptedOwnerDataHash=sha(old / accepted['data']))
            frame['operation'] += '; changed crusher metal is explicitly neutral; every unoccluded accepted owner-panel byte is retained'
        receipt['neutralCrusherMaterial'] = {
            'activeFrames': active_frames,
            'sourceCandidateHash': sha(folder / 'candidate-review.json'),
            'acceptedCandidateHash': sha(old / 'candidate-review.json'),
            'removedMetalPaintPixels': painted, 'neutralRustCorrections': corrected,
            'boundary': 'Only changed curved crusher-surface pixels; native alpha and all fixed owner panels retained'}
        assert active_frames == 96, 'Temperate and snow must both finalize every active slot'
        (target / 'candidate-review.json').write_text(json.dumps(receipt, indent=2) + '\n')
        summary.append({'theater': theater, 'density': density,
                        **receipt['neutralCrusherMaterial']})
        print(theater, density, 'neutral metal', corrected, 'rust samples', flush=True)
(output / 'material-proof.json').write_text(json.dumps(summary, indent=2) + '\n')
