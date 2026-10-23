"""Compare native framebuffer shadow darkening against a no-caster control."""
from pathlib import Path
import json
import sys
import numpy as np
from PIL import Image

root = Path(sys.argv[1])
a, b, clear = [np.asarray(Image.open(root / name).convert('RGB'), dtype=float)
               for name in ['elevated-warped-before.png', 'elevated-warped-after.png', 'elevated-no-shadow.png']]

def linear(rgb):
    s = rgb / 255
    return np.where(s <= .04045, s / 12.92, ((s + .055) / 1.055) ** 2.4)

before = (linear(clear) - linear(a)).mean(axis=2)
after = (linear(clear) - linear(b)).mean(axis=2)
mask = before > .015
y, x = np.where(mask)
ratio = float(after[mask].sum() / before[mask].sum())
# Include the low-coverage PCF boundary, then require exact background parity.
region = np.zeros(mask.shape, dtype=bool)
region[y.min()-4:y.max()+5, x.min()-4:x.max()+5] = True
outside_changed = int(np.any(a[~region] != b[~region], axis=1).sum())
result = {'status': 'PASS', 'pixels': int(mask.sum()), 'linearShadowDarkeningRatio': ratio,
          'bbox': [int(x.min()), int(y.min()), int(x.max()), int(y.max())],
          'outsideShadowRegionChangedPixels': outside_changed}
assert .35 < ratio < .65, result
assert outside_changed == 0, result
(root / 'shadow-measurement.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
