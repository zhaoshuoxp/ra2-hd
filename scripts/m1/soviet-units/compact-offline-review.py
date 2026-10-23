"""Re-encode embedded PNGs losslessly; preserve every decoded RGBA pixel."""

import base64
import hashlib
import io
import json
import re
from pathlib import Path

from PIL import Image

root = Path(".artifacts/m1-7")
source = root / "review-v7/review.html"
out = root / "review-v8"
out.mkdir(exist_ok=False)
original = source.read_text()
cache = {}
images = []


def replace(match):
    uri = match.group(0)
    if uri in cache:
        return cache[uri]
    raw = base64.b64decode(uri.split(",", 1)[1], validate=True)
    image = Image.open(io.BytesIO(raw)).convert("RGBA")
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", lossless=True, exact=True, method=6)
    encoded = buffer.getvalue()
    decoded = Image.open(io.BytesIO(encoded)).convert("RGBA")
    assert decoded.size == image.size and decoded.tobytes() == image.tobytes()
    result = "data:image/webp;base64," + base64.b64encode(encoded).decode()
    cache[uri] = result
    images.append(
        {
            "pngSha256": hashlib.sha256(raw).hexdigest(),
            "rgbaSha256": hashlib.sha256(image.tobytes()).hexdigest(),
            "pngBytes": len(raw),
            "webpBytes": len(encoded),
        }
    )
    return result


page = re.sub(r"data:image/png;base64,[A-Za-z0-9+/=]+", replace, original)
(out / "review.html").write_text(page)
report = {
    "status": "PASS_LOSSLESS_EMBEDDED_IMAGES",
    "source": str(source),
    "sourceSha256": hashlib.sha256(original.encode()).hexdigest(),
    "outputSha256": hashlib.sha256(page.encode()).hexdigest(),
    "sourceBytes": len(original.encode()),
    "outputBytes": len(page.encode()),
    "uniqueEmbeddedImages": len(images),
    "images": images,
    "runtimeAcceptance": "Unchanged; packaging only",
}
(out / "offline-packaging.json").write_text(json.dumps(report, indent=2) + "\n")
print(
    f"Embedded {len(images)} images with exact RGBA equality: {len(original.encode()):,} -> {len(page.encode()):,} bytes"
)
