"""Protect only the original opaque logo pixels after registering it under the HD logo."""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation

root = Path(__file__).resolve().parents[2]
reference = root / 'public/res/presentation/menu-retail-reference-r3.png'
output = root / 'public/res/presentation/menu-retail-glyph-guard-r5.png'
rgb = np.asarray(Image.open(reference).convert('RGB'))
silhouette = Image.new('L', (632, 570))
draw = ImageDraw.Draw(silhouette)
draw.rectangle((196, 109, 437, 177), fill=255)
draw.polygon([(79, 146), (199, 168), (432, 168), (553, 146), (553, 230), (318, 296), (82, 231)], fill=255)
region = np.asarray(silhouette) > 0
opaque = region & (np.maximum(rgb[:, :, 1], rgb[:, :, 2]) > 24)
# Two source pixels cover bilinear sampling and the spatial filter's neighboring taps.
protected = binary_dilation(opaque, iterations=2)
Image.fromarray(np.uint8(~protected) * 255).convert('RGB').save(output)
print(json.dumps({'file': str(output.relative_to(root)), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
    'referenceSha256': hashlib.sha256(reference.read_bytes()).hexdigest(), 'protectedPixels': int(protected.sum()),
    'registration': {'offset': [245, -45], 'scale': [1.87, 1.94]},
    'method': 'Reference-colored logo pixels only, with a two-pixel sampling guard; no broad erased rectangle.'}, indent=2))
