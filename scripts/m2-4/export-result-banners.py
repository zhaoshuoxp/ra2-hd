"""Pack text-free generated masters at the original banner's logical geometry."""
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / '.local/source-art/m2-4-result-banners-v1'
OUTPUT = ROOT / 'public/res/ui'
SOURCE.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)
generated = Path('/Users/Aone/.codex/generated_images/01a12952-7158-7751-8e8f-141015378d61')
inputs = {
    'victory': ('exec-663d505f-e599-4a88-b78f-97f6413840c1.png', (0, 118, 2018, 635)),
    'defeat': ('exec-f2e6b389-2a6f-4dea-9710-de5378bb47a9.png', (0, 116, 2032, 637)),
}
assets = []
masters = []
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
for outcome, (name, crop) in inputs.items():
    source = SOURCE / f'{outcome}-master.png'
    if not source.exists():
        shutil.copyfile(generated / name, source)
    master = Image.open(source).crop(crop).convert('RGBA')
    masters.append({'outcome': outcome, 'path': str(source.relative_to(ROOT)), 'sha256': sha(source),
                    'generatedSource': str(generated / name), 'crop': crop, 'nativeCroppedSize': master.size})
    for density in [2, 4]:
        width, height = 436 * density, 112 * density
        assert width <= master.width and height <= master.height
        image = master.resize((width, height), Image.Resampling.LANCZOS)
        mask = Image.new('L', image.size)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=3 * density, fill=255)
        image.putalpha(mask)
        file = OUTPUT / f'result-{outcome}-hd-v1-{density}x.png'
        image.save(file)
        assets.append({'outcome': outcome, 'density': density, 'file': file.name,
                       'sha256': sha(file), 'width': width, 'height': height})
family = {'schema': 'localized-result-banner-family-v1', 'logicalWidth': 436, 'logicalHeight': 112, 'assets': assets}
(ROOT / 'src/gui/hd/resultBannerSources.json').write_text(json.dumps(family, indent=2) + '\n')
(SOURCE / 'provenance.json').write_text(json.dumps({'method': 'Built-in image_gen reference reconstruction; text removed by generation; downsampled complete 2X/4X exports.',
    'reference': '.artifacts/m2-4/retail-presentation-v1/original-result-banners.png', 'masters': masters,
    'family': family, 'userAcceptance': 'PENDING_NEW_RESULT_BACKGROUNDS_ONLY'}, indent=2) + '\n')
print(json.dumps(family, indent=2))
