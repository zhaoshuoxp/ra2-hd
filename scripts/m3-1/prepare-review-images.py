"""Package native screenshots losslessly; verify every decoded RGBA byte."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

root = Path(__file__).resolve().parents[2]
template = root / "docs/m3-1-review.html"
output = root / ".artifacts/m3-1/review-media"
receipt_file = output / (sys.argv[1] if len(sys.argv) > 1 else "images.json")
if receipt_file.parent != output or receipt_file.suffix != ".json":
    raise ValueError("Unexpected image receipt path")
output.mkdir(exist_ok=True)
encoder = imageio_ffmpeg.get_ffmpeg_exe()
source_html = template.read_text()
prior_file = receipt_file if receipt_file.exists() else output / "images.json"
prior = json.loads(prior_file.read_text())["images"] if prior_file.exists() else []
originals = {row["path"]: row["source"]["path"] for row in prior}
rows = []


def identity(filename):
    data = filename.read_bytes()
    return {"path": filename.relative_to(root).as_posix(), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest()}


def decoded(filename):
    result = subprocess.run([encoder, "-hide_banner", "-loglevel", "error", "-i", str(filename),
                             "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
                            check=True, capture_output=True)
    return result.stdout


for relative in dict.fromkeys(re.findall(r'<img[^>]+src="([^"]+)"', source_html)):
    filename = (template.parent / relative).resolve()
    filename.relative_to(root)
    if filename.suffix == ".webp":
        filename = root / originals[filename.relative_to(root).as_posix()]
    if filename.suffix != ".png":
        raise ValueError(f"Unexpected native screenshot format: {filename}")
    encoded = output / f"{filename.parent.name}_{filename.stem}.webp"
    subprocess.run([encoder, "-hide_banner", "-loglevel", "error", "-y", "-i", str(filename),
                    "-frames:v", "1", "-c:v", "libwebp", "-lossless", "1", "-compression_level", "6",
                    "-pix_fmt", "bgra", str(encoded)], check=True)
    native_pixels, encoded_pixels = decoded(filename), decoded(encoded)
    if native_pixels != encoded_pixels:
        raise ValueError(f"Lossless screenshot pixel mismatch: {filename}")
    row = {**identity(encoded), "source": identity(filename), "rgbaBytes": len(native_pixels),
           "rgbaSha256": hashlib.sha256(native_pixels).hexdigest(), "decodedPixelEquality": True,
           "scope": "Pixel-identical lossless packaging of actual native evidence; no resize or visual edit"}
    rows.append(row)
    source_html = source_html.replace(f'src="{relative}"', f'src="../{row["path"]}"')
    print(filename.name, row["source"]["bytes"], "->", row["bytes"], flush=True)

receipt_file.write_text(json.dumps({"status": "PASS_PIXEL_IDENTICAL_LOSSLESS_PACKAGING", "images": rows,
                                  "sourceBytes": sum(row["source"]["bytes"] for row in rows),
                                  "packagedBytes": sum(row["bytes"] for row in rows)}, indent=2) + "\n")
template.write_text(source_html)
